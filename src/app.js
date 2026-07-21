const { loadEnvFile } = require("./env");
const { createLogger, log } = require("./logger");
const { isWriteEnabled } = require("./sync-executor");
const { listSyncDomains, parseSyncDomains } = require("./sync-domains");

function createRunId() {
  return (
    "run-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid
  );
}

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
  const runId = createRunId();
  const runLog = createLogger({ runId });
  const startedAt = Date.now();

  logEnvLoad();

  const { domains, unknown } = parseSyncDomains();
  const availableDomains = listSyncDomains();

  runLog("info", "Iniciando main.js", {
    cwd: process.cwd(),
    node: process.version,
    syncWrite: isWriteEnabled(),
    domains: domains.map((domain) => domain.key),
    unknownDomains: unknown,
    availableDomains,
  });

  if (unknown.length > 0) {
    runLog("warn", "SYNC_DOMAINS contiene dominios no registrados", {
      unknown,
    });
  }

  const domainResults = [];

  for (const domain of domains) {
    const domainStartedAt = Date.now();
    const domainLog = createLogger({ runId, domain: domain.key });

    runLog("info", "Ejecutando dominio de sincronizacion", {
      domain: domain.key,
      sourceOfTruth: domain.sourceOfTruth,
      status: domain.status,
    });

    const result = await domain.runner(domainLog);
    const normalizedResult = result || {
      key: domain.key,
      summary: {
        implemented: false,
        processed: 0,
        sourceOfTruth: domain.sourceOfTruth,
      },
    };

    domainResults.push({
      key: normalizedResult.key || domain.key,
      elapsedMs: Date.now() - domainStartedAt,
      ...normalizedResult.summary,
    });
  }

  runLog("info", "Corrida finalizada", {
    domainResults,
    elapsedMs: Date.now() - startedAt,
    domains: domains.map((domain) => domain.key),
  });
}

module.exports = {
  run,
};
