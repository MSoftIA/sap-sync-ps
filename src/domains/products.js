const {
  buildPrestaCatalogSnapshot,
  createPrestaClient,
  hasPrestaConfig,
  inspectProductByReferenceCached,
} = require("../prestashop");
const { numberEnv } = require("../env");
const { readSapArticles } = require("../sap");
const { executeSyncAction, isWriteEnabled } = require("../sync-executor");
const { buildActionPayload } = require("../sync-plan");

function logComparison(log, article, inspection) {
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

function normalizeName(str) {
  return String(str || "").trim().toLowerCase();
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
  const isNameEqual =
    inspection.bestMatch.kind === "combination"
      ? true
      : normalizeName(article.itemName) === normalizeName(inspection.name);

  return {
    selectedPrice,
    selectedStock,
    priceDiff,
    stockDiff,
    isPriceEqual,
    isStockEqual,
    isNameEqual,
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
    if (!metrics.isNameEqual) {
      return {
        action: "update_product_name",
        syncPrice: false,
        syncStock: false,
        syncName: true,
        reason: "name_mismatch",
      };
    }
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
  const syncName = !metrics.isNameEqual;

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
    syncName,
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
    selectedStockId: inspection.bestMatch.stock
      ? inspection.bestMatch.stock.id
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

function shouldLogProgress(index, total) {
  if (total <= 100) {
    return true;
  }

  if (index === 0 || index === total - 1) {
    return true;
  }

  return (index + 1) % 25 === 0;
}

function getSyncConcurrency() {
  const configured = numberEnv("SYNC_CONCURRENCY", 0);
  if (configured > 0) {
    return Math.max(1, Math.floor(configured));
  }

  return isWriteEnabled() ? 2 : 6;
}

function createProductMetrics() {
  return {
    inspected: 0,
    createdCandidates: 0,
    matchedProducts: 0,
    reviewCandidates: 0,
    errors: 0,
    executed: 0,
    skipped: 0,
    blocked: 0,
    phaseMs: {
      inspection: 0,
      planning: 0,
      execution: 0,
    },
  };
}

function applyExecutionMetrics(metrics, row) {
  if (row.execution && row.execution.executed) {
    metrics.executed += 1;
  } else if (row.execution && row.execution.status === "blocked") {
    metrics.blocked += 1;
  } else if (row.execution && row.execution.status === "skipped") {
    metrics.skipped += 1;
  }
}

function summarizeMetrics(metrics, totalArticles) {
  return {
    totalArticles,
    inspected: metrics.inspected,
    createdCandidates: metrics.createdCandidates,
    matchedProducts: metrics.matchedProducts,
    reviewCandidates: metrics.reviewCandidates,
    errors: metrics.errors,
    executed: metrics.executed,
    skipped: metrics.skipped,
    blocked: metrics.blocked,
    phaseMs: metrics.phaseMs,
  };
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => consume()));

  return results;
}

async function runProductDomain(log) {
  const domainStartedAt = Date.now();
  const metrics = createProductMetrics();
  const syncConcurrency = getSyncConcurrency();

  log("info", "Dominio products iniciado", {
    writeEnabled: isWriteEnabled(),
    sourceOfTruth: "sap",
    syncConcurrency,
  });

  const articles = readSapArticles(log);
  const totalArticles = articles.length;

  log("info", "Plan de corrida de products", {
    domain: "products",
    mode: isWriteEnabled() ? "write" : "dry_run",
    total: totalArticles,
    syncConcurrency,
  });

  if (!hasPrestaConfig()) {
    log(
      "warn",
      "Variables PrestaShop no configuradas. Termina luego de leer SAP.",
    );
    return {
      key: "products",
      summary: {
        implemented: true,
        processed: 0,
        sourceOfTruth: "sap",
        skippedReason: "missing_prestashop_config",
      },
    };
  }

  const prestaClient = createPrestaClient(log);
  const snapshotStartedAt = Date.now();
  const prestaSnapshot = await buildPrestaCatalogSnapshot(prestaClient, log);
  metrics.phaseMs.inspection += Date.now() - snapshotStartedAt;
  let completed = 0;

  const results = await runWithConcurrency(
    articles,
    async (article, index) => {
      const inspectionStartedAt = Date.now();

      try {
        const inspection = await inspectProductByReferenceCached(
          prestaClient,
          prestaSnapshot,
          article,
          log,
        );
        metrics.phaseMs.inspection += Date.now() - inspectionStartedAt;
        metrics.inspected += 1;

        if (!inspection) {
          log("info", "Articulo SAP sin coincidencia en PrestaShop", {
            itemCode: article.itemCode,
            sapPrice: article.price,
            sapStock: article.stock,
            action: "create_product",
          });

          const planningStartedAt = Date.now();
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
            selectedStockId: null,
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
          metrics.phaseMs.planning += Date.now() - planningStartedAt;

          const executionStartedAt = Date.now();
          createdRow.execution = await executeSyncAction(
            prestaClient,
            createdRow,
            log,
          );
          metrics.phaseMs.execution += Date.now() - executionStartedAt;

          metrics.createdCandidates += 1;
          if (createdRow.needsReview) {
            metrics.reviewCandidates += 1;
          }
          applyExecutionMetrics(metrics, createdRow);

          log("info", "Resultado de sincronizacion", {
            itemCode: createdRow.itemCode,
            action: createdRow.action,
            status: createdRow.execution.status,
            details: createdRow.execution.details,
            payloadSummary: createdRow.payloadSummary,
            productId: createdRow.execution.productId || null,
          });
          return createdRow;
        }

        log("debug", "Producto PrestaShop", {
          productId: inspection.productId,
          reference: inspection.reference,
          active: inspection.active,
          defaultCategory: inspection.defaultCategory,
          productPrice: inspection.productPrice,
          combinationIds: inspection.combinationIds,
          stockIds: inspection.stockIds,
          combinationCount: inspection.combinations.length,
          stockRowCount: inspection.stockAvailables.length,
        });

        logComparison(log, article, inspection);

        log("info", "Comparacion de nombre", {
          itemCode: article.itemCode,
          sapName: article.itemName,
          psName: inspection.name,
          isEqual: normalizeName(article.itemName) === normalizeName(inspection.name),
        });

        const planningStartedAt = Date.now();
        const row = buildResultRow(article, inspection);
        metrics.phaseMs.planning += Date.now() - planningStartedAt;

        log("info", "Plan de sincronizacion", {
          itemCode: row.itemCode,
          action: row.action,
          syncPrice: row.syncPrice,
          syncStock: row.syncStock,
          syncName: row.syncName,
          blockedReason: row.blockedReason || null,
          payloadSummary: row.payloadSummary,
        });

        const executionStartedAt = Date.now();
        row.execution = await executeSyncAction(prestaClient, row, log);
        metrics.phaseMs.execution += Date.now() - executionStartedAt;

        metrics.matchedProducts += 1;
        if (row.needsReview) {
          metrics.reviewCandidates += 1;
        }
        applyExecutionMetrics(metrics, row);

        log("info", "Resultado de sincronizacion", {
          itemCode: row.itemCode,
          action: row.action,
          status: row.execution.status,
          details: row.execution.details,
          payloadSummary: row.payloadSummary,
          productId: row.productId || row.execution.productId || null,
        });
        return row;
      } catch (error) {
        metrics.phaseMs.inspection += Date.now() - inspectionStartedAt;
        metrics.errors += 1;

        log("error", "Fallo inspeccionando articulo", {
          itemCode: article.itemCode,
          name: error.name,
          message: error.message,
          code: error.code || null,
        });

        return {
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
          selectedStockId: null,
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
        };
      } finally {
        completed += 1;

        if (shouldLogProgress(completed - 1, totalArticles)) {
          const percent =
            totalArticles > 0
              ? Math.round((completed / totalArticles) * 100)
              : 0;

          log("info", "Progreso de dominio", {
            domain: "products",
            current: completed,
            total: totalArticles,
            percent,
            itemCode: article.itemCode,
            syncConcurrency,
          });
        }
      }
    },
    syncConcurrency,
  );

  log("info", "Metricas de dominio products", {
    domain: "products",
    elapsedMs: Date.now() - domainStartedAt,
    ...summarizeMetrics(metrics, totalArticles),
  });

  log("info", "Dominio products finalizado", {
    processed: results.length,
    domain: "products",
    current: totalArticles,
    total: totalArticles,
    percent: totalArticles > 0 ? 100 : 0,
    elapsedMs: Date.now() - domainStartedAt,
    syncConcurrency,
  });

  return {
    key: "products",
    summary: {
      implemented: true,
      processed: results.length,
      sourceOfTruth: "sap",
      syncConcurrency,
      metrics: summarizeMetrics(metrics, totalArticles),
    },
  };
}

module.exports = {
  runProductDomain,
};
