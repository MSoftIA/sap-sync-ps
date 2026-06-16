const fs = require("node:fs");
const path = require("node:path");

const { env } = require("./env");

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function createRunReportPaths() {
  const reportDir = env("REPORT_DIR", "reports");
  const baseName = env("REPORT_BASENAME", "sap-prestashop-diagnostic");
  const timestamp = timestampForFile();
  const dir = path.join(process.cwd(), reportDir);

  ensureDir(dir);

  return {
    dir,
    summaryPath: path.join(dir, `${baseName}-${timestamp}.summary.json`),
    rowsPath: path.join(dir, `${baseName}-${timestamp}.rows.json`),
    csvPath: path.join(dir, `${baseName}-${timestamp}.rows.csv`),
  };
}

function buildSummary(results) {
  const summary = {
    total: results.length,
    matchedProductOk: 0,
    matchedProductDiff: 0,
    matchedCombinationReview: 0,
    createFromSap: 0,
    needsReview: 0,
    errors: 0,
  };

  for (const result of results) {
    if (result.needsReview) summary.needsReview += 1;
    if (result.status === "matched_product_ok") summary.matchedProductOk += 1;
    else if (result.status === "matched_product_diff")
      summary.matchedProductDiff += 1;
    else if (result.status === "matched_combination_review")
      summary.matchedCombinationReview += 1;
    else if (result.status === "create_from_sap") summary.createFromSap += 1;
    else if (result.status === "error") summary.errors += 1;
  }

  return summary;
}

function toCsvRows(results) {
  const headers = [
    "status",
    "action",
    "actionReason",
    "syncPrice",
    "syncStock",
    "syncName",
    "blockedReason",
    "payloadSummary",
    "needsReview",
    "itemCode",
    "itemName",
    "sapPrice",
    "sapStock",
    "productId",
    "productReference",
    "productPrice",
    "selectedKind",
    "selectedReason",
    "selectedCombinationId",
    "selectedCombinationReference",
    "selectedCombinationPrice",
    "selectedStockQuantity",
    "priceDiff",
    "stockDiff",
    "isPriceEqual",
    "isStockEqual",
    "error",
  ];

  const lines = [headers.join(",")];

  for (const result of results) {
    const row = [
      result.status,
      result.action,
      result.actionReason,
      result.syncPrice,
      result.syncStock,
      result.syncName,
      result.blockedReason,
      result.payloadSummary,
      result.needsReview,
      result.itemCode,
      result.itemName,
      result.sapPrice,
      result.sapStock,
      result.productId,
      result.productReference,
      result.productPrice,
      result.selectedKind,
      result.selectedReason,
      result.selectedCombinationId,
      result.selectedCombinationReference,
      result.selectedCombinationPrice,
      result.selectedStockQuantity,
      result.priceDiff,
      result.stockDiff,
      result.isPriceEqual,
      result.isStockEqual,
      result.error,
    ].map(csvEscape);

    lines.push(row.join(","));
  }

  return lines.join("\n");
}

function writeRunReports(log, results) {
  const paths = createRunReportPaths();
  const summary = buildSummary(results);

  fs.writeFileSync(
    paths.summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recommendedActions: {
          createProduct: results.filter(
            (item) => item.action === "create_product",
          ).length,
          updateProductPrice: results.filter(
            (item) => item.action === "update_product_price",
          ).length,
          updateProductStock: results.filter(
            (item) => item.action === "update_product_stock",
          ).length,
          updateProductPriceAndStock: results.filter(
            (item) => item.action === "update_product_price_and_stock",
          ).length,
          skipNoChange: results.filter(
            (item) => item.action === "skip_no_change",
          ).length,
          reviewCombinationMapping: results.filter(
            (item) => item.action === "review_combination_mapping",
          ).length,
          reviewError: results.filter((item) => item.action === "review_error")
            .length,
          blocked: results.filter((item) => item.blockedReason).length,
        },
        summary,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  fs.writeFileSync(
    paths.rowsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rows: results,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  fs.writeFileSync(paths.csvPath, toCsvRows(results) + "\n", "utf8");

  log("info", "Reportes generados", {
    summaryPath: paths.summaryPath,
    rowsPath: paths.rowsPath,
    csvPath: paths.csvPath,
    summary,
  });

  return { paths, summary };
}

module.exports = {
  writeRunReports,
};
