"use strict";

const { loadEnvFile, env } = require("./src/env");
loadEnvFile(".env.local", { override: false });

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  createPrestaClient,
  hasPrestaConfig,
  inspectProductByReferenceValue,
  readPrestaProductsPage,
  readPrestaOverview,
  updatePrestaProductActive,
} = require("./src/prestashop");
const {
  readSapArticleByCode,
  readSapOrdersOverview,
  readSapOverview,
  readSapProductsPage,
} = require("./src/sap");
const { log } = require("./src/logger");
const { listSyncDomains } = require("./src/sync-domains");

const app = express();
const PORT = env("UI_PORT", "3000");

let activeSync = null;
let overviewCache = {
  updatedAt: 0,
  payload: null,
};
const MAX_SYNC_LOG_LINES = 5000;

app.use(express.static(path.join(__dirname, "dist")));
app.use(express.json());

function createSseClient(res) {
  const keepAliveTimer = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {}
  }, 15000);

  return {
    res,
    keepAliveTimer,
  };
}

function sendSse(client, obj) {
  try {
    client.res.write(`data: ${JSON.stringify(obj)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function closeSseClient(client) {
  clearInterval(client.keepAliveTimer);
}

function attachSyncClient(syncState, client) {
  syncState.clients.add(client);

  sendSse(client, {
    type: "status",
    running: true,
    attached: true,
    startedAt: syncState.startedAt,
  });

  for (const entry of syncState.logBuffer) {
    sendSse(client, entry);
  }
}

function broadcastSync(syncState, obj) {
  for (const client of [...syncState.clients]) {
    const ok = sendSse(client, obj);
    if (!ok) {
      closeSseClient(client);
      syncState.clients.delete(client);
    }
  }
}

function pushSyncLog(syncState, entry) {
  syncState.logBuffer.push(entry);
  if (syncState.logBuffer.length > MAX_SYNC_LOG_LINES) {
    syncState.logBuffer.shift();
  }
  broadcastSync(syncState, entry);
}

function buildContrast(sap, prestashop) {
  if (!sap || !prestashop || sap.error || prestashop.error) {
    return null;
  }

  return {
    productGap: sap.totalProducts - prestashop.totalProducts,
    activeGap: sap.activeProducts - prestashop.activeProducts,
    inactiveGap: sap.inactiveProducts - prestashop.inactiveProducts,
    missingProductsInPrestashop: Math.max(
      sap.totalProducts - prestashop.totalProducts,
      0,
    ),
    extraProductsInPrestashop: Math.max(
      prestashop.totalProducts - sap.totalProducts,
      0,
    ),
    activeProductsMissingInPrestashop: Math.max(
      sap.activeProducts - prestashop.activeProducts,
      0,
    ),
    inactiveProductsExtraInPrestashop: Math.max(
      prestashop.inactiveProducts - sap.inactiveProducts,
      0,
    ),
    sapHasMoreProducts: sap.totalProducts > prestashop.totalProducts,
    sapHasFewerProducts: sap.totalProducts < prestashop.totalProducts,
  };
}

function getLatestReport() {
  const reportDir = path.join(process.cwd(), env("REPORT_DIR", "reports"));
  const files = fs
    .readdirSync(reportDir)
    .filter((f) => f.endsWith(".summary.json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  return JSON.parse(fs.readFileSync(path.join(reportDir, files[0]), "utf8"));
}

function listSummaryFiles() {
  const reportDir = path.join(process.cwd(), env("REPORT_DIR", "reports"));

  try {
    return fs
      .readdirSync(reportDir)
      .filter((f) => f.endsWith(".summary.json"))
      .sort()
      .reverse()
      .map((file) => path.join(reportDir, file));
  } catch {
    return [];
  }
}

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getLatestDomainSummary(domainKey) {
  const files = listSummaryFiles();

  if (domainKey === "products") {
    for (const filePath of files) {
      const payload = readJsonFileSafe(filePath);
      if (!payload) continue;
      if (!payload.domain && payload.summary) {
        return payload;
      }
    }
    return null;
  }

  for (const filePath of files) {
    const payload = readJsonFileSafe(filePath);
    if (!payload) continue;
    if (payload.domain === domainKey && payload.summary) {
      return payload;
    }
  }

  return null;
}

function buildDomainAnalysisSummary() {
  const products = getLatestDomainSummary("products");
  const categories = getLatestDomainSummary("categories");
  const orderReport = getLatestDomainSummary("orders");
  let sapOverview = null;
  let orders = null;

  try {
    sapOverview = readSapOverview(log);
  } catch {}

  try {
    orders = readSapOrdersOverview(log);
  } catch (error) {
    orders = {
      error: error.message,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    domains: {
      products: products
        ? {
            key: "products",
            available: true,
            generatedAt: products.generatedAt || null,
            summary: products.summary || {},
            recommendedActions: products.recommendedActions || {},
          }
        : {
            key: "products",
            available: false,
            summary: null,
            recommendedActions: null,
          },
      categories: categories
        ? {
            key: "categories",
            available: true,
            generatedAt: categories.generatedAt || null,
            summary: categories.summary || {},
            alignment: sapOverview
              ? {
                  expectedOperationalCatalog: sapOverview.totalProducts,
                  reportCatalog: Number(categories.summary?.total || 0),
                  isAligned:
                    Number(categories.summary?.total || 0) ===
                    Number(sapOverview.totalProducts || 0),
                }
              : null,
          }
        : {
            key: "categories",
            available: false,
            summary: null,
          },
      orders:
        orderReport
          ? {
              key: "orders",
              available: true,
              generatedAt: orderReport.generatedAt || null,
              summary: orderReport.summary || {},
              note:
                "Lectura operativa de pedidos desde SAP. La escritura en PrestaShop sigue bloqueada hasta definir el flujo funcional.",
            }
          : orders && !orders.error
          ? {
              key: "orders",
              available: true,
              generatedAt: new Date().toISOString(),
              summary: orders,
              note: "Lectura operativa de pedidos desde SAP. Aun no escribe en PrestaShop.",
            }
          : {
              key: "orders",
              available: false,
              summary: null,
              note:
                (orders && orders.error) ||
                "No se pudo leer el resumen de pedidos desde SAP.",
            },
    },
  };
}

function buildExecutiveSummary(overview, latestReport) {
  const summary = latestReport ? latestReport.summary || {} : {};
  const actions = latestReport ? latestReport.recommendedActions || {} : {};
  const contrast = overview ? overview.contrast : null;

  const sampleSize = summary.total || 0;
  const createCount = actions.createProduct || 0;
  const updateCount =
    (actions.updateProductPrice || 0) +
    (actions.updateProductStock || 0) +
    (actions.updateProductPriceAndStock || 0);
  const reviewCount =
    (actions.reviewCombinationMapping || 0) + (actions.reviewError || 0);
  const errorCount = summary.errors || 0;

  let overallStatus = "ok";
  let headline = "El tablero no muestra alertas criticas.";

  if (errorCount > 0) {
    overallStatus = "error";
    headline =
      "Hay errores en la ultima corrida y conviene revisarlos antes de seguir.";
  } else if (createCount > 0 || updateCount > 0 || reviewCount > 0) {
    overallStatus = "attention";
    headline =
      "Hay diferencias entre SAP y PrestaShop. El tablero recomienda revisar o sincronizar cambios.";
  } else if (contrast && contrast.missingProductsInPrestashop > 0) {
    overallStatus = "attention";
    headline =
      "SAP tiene mas productos que PrestaShop. Conviene completar la sincronizacion del catalogo.";
  }

  return {
    overallStatus,
    headline,
    sampleSize,
    createCount,
    updateCount,
    reviewCount,
    errorCount,
    productGap: contrast ? contrast.productGap : null,
    missingProductsInPrestashop: contrast
      ? contrast.missingProductsInPrestashop
      : null,
    activeProductsMissingInPrestashop: contrast
      ? contrast.activeProductsMissingInPrestashop
      : null,
    inactiveProductsExtraInPrestashop: contrast
      ? contrast.inactiveProductsExtraInPrestashop
      : null,
  };
}

function buildUnavailableOverview(source, error) {
  return {
    source,
    error: error.message,
  };
}

function parsePositiveInt(value, fallback, options = {}) {
  const { max = Number.MAX_SAFE_INTEGER, min = 1 } = options;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

async function getCatalogOverview(forceRefresh = false) {
  const ttlMs = 60 * 1000;
  if (
    !forceRefresh &&
    overviewCache.payload &&
    Date.now() - overviewCache.updatedAt < ttlMs
  ) {
    return overviewCache.payload;
  }

  let sap;
  let prestashop;

  try {
    sap = readSapOverview(log);
  } catch (error) {
    sap = buildUnavailableOverview("sap", error);
  }

  if (hasPrestaConfig()) {
    try {
      prestashop = await readPrestaOverview(createPrestaClient(log), log);
    } catch (error) {
      prestashop = buildUnavailableOverview("prestashop", error);
    }
  } else {
    prestashop = {
      source: "prestashop",
      error: "PRESTASHOP_ENDPOINT o PRESTASHOP_API_KEY no configurados",
    };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sap,
    prestashop,
    contrast: buildContrast(sap, prestashop),
  };

  overviewCache = {
    updatedAt: Date.now(),
    payload,
  };

  return payload;
}

app.get("/api/reports", (req, res) => {
  const reportDir = path.join(process.cwd(), env("REPORT_DIR", "reports"));
  try {
    const files = fs
      .readdirSync(reportDir)
      .filter((f) => f.endsWith(".summary.json"))
      .sort()
      .reverse()
      .slice(0, 15);

    const reports = files.map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(reportDir, f), "utf8"));
      } catch {
        return null;
      }
    });

    res.json(reports.filter(Boolean));
  } catch {
    res.json([]);
  }
});

app.get("/api/status", (req, res) => {
  res.json(
    activeSync
      ? {
          running: true,
          startedAt: activeSync.startedAt,
          pid: activeSync.proc.pid,
          logLines: activeSync.logBuffer.length,
        }
      : { running: false },
  );
});

app.get("/api/catalog-overview", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const payload = await getCatalogOverview(forceRefresh);
  res.json(payload);
});

app.get("/api/dashboard-summary", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const overview = await getCatalogOverview(forceRefresh);
  let latestReport = null;

  try {
    latestReport = getLatestReport();
  } catch {}

  res.json({
    generatedAt: new Date().toISOString(),
    latestReport,
    overview,
    executive: buildExecutiveSummary(overview, latestReport),
  });
});

app.get("/api/domain-analysis", (req, res) => {
  res.json(buildDomainAnalysisSummary());
});

app.get("/api/sap-products", (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = parsePositiveInt(req.query.pageSize, 50, { max: 250 });
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    res.status(400).json({
      error: "status invalido. Usa all, active o inactive",
    });
    return;
  }

  try {
    const payload = readSapProductsPage(log, {
      page,
      pageSize,
      search,
      status,
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/prestashop-products", async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = parsePositiveInt(req.query.pageSize, 50, { max: 250 });
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    res.status(400).json({
      error: "status invalido. Usa all, active o inactive",
    });
    return;
  }

  if (!hasPrestaConfig()) {
    res.status(400).json({
      error: "PRESTASHOP_ENDPOINT o PRESTASHOP_API_KEY no configurados",
    });
    return;
  }

  try {
    const client = createPrestaClient(log);
    const payload = await readPrestaProductsPage(client, log, {
      page,
      pageSize,
      search,
      status,
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/sync-domains", (req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "sap",
    domains: listSyncDomains(),
  });
});

app.get("/api/prestashop-control", async (req, res) => {
  const reference = String(req.query.reference || "").trim();

  if (!reference) {
    res.status(400).json({ error: "Falta reference" });
    return;
  }

  const result = {
    reference,
    sap: null,
    prestashop: null,
    comparison: null,
  };

  try {
    result.sap = readSapArticleByCode(log, reference);
  } catch (error) {
    result.sap = { error: error.message };
  }

  if (!hasPrestaConfig()) {
    result.prestashop = {
      error: "PRESTASHOP_ENDPOINT o PRESTASHOP_API_KEY no configurados",
    };
  } else {
    try {
      const client = createPrestaClient(log);
      result.prestashop = await inspectProductByReferenceValue(
        client,
        reference,
        log,
      );
    } catch (error) {
      result.prestashop = { error: error.message };
    }
  }

  if (
    result.sap &&
    !result.sap.error &&
    result.prestashop &&
    !result.prestashop.error &&
    result.prestashop
  ) {
    result.comparison = {
      existsInSap: true,
      existsInPrestashop: true,
      samePrice:
        Number(result.sap.price) === Number(result.prestashop.productPrice),
      stockRecords: result.prestashop.stockAvailables
        ? result.prestashop.stockAvailables.length
        : 0,
    };
  } else {
    result.comparison = {
      existsInSap: Boolean(
        result.sap && !result.sap.error && result.sap.itemCode,
      ),
      existsInPrestashop: Boolean(
        result.prestashop &&
        !result.prestashop.error &&
        result.prestashop.productId,
      ),
    };
  }

  res.json(result);
});

app.post("/api/prestashop-control/active", async (req, res) => {
  const productId = Number(req.body.productId || 0);
  const active = Boolean(req.body.active);

  if (!productId) {
    res.status(400).json({ error: "Falta productId" });
    return;
  }

  if (!hasPrestaConfig()) {
    res.status(400).json({
      error: "PRESTASHOP_ENDPOINT o PRESTASHOP_API_KEY no configurados",
    });
    return;
  }

  try {
    const client = createPrestaClient(log);
    const result = await updatePrestaProductActive(client, productId, active);
    overviewCache = { updatedAt: 0, payload: null };
    res.json({
      ok: true,
      message: active
        ? "Producto activado en PrestaShop"
        : "Producto desactivado en PrestaShop",
      result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sync", (req, res) => {
  const { itemCode, limit, write, fullCatalog, syncDomains } = req.query;

  log("info", "Solicitud sync recibida", {
    itemCode: itemCode ? String(itemCode).trim() : "",
    limit: limit ? String(limit).trim() : "",
    write: write === "true",
    fullCatalog: fullCatalog === "true",
    syncDomains: syncDomains ? String(syncDomains).trim() : "",
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const client = createSseClient(res);

  if (activeSync) {
    attachSyncClient(activeSync, client);
    req.on("close", () => {
      closeSseClient(client);
      if (activeSync) {
        activeSync.clients.delete(client);
      }
    });
    return;
  }

  const childEnv = { ...process.env };
  if (fullCatalog === "true") {
    delete childEnv.SAP_ITEM_CODE;
    childEnv.SAP_LIMIT = "0";
  } else if (itemCode && itemCode.trim()) {
    childEnv.SAP_ITEM_CODE = itemCode.trim();
  } else {
    delete childEnv.SAP_ITEM_CODE;
  }
  if (fullCatalog === "true") {
    childEnv.SAP_LIMIT = "0";
  } else if (limit && limit.trim()) {
    childEnv.SAP_LIMIT = limit.trim();
  } else {
    delete childEnv.SAP_LIMIT;
  }
  childEnv.SYNC_WRITE = write === "true" ? "true" : "false";
  if (syncDomains && String(syncDomains).trim()) {
    childEnv.SYNC_DOMAINS = String(syncDomains).trim();
  }

  log("info", "Overrides aplicados al proceso sync", {
    requestedItemCode: itemCode ? String(itemCode).trim() : "",
    requestedLimit: limit ? String(limit).trim() : "",
    fullCatalogRequested: fullCatalog === "true",
    requestedSyncDomains: syncDomains ? String(syncDomains).trim() : "",
    childSapItemCode: childEnv.SAP_ITEM_CODE || "",
    childSapLimit: childEnv.SAP_LIMIT || "",
    childSyncWrite: childEnv.SYNC_WRITE,
    childSyncDomains: childEnv.SYNC_DOMAINS || "",
  });

  const proc = spawn("node", ["main.js"], { env: childEnv, cwd: __dirname });
  const syncState = {
    proc,
    clients: new Set(),
    logBuffer: [],
    startedAt: new Date().toISOString(),
  };
  activeSync = syncState;
  attachSyncClient(syncState, client);

  const handleChunk = (type) => (chunk) => {
    chunk
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => pushSyncLog(syncState, { type, line }));
  };

  proc.stdout.on("data", handleChunk("log"));
  proc.stderr.on("data", handleChunk("log"));

  proc.on("close", (code) => {
    overviewCache = { updatedAt: 0, payload: null };
    broadcastSync(syncState, { type: "done", code });
    for (const connectedClient of syncState.clients) {
      closeSseClient(connectedClient);
    }
    if (activeSync === syncState) {
      activeSync = null;
    }
  });

  req.on("close", () => {
    closeSseClient(client);
    syncState.clients.delete(client);
    if (activeSync === syncState) {
      activeSync.clients.delete(client);
    }
  });
});

// SPA fallback — sirve index.html para rutas no-API (debe ir después de todas las rutas /api)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Panel disponible en http://localhost:${PORT}`);
});
