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

function buildResultRow(article, inspection) {
  const isCombination = inspection.bestMatch.kind === "combination";

  return {
    status: isCombination ? "matched_combination" : "matched_product",
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
          status: "not_found",
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
