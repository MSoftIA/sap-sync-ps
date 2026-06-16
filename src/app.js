const { loadEnvFile } = require("./env");
const { log } = require("./logger");
const {
  createPrestaClient,
  hasPrestaConfig,
  inspectProductByReference,
} = require("./prestashop");
const { writeRunReports } = require("./report");
const { readSapArticles } = require("./sap");

function logEnvLoad() {
  const result = loadEnvFile();
  if (result.found) {
    log("info", ".env.local cargado");
    return;
  }

  log("warn", "No encontre .env.local", { file: result.file });
}

function logComparison(article, inspection) {
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
    note: "Solo lectura. No se envio ningun cambio.",
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

  return {
    status,
    action: "update_existing",
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
}

async function run() {
  log("info", "Iniciando main.js", {
    cwd: process.cwd(),
    node: process.version,
  });

  logEnvLoad();

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
        results.push({
          status: "create_from_sap",
          action: "create_in_prestashop",
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
        });
        continue;
      }

      log("data", "Producto PrestaShop", {
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
      results.push(buildResultRow(article, inspection));
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
      });
    }
  }

  writeRunReports(log, results);
}

module.exports = {
  run,
};
