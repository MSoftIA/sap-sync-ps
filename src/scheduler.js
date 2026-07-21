"use strict";

/**
 * Scheduler — programa corridas periódicas de sync sin dependencias externas.
 * Persiste config + lastRun en schedule.json para sobrevivir reinicios del servidor.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const SCHEDULE_FILE = path.join(__dirname, "..", "schedule.json");

const DEFAULT_CONFIG = {
  enabled: false,
  intervalHours: 24,
  domains: ["products"],
  write: false,
};

let _config = { ...DEFAULT_CONFIG };
let _lastRun = null; // { startedAt, finishedAt, exitCode, triggered }
let _timer = null;
let _nextRun = null; // ISO string o null
let _triggerFn = null; // inyectado desde server.js

// ── Persistencia ─────────────────────────────────────────────────────────────

function save() {
  try {
    fs.writeFileSync(
      SCHEDULE_FILE,
      JSON.stringify({ config: _config, lastRun: _lastRun }, null, 2),
      "utf8"
    );
  } catch (err) {
    log("warn", "[Scheduler] Error guardando schedule.json", { error: err.message });
  }
}

function load() {
  try {
    const raw = fs.readFileSync(SCHEDULE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (data && data.config) _config = { ...DEFAULT_CONFIG, ...data.config };
    if (data && data.lastRun) _lastRun = data.lastRun;
  } catch {
    // El archivo no existe todavía — usar defaults
  }
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function arm() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }

  if (!_config.enabled) {
    _nextRun = null;
    return;
  }

  const intervalMs = _config.intervalHours * 60 * 60 * 1000;
  const now = Date.now();

  // Si hubo una corrida previa, calcular cuánto falta para la próxima
  const lastFinishedAt = _lastRun?.finishedAt
    ? new Date(_lastRun.finishedAt).getTime()
    : null;

  let delay;
  if (lastFinishedAt) {
    const elapsed = now - lastFinishedAt;
    delay = Math.max(0, intervalMs - elapsed);
    // Si ya pasó el intervalo, esperar un poco antes de disparar (evitar run en boot)
    if (delay === 0) delay = 5_000;
  } else {
    // Primera vez — esperar el intervalo completo desde ahora
    delay = intervalMs;
  }

  _nextRun = new Date(now + delay).toISOString();
  log("info", "[Scheduler] Próxima corrida programada", { nextRun: _nextRun, delayMs: delay });
  _timer = setTimeout(fire, delay);
}

function fire() {
  _timer = null;
  log("info", "[Scheduler] Disparando sync automática", {
    domains: _config.domains,
    write: _config.write,
  });

  _lastRun = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    triggered: "auto",
  };
  save();

  if (_triggerFn) {
    const started = _triggerFn({
      domains: _config.domains,
      write: _config.write,
      source: "scheduled",
    });
    if (!started) {
      // Ya había una sync corriendo — reintentar en 5 minutos
      log("warn", "[Scheduler] Sync en curso, reintentando en 5 minutos");
      _nextRun = new Date(Date.now() + 5 * 60_000).toISOString();
      _timer = setTimeout(fire, 5 * 60_000);
    }
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

function init(triggerFn) {
  _triggerFn = triggerFn;
  load();
  arm();
  log("info", "[Scheduler] Inicializado", {
    enabled: _config.enabled,
    intervalHours: _config.intervalHours,
    nextRun: _nextRun,
  });
}

function getStatus() {
  return {
    config: { ..._config },
    nextRun: _nextRun,
    lastRun: _lastRun ? { ..._lastRun } : null,
  };
}

function updateConfig(updates) {
  _config = {
    ...DEFAULT_CONFIG,
    ..._config,
    ...(typeof updates.enabled === "boolean" && { enabled: updates.enabled }),
    ...(Number.isFinite(Number(updates.intervalHours)) && Number(updates.intervalHours) >= 1 && {
      intervalHours: Math.floor(Number(updates.intervalHours)),
    }),
    ...(Array.isArray(updates.domains) && updates.domains.length > 0 && {
      domains: updates.domains.filter((d) => typeof d === "string"),
    }),
    ...(typeof updates.write === "boolean" && { write: updates.write }),
  };
  save();
  arm();
  return getStatus();
}

function notifyDone(exitCode) {
  if (_lastRun && !_lastRun.finishedAt) {
    _lastRun = { ..._lastRun, finishedAt: new Date().toISOString(), exitCode };
    save();
  }
  // Re-armar el timer desde cuando terminó
  arm();
}

module.exports = { init, getStatus, updateConfig, notifyDone };
