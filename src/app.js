const { loadEnvFile } = require("./env");
const { log } = require("./logger");
const {
  createPrestaClient,
  hasPrestaConfig,
  inspectProductByReference,
} = require("./prestashop");
const { writeRunReports } = require("./report");
const { readSapArticles } = require("./sap");
const { executeSyncAction, isWriteEnabled } = require("./sync-executor");
const { buildActionPayload } = require("./sync-plan");

function logEnvLoad() {
  const result = loadEnvFile(".env.local", { override: false });
  if (result.found) {
    log("info", ".env.local cargado");
    return;
  }

  log("warn", "No encontre .env.local", { file: result.file });
}

function logComparison(article, inspection) {
  const modeNote = isWriteEnabled()
    ? "Modo escritura activo. Si la accion aplica, el cambio se intentara ejecutar."
    : "Modo dry-run. No se envio ningun cambio.";
  const selectedTarget =
    inspection.bestMatch.kind === "combination"
      ? {
          kind: inspection.bestMatch.kind,
          reason: inspection.bestMatch.reason,
          combinationId: inspection.bestMatch.combination.id,
          combinationReference: inspection.bestMatch.combination.reference,
          combinationPrice: inspection.bestMatch.combination.price,
          optionValues: inspection.bestMatch.combination.optionValues || [],
          stockQuantity: inspection.bestMatch.stock
            ? inspection.bestMatch.stock.quantity
            : null,
        }
      : {
          kind: inspection.bestMatch.kind,
          reason: inspection.bestMatch.reason,
          stockQuantity: inspection.bestMatch.stock
            ? inspection.bestMatch.stock.quantity
            : null,
        };

  log("info", "Comparacion SAP vs PrestaShop", {
    itemCode: article.itemCode,
    sapPrice: article.price,
    prestashopProductPrice: inspection.productPrice,
    sapStock: article.stock,
    selectedTarget,
    note: modeNote,
  });
}

function roundDiff(value) {
  return Math.round(value * 10000) / 10000;
}

function buildMetrics(article, inspection) {
  const selectedPrice =
    inspection.bestMatch.kind === "combination"
      ? inspection.bestMatch.combination.price
      : inspection.productPrice;
  const selectedStock = inspection.bestMatch.stock
    ? inspection.bestMatch.stock.quantity
    : null;
  const priceDiff =
    selectedPrice === null || selectedPrice === undefined
      ? null
      : roundDiff(article.price - selectedPrice);
  const stockDiff =
    selectedStock === null || selectedStock === undefined
      ? null
      : roundDiff(article.stock - selectedStock);
  const isPriceEqual = priceDiff === 0;
  const isStockEqual = stockDiff === 0;

  return {
    selectedPrice,
    selectedStock,
    priceDiff,
    stockDiff,
    isPriceEqual,
    isStockEqual,
  };
}

function buildSyncPlan(status, metrics, isCombination) {
  if (status === "create_from_sap") {
    return {
      action: "create_product",
      syncPrice: true,
      syncStock: true,
      syncName: true,
      reason: "missing_in_prestashop",
    };
  }

  if (status === "matched_combination_review" || isCombination) {
    return {
      action: "review_combination_mapping",
      syncPrice: metrics.isPriceEqual === false,
      syncStock: metrics.isStockEqual === false,
      syncName: false,
      reason: "combination_requires_review",
    };
  }

  if (status === "matched_product_ok") {
    return {
      action: "skip_no_change",
      syncPrice: false,
      syncStock: false,
      syncName: false,
      reason: "already_in_sync",
    };
  }

  const syncPrice = metrics.isPriceEqual === false;
  const syncStock = metrics.isStockEqual === false;

  let action = "update_product";
  if (syncPrice && syncStock) {
    action = "update_product_price_and_stock";
  } else if (syncPrice) {
    action = "update_product_price";
  } else if (syncStock) {
    action = "update_product_stock";
  }

  return {
    action,
    syncPrice,
    syncStock,
    syncName: false,
    reason: "existing_product_diff",
  };
}

function buildResultRow(article, inspection) {
  const isCombination = inspection.bestMatch.kind === "combination";
  const metrics = buildMetrics(article, inspection);
  const needsReview =
    isCombination ||
    !metrics.isPriceEqual ||
    !metrics.isStockEqual ||
    inspection.matchCount !== 1;
  const status = isCombination
    ? "matched_combination_review"
    : metrics.isPriceEqual && metrics.isStockEqual
      ? "matched_product_ok"
      : "matched_product_diff";
  const syncPlan = buildSyncPlan(status, metrics, isCombination);
  const baseRow = {
    status,
    action: syncPlan.action,
    actionReason: syncPlan.reason,
    syncPrice: syncPlan.syncPrice,
    syncStock: syncPlan.syncStock,
    syncName: syncPlan.syncName,
    blockedReason: "",
    payloadSummary: "",
    actionPayload: {},
    needsReview,
    itemCode: article.itemCode,
    itemName: article.itemName,
    sapPrice: article.price,
    sapStock: article.stock,
    productId: inspection.productId,
    productReference: inspection.reference,
    productPrice: inspection.productPrice,
    selectedKind: inspection.bestMatch.kind,
    selectedReason: inspection.bestMatch.reason,
    selectedCombinationId: isCombination
      ? inspection.bestMatch.combination.id
      : null,
    selectedCombinationReference: isCombination
      ? inspection.bestMatch.combination.reference
      : "",
    selectedCombinationPrice: isCombination
      ? inspection.bestMatch.combination.price
      : null,
    selectedStockQuantity: inspection.bestMatch.stock
      ? inspection.bestMatch.stock.quantity
      : null,
    priceDiff: metrics.priceDiff,
    stockDiff: metrics.stockDiff,
    isPriceEqual: metrics.isPriceEqual,
    isStockEqual: metrics.isStockEqual,
    matchCount: inspection.matchCount,
    error: "",
  };

  const actionPayload = buildActionPayload(baseRow, article);

  return {
    ...baseRow,
    blockedReason: actionPayload.blockedReason,
    payloadSummary: actionPayload.payloadSummary,
    actionPayload: actionPayload.payload,
  };
}

async function run() {
  logEnvLoad();

  log("info", "Iniciando main.js", {
    cwd: process.cwd(),
    node: process.version,
    syncWrite: isWriteEnabled(),
  });

  const articles = readSapArticles(log);

  if (!hasPrestaConfig()) {
    log(
      "warn",
      "Variables PrestaShop no configuradas. Termina luego de leer SAP.",
    );
    return;
  }

  const prestaClient = createPrestaClient(log);
  const results = [];

  for (const article of articles) {
    try {
      const inspection = await inspectProductByReference(
        prestaClient,
        article,
        log,
      );

      if (!inspection) {
        log("info", "Articulo SAP sin coincidencia en PrestaShop", {
          itemCode: article.itemCode,
          sapPrice: article.price,
          sapStock: article.stock,
          action: "create_product",
        });

        const createdRow = {
          status: "create_from_sap",
          action: "create_product",
          actionReason: "missing_in_prestashop",
          syncPrice: true,
          syncStock: true,
          syncName: true,
          blockedReason: "",
          payloadSummary: "",
          actionPayload: {},
          needsReview: false,
          itemCode: article.itemCode,
          itemName: article.itemName,
          sapPrice: article.price,
          sapStock: article.stock,
          productId: null,
          productReference: "",
          productPrice: null,
          selectedKind: "",
          selectedReason: "not_found",
          selectedCombinationId: null,
          selectedCombinationReference: "",
          selectedCombinationPrice: null,
          selectedStockQuantity: null,
          priceDiff: null,
          stockDiff: null,
          isPriceEqual: false,
          isStockEqual: false,
          matchCount: 0,
          error: "",
        };
        const actionPayload = buildActionPayload(createdRow, article);
        createdRow.blockedReason = actionPayload.blockedReason;
        createdRow.payloadSummary = actionPayload.payloadSummary;
        createdRow.actionPayload = actionPayload.payload;
        if (actionPayload.blockedReason) {
          createdRow.needsReview = true;
        }
        createdRow.execution = await executeSyncAction(
          prestaClient,
          createdRow,
          log,
        );
        log("info", "Resultado de sincronizacion", {
          itemCode: createdRow.itemCode,
          action: createdRow.action,
          status: createdRow.execution.status,
          details: createdRow.execution.details,
          payloadSummary: createdRow.payloadSummary,
          productId: createdRow.execution.productId || null,
        });
        results.push(createdRow);
        continue;
      }

      log("debug", "Producto PrestaShop", {
        productId: inspection.productId,
        reference: inspection.reference,
        active: inspection.active,
        defaultCategory: inspection.defaultCategory,
        productPrice: inspection.productPrice,
        combinationIds: inspection.combinationIds,
        stockIds: inspection.stockIds,
        combinations: inspection.combinations,
        stockAvailables: inspection.stockAvailables,
      });

      logComparison(article, inspection);
      const row = buildResultRow(article, inspection);
      row.execution = await executeSyncAction(prestaClient, row, log);
      log("info", "Resultado de sincronizacion", {
        itemCode: row.itemCode,
        action: row.action,
        status: row.execution.status,
        details: row.execution.details,
        payloadSummary: row.payloadSummary,
        productId: row.productId || row.execution.productId || null,
      });
      results.push(row);
    } catch (error) {
      log("error", "Fallo inspeccionando articulo", {
        itemCode: article.itemCode,
        name: error.name,
        message: error.message,
        code: error.code || null,
      });

      results.push({
        status: "error",
        action: "review_error",
        actionReason: "inspection_error",
        syncPrice: false,
        syncStock: false,
        syncName: false,
        blockedReason: "",
        payloadSummary: "",
        actionPayload: {},
        needsReview: true,
        itemCode: article.itemCode,
        itemName: article.itemName,
        sapPrice: article.price,
        sapStock: article.stock,
        productId: null,
        productReference: "",
        productPrice: null,
        selectedKind: "",
        selectedReason: "error",
        selectedCombinationId: null,
        selectedCombinationReference: "",
        selectedCombinationPrice: null,
        selectedStockQuantity: null,
        priceDiff: null,
        stockDiff: null,
        isPriceEqual: false,
        isStockEqual: false,
        matchCount: 0,
        error: error.message,
        execution: {
          mode: isWriteEnabled() ? "write" : "dry_run",
          executed: false,
          status: "failed_before_execute",
          details: error.message,
        },
      });
    }
  }

  writeRunReports(log, results);
}

module.exports = {
  run,
};
