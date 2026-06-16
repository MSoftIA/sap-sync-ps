"use strict";

const { loadEnvFile, env } = require("./src/env");
loadEnvFile();

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = env("UI_PORT", "3000");

let activeSync = null;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

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
    send({ type: "done", code });
    activeSync = null;
    res.end();
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
