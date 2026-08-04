import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { SapCatalog } from "../components/SapCatalog";
import { PrestaCatalog } from "../components/PrestaCatalog";
import { LogBox } from "../components/LogBox";
import type { LogEntry } from "../components/LogBox";
import { Tag } from "../components/Tag";
import { startSyncStream, stopSync } from "../api/sync";
import { parseLogLine } from "../utils";

export function ProductsView() {
  const { writeMode, setWriteMode, syncRunning, setSyncRunning } =
    useAppContext();
  const { addToast } = useToast();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [syncingItemCode, setSyncingItemCode] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [syncTiming, setSyncTiming] = useState<{
    label: string;
    startedAt: number;
    elapsedMs: number;
    running: boolean;
  } | null>(null);
  const [timerNow, setTimerNow] = useState(Date.now());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
        setSyncRunning(false);
      }
    };
  }, [setSyncRunning]);

  useEffect(() => {
    if (!syncTiming?.running) return;

    const id = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);

    return () => window.clearInterval(id);
  }, [syncTiming?.running]);

  const activeElapsedMs =
    syncTiming?.running && syncTiming.startedAt
      ? timerNow - syncTiming.startedAt
      : (syncTiming?.elapsedMs ?? 0);

  function formatElapsed(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  function startTiming(label: string) {
    const startedAt = Date.now();
    setTimerNow(startedAt);
    setSyncTiming({
      label,
      startedAt,
      elapsedMs: 0,
      running: true,
    });
  }

  function finishTiming() {
    setSyncTiming((current) => {
      if (!current || !current.running) return current;
      return {
        ...current,
        elapsedMs: Date.now() - current.startedAt,
        running: false,
      };
    });
  }

  function attachHandlers(es: EventSource, label: string, onDone: () => void) {
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "log" && msg.line) {
          const parsed = parseLogLine(String(msg.line));
          setLog((prev) => [
            ...prev.slice(-499),
            { text: parsed.text, cls: parsed.cls },
          ]);
        }
        if (msg.type === "done") {
          es.close();
          esRef.current = null;
          finishTiming();
          onDone();
          addToast({ message: `${label} completado.`, kind: "success" });
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
      finishTiming();
      onDone();
      addToast({ message: `Error en ${label}.`, kind: "error" });
    };
  }

  function runSync() {
    if (syncing || syncRunning) return;
    setSyncing(true);
    setSyncRunning(true);
    setLog([]);
    setLogOpen(false);
    startTiming("Sync masivo de productos");

    const es = startSyncStream({
      write: writeMode,
      domains: ["products"],
      fullCatalog: true,
    });
    esRef.current = es;
    attachHandlers(es, "Sync de productos", () => {
      setSyncing(false);
      setSyncRunning(false);
      setStopRequested(false);
    });
  }

  async function handleStop() {
    if (stopRequested) return;
    setStopRequested(true);
    try {
      await stopSync();
      addToast({
        message: "Se envió la solicitud para detener la sync.",
        kind: "info",
      });
    } catch {
      setStopRequested(false);
      addToast({ message: "No se pudo detener la sync.", kind: "error" });
    }
  }

  function syncItem(itemCode: string) {
    if (syncingItemCode || syncRunning) return;
    setSyncingItemCode(itemCode);
    setSyncRunning(true);
    setLog([]);
    setLogOpen(false);
    startTiming(`Sync de ${itemCode}`);

    const es = startSyncStream({
      write: writeMode,
      domains: ["products"],
      itemCode,
    });
    esRef.current = es;
    attachHandlers(es, `Sync de ${itemCode}`, () => {
      setSyncingItemCode(null);
      setSyncRunning(false);
      setStopRequested(false);
    });
  }

  return (
    <main>
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Productos</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="toggle-group">
              <button
                type="button"
                className={!writeMode ? "active" : ""}
                onClick={() => setWriteMode(false)}
                disabled={syncing}
              >
                Analizar
              </button>
              <button
                type="button"
                className={writeMode ? "active danger" : ""}
                onClick={() => setWriteMode(true)}
                disabled={syncing}
              >
                Aplicar cambios
              </button>
            </div>
            {syncing ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={handleStop}
                disabled={stopRequested}
                style={{ display: "flex", alignItems: "center", gap: 7 }}
              >
                {stopRequested && <span className="spinner-dark" />}
                {stopRequested ? "Deteniendo..." : "Detener"}
              </button>
            ) : (
              <button
                className="btn-primary"
                type="button"
                onClick={runSync}
                disabled={syncRunning}
              >
                {writeMode ? "Sincronizar productos" : "Analizar productos"}
              </button>
            )}
          </div>
        </div>

        {syncTiming && (
          <div className="sync-timing-card">
            <div>
              <span>{syncTiming.running ? "Midiendo" : "Ultima duracion"}</span>
              <strong>{syncTiming.label}</strong>
            </div>
            <div className="sync-timing-value">
              {syncTiming.running && <span className="spinner-dark" />}
              {formatElapsed(activeElapsedMs)}
            </div>
          </div>
        )}

        <div
          className="section-header"
          style={{
            marginTop: 32,
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="section-title">Catálogo SAP</h2>
            <Tag tone="amber">Origen</Tag>
          </div>
        </div>
        <SapCatalog
          onSyncItem={writeMode ? syncItem : undefined}
          syncingItemCode={syncingItemCode}
        />

        <div
          className="section-header"
          style={{
            marginTop: 32,
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="section-title">Catálogo PrestaShop</h2>
            <Tag tone="gray">Destino</Tag>
          </div>
        </div>
        <PrestaCatalog />
      </section>
      {log.length > 0 && (
        <>
          <div className="log-dock" role="status" aria-live="polite">
            <div>
              <strong>
                {syncing || syncingItemCode ? "Sync en curso" : "Ultimo log"}
              </strong>
              <span>{log.length} linea(s)</span>
              {syncTiming && (
                <span>
                  {syncTiming.running ? "Tiempo" : "Duracion"}:{" "}
                  {formatElapsed(activeElapsedMs)}
                </span>
              )}
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setLogOpen(true)}
            >
              Ver log
            </button>
          </div>
          {logOpen && (
            <div
              className="log-modal-backdrop"
              role="presentation"
              onClick={() => setLogOpen(false)}
            >
              <div
                className="log-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Log de sincronizacion"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="log-modal-header">
                  <div>
                    <h3>Log de sincronizacion</h3>
                    <span>{log.length} linea(s)</span>
                  </div>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setLogOpen(false)}
                  >
                    Cerrar
                  </button>
                </div>
                <LogBox entries={log} />
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
