const { writeDomainSnapshot } = require("../report");
const { readSapCategoryDiagnostics } = require("../sap");

function buildGroupBreakdown(rows) {
  const counters = new Map();

  for (const row of rows) {
    const key = `${row.itemGroupCode}::${row.itemGroupName}`;
    const current = counters.get(key) || {
      itemGroupCode: row.itemGroupCode,
      itemGroupName: row.itemGroupName,
      total: 0,
    };
    current.total += 1;
    counters.set(key, current);
  }

  return [...counters.values()].sort((a, b) => b.total - a.total);
}

function buildPropertyBreakdown(rows) {
  const counters = new Map();

  for (const row of rows) {
    row.activePropertyCodes.forEach((code, index) => {
      const key = String(code);
      const current = counters.get(key) || {
        propertyCode: code,
        propertyName: row.activePropertyNames[index] || `QryGroup${code}`,
        total: 0,
      };
      current.total += 1;
      counters.set(key, current);
    });
  }

  return [...counters.values()].sort((a, b) => b.total - a.total);
}

function buildCategorySummary(rows, propertyCatalog) {
  const groupBreakdown = buildGroupBreakdown(rows);
  const propertyBreakdown = buildPropertyBreakdown(rows);
  const rowsWithoutMainCategory = rows.filter(
    (row) =>
      row.status === "missing_main_category" ||
      !String(row.itemGroupName || "").trim(),
  );

  return {
    total: rows.length,
    rowsWithMainCategory: rows.length - rowsWithoutMainCategory.length,
    rowsWithoutMainCategory: rowsWithoutMainCategory.length,
    uniqueMainCategories: groupBreakdown.length,
    uniqueActiveProperties: propertyBreakdown.length,
    propertyCatalogSize: propertyCatalog.length,
    topMainCategories: groupBreakdown.slice(0, 10),
    topProperties: propertyBreakdown.slice(0, 10),
  };
}

function toDiagnosticRow(row) {
  return {
    status: row.hasMainCategory
      ? "category_candidate"
      : "missing_main_category",
    itemCode: row.itemCode,
    itemName: row.itemName,
    itemGroupCode: row.itemGroupCode,
    itemGroupName: row.itemGroupName,
    activePropertyCount: row.activePropertyCount,
    activePropertyCodes: row.activePropertyCodes,
    activePropertyNames: row.activePropertyNames,
    proposedPrestaCategory: row.proposedPrestaCategory,
    proposedPrestaCategoryPath: row.proposedPrestaCategoryPath,
    notes: row.hasMainCategory
      ? "Categoria principal propuesta desde OITB. Propiedades QryGroup incluidas solo como diagnostico."
      : "Articulo sin grupo principal SAP.",
  };
}

async function runCategoryDomain(log) {
  log("info", "Dominio categories iniciado", {
    sourceOfTruth: "sap",
    mode: "diagnostic",
  });

  const { propertyCatalog, diagnostics } = readSapCategoryDiagnostics(log);
  const rows = diagnostics.map(toDiagnosticRow);
  log("info", "Plan de corrida de categories", {
    domain: "categories",
    mode: "diagnostic",
    total: rows.length,
  });
  log("info", "Progreso de dominio", {
    domain: "categories",
    current: rows.length,
    total: rows.length,
    percent: rows.length > 0 ? 100 : 0,
  });
  const summary = buildCategorySummary(rows, propertyCatalog);
  const report = writeDomainSnapshot(log, {
    domain: "categories",
    summary,
    rows,
    csvHeaders: [
      "status",
      "itemCode",
      "itemName",
      "itemGroupCode",
      "itemGroupName",
      "activePropertyCount",
      "activePropertyCodes",
      "activePropertyNames",
      "proposedPrestaCategory",
      "proposedPrestaCategoryPath",
      "notes",
    ],
  });

  log("info", "Dominio categories finalizado", {
    processed: rows.length,
    uniqueMainCategories: summary.uniqueMainCategories,
    uniqueActiveProperties: summary.uniqueActiveProperties,
  });

  return {
    key: "categories",
    reportRows: [],
    summary: {
      implemented: true,
      processed: rows.length,
      sourceOfTruth: "sap",
      writesReports: false,
      diagnosticOnly: true,
      reportPaths: report.paths,
      categorySummary: summary,
    },
  };
}

module.exports = {
  runCategoryDomain,
};
