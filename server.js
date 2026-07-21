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
  listPrestaCategories,
  readPrestaProductsPage,
  updatePrestaProductActive,
} = require("./src/prestashop");
const {
  readSapArticleByCode,
  readSapCategoryTreeAsync,
  readSapProductsPageAsync,
} = require("./src/sap");
const { log } = require("./src/logger");
const { listSyncDomains } = require("./src/sync-domains");

const app = express();
const PORT = env("UI_PORT", "3000");

let activeSync = null;
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

function buildServerLogLine(level, message, extra = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...extra,
  });
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

function parsePositiveInt(value, fallback, options = {}) {
  const { max = Number.MAX_SAFE_INTEGER, min = 1 } = options;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

app.get("/api/status", (req, res) => {
  res.json(
    activeSync
      ? {
          running: true,
          startedAt: activeSync.startedAt,
          pid: activeSync.proc.pid,
          logLines: activeSync.logBuffer.length,
          stopRequested: Boolean(activeSync.stopRequested),
        }
      : { running: false },
  );
});

app.get("/api/sap-products", async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = parsePositiveInt(req.query.pageSize, 50, { max: 250 });
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();
  const stock = String(req.query.stock || "all")
    .trim()
    .toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    res
      .status(400)
      .json({ error: "status invalido. Usa all, active o inactive" });
    return;
  }

  if (!["all", "with", "without"].includes(stock)) {
    res.status(400).json({ error: "stock invalido. Usa all, with o without" });
    return;
  }

  try {
    const payload = await readSapProductsPageAsync(log, { page, pageSize, search, status, stock });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/prestashop-categories", async (req, res) => {
  if (!hasPrestaConfig()) {
    res.status(400).json({ error: "PRESTASHOP_ENDPOINT o PRESTASHOP_API_KEY no configurados" });
    return;
  }
  try {
    const client = createPrestaClient(log);
    const categories = await listPrestaCategories(client);
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sap-categories", async (req, res) => {
  try {
    const tree = await readSapCategoryTreeAsync(log);
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/prestashop-products", async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = parsePositiveInt(req.query.pageSize, 50, { max: 250 });
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();
  const combo = String(req.query.combo || "all")
    .trim()
    .toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    res
      .status(400)
      .json({ error: "status invalido. Usa all, active o inactive" });
    return;
  }

  if (!["all", "simple", "combo"].includes(combo)) {
    res.status(400).json({ error: "combo invalido. Usa all, simple o combo" });
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
      combo,
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
  } else if (itemCode && itemCode.trim()) {
    childEnv.SAP_ITEM_CODE = itemCode.trim();
  } else {
    delete childEnv.SAP_ITEM_CODE;
  }
  if (limit && limit.trim()) {
    childEnv.SAP_LIMIT = limit.trim();
  } else if (fullCatalog === "true") {
    childEnv.SAP_LIMIT = "0";
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
    stopRequested: false,
    stopTimer: null,
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

  proc.on("close", (code, signal) => {

    if (syncState.stopTimer) {
      clearTimeout(syncState.stopTimer);
      syncState.stopTimer = null;
    }
    broadcastSync(syncState, {
      type: "done",
      code,
      signal,
      stopped: Boolean(syncState.stopRequested),
    });
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

app.post("/api/sync/stop", (req, res) => {
  if (!activeSync) {
    res.status(409).json({ ok: false, error: "No hay una sync activa" });
    return;
  }

  if (activeSync.stopRequested) {
    res.json({ ok: true, message: "La detencion ya fue solicitada" });
    return;
  }

  activeSync.stopRequested = true;
  pushSyncLog(activeSync, {
    type: "log",
    line: buildServerLogLine("warn", "Solicitud de detencion recibida"),
  });

  try {
    activeSync.proc.kill("SIGTERM");
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo detener la sync",
    });
    return;
  }

  activeSync.stopTimer = setTimeout(() => {
    if (activeSync && activeSync.stopRequested) {
      try {
        pushSyncLog(activeSync, {
          type: "log",
          line: buildServerLogLine(
            "warn",
            "Forzando cierre del proceso de sync",
          ),
        });
        activeSync.proc.kill("SIGKILL");
      } catch {}
    }
  }, 5000);

  res.json({ ok: true, message: "Se solicito detener la sync" });
});

// SPA fallback — sirve index.html para rutas no-API (debe ir después de todas las rutas /api)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Panel disponible en http://localhost:${PORT}`);
});
