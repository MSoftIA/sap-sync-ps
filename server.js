"use strict";

const { loadEnvFile, env } = require("./src/env");
loadEnvFile();

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  createPrestaClient,
  hasPrestaConfig,
  inspectProductByReferenceValue,
  readPrestaOverview,
  updatePrestaProductActive,
} = require("./src/prestashop");
const { readSapArticleByCode, readSapOverview } = require("./src/sap");
const { log } = require("./src/logger");

const app = express();
const PORT = env("UI_PORT", "3000");

let activeSync = null;
let overviewCache = {
  updatedAt: 0,
  payload: null,
};

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function buildContrast(sap, prestashop) {
  if (!sap || !prestashop || sap.error || prestashop.error) {
    return null;
  }

  return {
    productGap: sap.totalProducts - prestashop.totalProducts,
    activeGap: sap.activeProducts - prestashop.activeProducts,
    inactiveGap: sap.inactiveProducts - prestashop.inactiveProducts,
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

function buildExecutiveSummary(overview, latestReport) {
  const summary = latestReport ? latestReport.summary || {} : {};
  const actions = latestReport ? latestReport.recommendedActions || {} : {};
  const contrast = overview ? overview.contrast : null;

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
  }

  return {
    overallStatus,
    headline,
    createCount,
    updateCount,
    reviewCount,
    errorCount,
    productGap: contrast ? contrast.productGap : null,
  };
}

function buildUnavailableOverview(source, error) {
  return {
    source,
    error: error.message,
  };
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
  res.json({ running: !!activeSync });
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
  if (activeSync) {
    res.status(409).json({ error: "Ya hay un sync en curso" });
    return;
  }

  const { itemCode, limit, write } = req.query;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const childEnv = { ...process.env };
  if (itemCode && itemCode.trim()) {
    childEnv.SAP_ITEM_CODE = itemCode.trim();
  } else {
    delete childEnv.SAP_ITEM_CODE;
  }
  if (limit && limit.trim()) {
    childEnv.SAP_LIMIT = limit.trim();
  } else {
    delete childEnv.SAP_LIMIT;
  }
  childEnv.SYNC_WRITE = write === "true" ? "true" : "false";

  const send = (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {
      // client disconnected
    }
  };

  const proc = spawn("node", ["main.js"], { env: childEnv, cwd: __dirname });
  activeSync = proc;

  const handleChunk = (type) => (chunk) => {
    chunk
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => send({ type, line }));
  };

  proc.stdout.on("data", handleChunk("log"));
  proc.stderr.on("data", handleChunk("log"));

  proc.on("close", (code) => {
    overviewCache = { updatedAt: 0, payload: null };
    send({ type: "done", code });
    activeSync = null;
    // No llamamos res.end() aqui. El cliente cierra con es.close()
    // lo que dispara req.on('close') y limpia el socket
  });

  req.on("close", () => {
    if (activeSync === proc) {
      proc.kill();
      activeSync = null;
    }
  });
});

app.listen(PORT, () => {
  console.log(`Panel disponible en http://localhost:${PORT}`);
});
