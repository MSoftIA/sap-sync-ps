const { loadEnvFile } = require("./env");
const { log } = require("./logger");
const { writeRunReports } = require("./report");
const { isWriteEnabled } = require("./sync-executor");
const { listSyncDomains, parseSyncDomains } = require("./sync-domains");

function logEnvLoad() {
  const result = loadEnvFile(".env.local", { override: false });
  if (result.found) {
    log("info", ".env.local cargado", {
      file: result.file,
      effectiveSapItemCode: process.env.SAP_ITEM_CODE || "",
      effectiveSapLimit: process.env.SAP_LIMIT || "",
      effectiveSyncWrite: process.env.SYNC_WRITE || "",
      effectiveSyncDomains: process.env.SYNC_DOMAINS || "",
    });
    return;
  }

  log("warn", "No encontre .env.local", { file: result.file });
}

async function run() {
  logEnvLoad();

  const { domains, unknown } = parseSyncDomains();
  const availableDomains = listSyncDomains();

  log("info", "Iniciando main.js", {
    cwd: process.cwd(),
    node: process.version,
    syncWrite: isWriteEnabled(),
    domains: domains.map((domain) => domain.key),
    unknownDomains: unknown,
    availableDomains,
  });

  if (unknown.length > 0) {
    log("warn", "SYNC_DOMAINS contiene dominios no registrados", {
      unknown,
    });
  }

  let reportRows = [];
  const domainResults = [];

  for (const domain of domains) {
    log("info", "Ejecutando dominio de sincronizacion", {
      domain: domain.key,
      sourceOfTruth: domain.sourceOfTruth,
      status: domain.status,
    });

    const result = await domain.runner(log);
    const normalizedResult = result || {
      key: domain.key,
      reportRows: [],
      summary: {
        implemented: false,
        processed: 0,
        sourceOfTruth: domain.sourceOfTruth,
        writesReports: domain.writesReports,
      },
    };

    domainResults.push({
      key: normalizedResult.key || domain.key,
      ...normalizedResult.summary,
    });

    if (domain.writesReports) {
      reportRows = normalizedResult.reportRows || [];
    }
  }

  log("info", "Resumen de dominios ejecutados", {
    domainResults,
  });

  if (reportRows.length > 0) {
    writeRunReports(log, reportRows);
    return;
  }

  log("info", "No se generaron reportes de productos en esta corrida", {
    domains: domains.map((domain) => domain.key),
  });
}

module.exports = {
  run,
};
