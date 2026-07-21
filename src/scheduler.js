"use strict";

/**
 * Scheduler — dispara una corrida diaria a una hora fija (hora local del servidor).
 * Persiste config + lastRun en schedule.json para sobrevivir reinicios.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const SCHEDULE_FILE = path.join(__dirname, "..", "schedule.json");

const DEFAULT_CONFIG = {
  enabled: false,
  runAt: "02:00", // HH:MM hora local del servidor
  domains: ["products"],
  write: false,
};

let _config = { ...DEFAULT_CONFIG };
let _lastRun = null; // { startedAt, finishedAt, exitCode, triggered }
let _timer = null;
let _nextRun = null; // ISO string o null
let _triggerFn = null;

// ── Validación ────────────────────────────────────────────────────────────────

function isValidTime(v) {
  return typeof v === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

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
    // Migración: si venía de la versión anterior con intervalHours, ignorarlo
    delete _config.intervalHours;
  } catch {
    // Archivo no existe todavía — usar defaults
  }

  // Si la corrida anterior quedó sin cerrar (reinicio del servidor mid-sync),
  // marcarla como interrumpida para que el frontend no la muestre como "en curso"
  if (_lastRun && !_lastRun.finishedAt) {
    _lastRun = {
      ..._lastRun,
      finishedAt: new Date().toISOString(),
      exitCode: -1,
      interrupted: true,
    };
    save();
    log("warn", "[Scheduler] Corrida anterior interrumpida por reinicio del servidor", {
      startedAt: _lastRun.startedAt,
    });
  }
}

// ── Timer ─────────────────────────────────────────────────────────────────────

/**
 * Calcula la próxima ejecución: "hoy a runAt" si aún no pasó, si no "mañana a runAt".
 * Garantiza al menos 5 segundos en el futuro para evitar disparos en el arranque.
 */
function computeNextDate() {
  const [hh, mm] = _config.runAt.split(":").map(Number);
  const now = new Date();

  const candidate = new Date(now);
  candidate.setHours(hh, mm, 0, 0);

  // Si la hora ya pasó (o está en los próximos 5 segundos), programar para mañana
  if (candidate.getTime() - now.getTime() < 5_000) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}

function arm() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }

  if (!_config.enabled) {
    _nextRun = null;
    return;
  }

  if (!isValidTime(_config.runAt)) {
    log("warn", "[Scheduler] runAt inválido — desactivando", { runAt: _config.runAt });
    _nextRun = null;
    return;
  }

  const next = computeNextDate();
  const delay = next.getTime() - Date.now();
  _nextRun = next.toISOString();

  log("info", "[Scheduler] Próxima corrida programada", {
    nextRun: _nextRun,
    localTime: next.toLocaleString(),
    delayMs: delay,
  });

  _timer = setTimeout(fire, delay);
}

function fire() {
  _timer = null;
  log("info", "[Scheduler] Disparando sync automática", {
    runAt: _config.runAt,
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
      // Ya había una sync corriendo — reintentar en 10 minutos
      log("warn", "[Scheduler] Sync en curso, reintentando en 10 minutos");
      _nextRun = new Date(Date.now() + 10 * 60_000).toISOString();
      _timer = setTimeout(fire, 10 * 60_000);
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
    runAt: _config.runAt,
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
    ...(isValidTime(updates.runAt) && { runAt: updates.runAt }),
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
  arm(); // Re-armar para el día siguiente
}

module.exports = { init, getStatus, updateConfig, notifyDone };
