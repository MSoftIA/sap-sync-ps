const { loadEnvFile } = require("./env");
const { log } = require("./logger");
const {
  createPrestaClient,
  hasPrestaConfig,
  inspectProductByReference,
} = require("./prestashop");
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

  for (const article of articles) {
    const inspection = await inspectProductByReference(
      prestaClient,
      article,
      log,
    );
    if (!inspection) continue;

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
  }
}

module.exports = {
  run,
};
