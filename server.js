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
  readPrestaOverview,
} = require("./src/prestashop");
const { readSapOverview } = require("./src/sap");
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
