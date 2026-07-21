import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { SyncProgress } from "../types";
import { useAppContext, defaultProgress } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { DomainCard } from "../components/DomainCard";
import { LogBox } from "../components/LogBox";
import type { LogEntry } from "../components/LogBox";
import { MessageBox } from "../components/MessageBox";
import { ProgressBar } from "../components/ProgressBar";
import { ConfirmModal } from "../components/ConfirmModal";
import { fmt, parseLogLine } from "../utils";
import { startSyncStream, stopSync } from "../api/sync";

interface Props {
  loading?: boolean;
  onRefresh: () => void;
}

export function SyncView({ loading, onRefresh }: Props) {
  const {
    writeMode,
    setWriteMode,
    syncRunning,
    setSyncRunning,
    selectedDomains,
    setSelectedDomains,
    availableDomains,
    setCurrentProgress,
  } = useAppContext();
  const { addToast } = useToast();

  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
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
  const [progress, setProgress] = useState<SyncProgress>(defaultProgress);
  const [statusLabel, setStatusLabel] = useState<string>("Listo");
  const [itemCode, setItemCode] = useState("");
  const [limit, setLimit] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFullCatalog, setPendingFullCatalog] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const visibleDomains = useMemo(
    () => availableDomains.filter((d) => d.key !== 'orders'),
    [availableDomains],
  );
  const activeDomains = useMemo(() => {
    const normalized = selectedDomains.filter(
      (k) => k !== 'orders' && visibleDomains.some((d) => d.key === k),
    );
    return normalized.length > 0 ? normalized : ["products"];
  }, [selectedDomains, visibleDomains]);
  const blockedWriteDomains = activeDomains.filter((key) => {
    const domain = availableDomains.find((item) => item.key === key);
    return domain
      ? domain.writeEnabled === false || domain.status !== "active"
      : false;
  });
  const blockedWriteReasons = activeDomains
    .map((key) => availableDomains.find((item) => item.key === key))
    .filter((domain): domain is NonNullable<typeof domain> => Boolean(domain))
    .filter(
      (domain) => domain.writeEnabled === false && domain.writeBlockedReason,
    )
    .map((domain) => `${domain.key}: ${domain.writeBlockedReason}`);

  function toggleDomain(key: string, checked: boolean) {
    let next = checked
      ? [...selectedDomains, key]
      : selectedDomains.filter((k) => k !== key);
    if (next.length === 0) next = ["products"];
    setSelectedDomains(next);
  }

  function requestSync(fullCatalog: boolean) {
    if (syncRunning) return;
    if (writeMode && blockedWriteDomains.length > 0) {
      addToast({
        message:
          blockedWriteReasons[0] ||
          `Estos dominios aun no permiten escritura: ${blockedWriteDomains.join(", ")}.`,
        kind: "error",
      });
      return;
    }
    if (writeMode) {
      setPendingFullCatalog(fullCatalog);
      setShowConfirm(true);
    } else {
      runSync(fullCatalog);
    }
  }

  const runSync = useCallback(
    (fullCatalog = false) => {
      setShowConfirm(false);
      if (syncRunning) return;

      setSyncRunning(true);
      setStatusLabel("En ejecucion");
      setStopRequested(false);
      setLogEntries([]);
      setProgress(defaultProgress);
      setCurrentProgress(defaultProgress);

      const appendLog = (text: string, cls: LogEntry["cls"]) =>
        setLogEntries((prev) => [...prev.slice(-499), { text, cls }]);

      appendLog(
        fullCatalog
          ? "Iniciando operacion principal sobre el catalogo..."
          : "Iniciando corrida puntual...",
        "info",
      );
      appendLog("Dominios seleccionados: " + activeDomains.join(", "), "info");
      appendLog(
        writeMode
          ? "Modo seleccionado: aplicar cambios reales."
          : "Modo seleccionado: analizar sin modificar tienda.",
        "info",
      );

      const es = startSyncStream({
        fullCatalog,
        itemCode: fullCatalog ? undefined : itemCode || undefined,
        limit: limit || undefined,
        write: writeMode,
        domains: activeDomains,
      });
      esRef.current = es;

      es.onmessage = (event: MessageEvent) => {
        const msg = JSON.parse(String(event.data)) as {
          type: string;
          line?: string;
          code?: number;
          stopped?: boolean;
        };

        if (msg.type === "log" && msg.line) {
          const parsed = parseLogLine(msg.line);
          setLogEntries((prev) => [
            ...prev.slice(-499),
            { text: parsed.text, cls: parsed.cls },
          ]);
          if (parsed.progress) {
            setProgress(parsed.progress);
            setCurrentProgress(parsed.progress);
          }
          return;
        }

        if (msg.type === "done") {
          const ok = msg.code === 0;
          const stopped = msg.stopped === true;
          setLogEntries((prev) => [
            ...prev.slice(-499),
            {
              text: stopped
                ? "Sync detenida por el usuario."
                : ok
                  ? "Sync completado."
                  : `Sync finalizo con codigo ${msg.code}.`,
              cls: stopped || ok ? "done-ok" : "done-err",
            },
          ]);
          es.close();
          esRef.current = null;
          setSyncRunning(false);
          setStopRequested(false);
          setStatusLabel(
            stopped ? "Detenido" : ok ? "Completado" : "Con errores",
          );
          if (stopped) {
            addToast({
              message: "Sync detenida por el usuario.",
              kind: "info",
            });
          } else if (ok) {
            setProgress((prev) => ({ ...prev, percent: 100, known: true }));
            addToast({
              message: "Sync completado exitosamente.",
              kind: "success",
            });
          } else {
            addToast({
              message: `Sync finalizo con codigo ${msg.code}. Revisa el log.`,
              kind: "error",
            });
          }
          onRefresh();
        }
      };

      es.onerror = () => {
        setLogEntries((prev) => [
          ...prev.slice(-499),
          { text: "Error de conexion con el servidor.", cls: "error" },
        ]);
        es.close();
        esRef.current = null;
        setSyncRunning(false);
        setStopRequested(false);
        setStatusLabel("Con errores");
        addToast({
          message: "Error de conexion con el servidor.",
          kind: "error",
        });
      };
    },
    [syncRunning, writeMode, activeDomains, itemCode, limit, addToast, setSyncRunning, setCurrentProgress],
  );

  const requestStop = useCallback(async () => {
    if (!syncRunning || stopRequested) return;

    try {
      setStopRequested(true);
      await stopSync();
      setLogEntries((prev) => [
        ...prev,
        { text: "Solicitando detener la sync...", cls: "warn" },
      ]);
      addToast({
        message: "Se envio la solicitud para detener la sync.",
        kind: "info",
      });
    } catch (error) {
      setStopRequested(false);
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo detener la sync.",
        kind: "error",
      });
    }
  }, [syncRunning, stopRequested, addToast]);

  const progressDomain = String(progress.domain || "").toLowerCase();
  const isCategoryProgress = progressDomain === "categories";

  const progressTitle = syncRunning
    ? progress.domain
      ? `Dominio ${progress.domain}`
      : "Corrida en curso"
    : statusLabel === "Completado"
      ? "Corrida completada"
      : statusLabel === "Con errores"
        ? "Corrida con errores"
        : "Sin corrida activa";

  const progressMeta = syncRunning
    ? progress.known
      ? isCategoryProgress
        ? `${fmt(progress.current)} de ${fmt(progress.total)} articulos SAP evaluados para categorias (${fmt(progress.percent)}%)`
        : `${fmt(progress.current)} de ${fmt(progress.total)} (${fmt(progress.percent)}%)`
      : "Calculando avance"
    : statusLabel === "Completado"
      ? progress.known
        ? `${fmt(progress.total)} elemento(s) recorridos`
        : "Proceso finalizado"
      : "Esperando accion";

  const progressNote = syncRunning
    ? progress.itemCode
      ? isCategoryProgress
        ? `Procesando articulo ${progress.itemCode} para resolver su categoria`
        : `Procesando item ${progress.itemCode}`
      : isCategoryProgress
        ? "Recorriendo articulos SAP y alineando su categoria en PrestaShop"
        : "Procesando dominio seleccionado"
    : statusLabel === "Completado"
      ? "La operacion termino. Puedes revisar el historial y los reportes generados."
      : statusLabel === "Con errores"
        ? "Revisa el log para ver en que punto se corto y que dominio estaba activo."
        : "Cuando inicies una corrida, aqui veras el dominio actual, el avance y el articulo en proceso cuando aplique.";

  const progressPercent = statusLabel === "Completado" ? 100 : progress.percent;
  const progressKnown = statusLabel === "Completado" ? true : progress.known;

  return (
    <main>
      {showConfirm && (
        <ConfirmModal
          domains={activeDomains}
          onConfirm={() => runSync(pendingFullCatalog)}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* 1 — Ejecutar */}
      <section className="section">
        <div className="card">
          <div className="action-block">
            {writeMode && blockedWriteDomains.length > 0 && (
              <MessageBox kind="warn">
                {blockedWriteReasons.length > 0
                  ? blockedWriteReasons.join(" ")
                  : `Dominios sin escritura habilitada: ${blockedWriteDomains.join(", ")}.`}
              </MessageBox>
            )}

            <div className="domain-picker">
              <div className="domain-header">
                <div>
                  <div className="domain-title">Dominios</div>
                  <div className="domain-subtitle">Que quieres sincronizar.</div>
                </div>
                <div className="domain-actions">
                  <button className="btn-secondary" type="button" onClick={() => setSelectedDomains(["products"])}>
                    Solo productos
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setSelectedDomains(visibleDomains.map((d) => d.key))}>
                    Todos
                  </button>
                </div>
              </div>

              <div className="domain-grid">
                {visibleDomains.length === 0 ? (
                  <div className="empty">Cargando dominios...</div>
                ) : (
                  visibleDomains.map((domain) => (
                    <DomainCard key={domain.key} domain={domain} checked={activeDomains.includes(domain.key)} onChange={toggleDomain} />
                  ))
                )}
              </div>
            </div>

            <div className="button-row">
              <div className="toggle-group">
                <button className={!writeMode ? "active" : ""} type="button" onClick={() => setWriteMode(false)}>
                  Analizar
                </button>
                <button className={writeMode ? "active danger" : ""} type="button" onClick={() => setWriteMode(true)}>
                  Aplicar cambios
                </button>
              </div>

              <button
                className="btn-dark"
                type="button"
                disabled={syncRunning || (writeMode && blockedWriteDomains.length > 0)}
                onClick={() => requestSync(true)}
                style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {syncRunning
                  ? "Corriendo..."
                  : writeMode
                    ? `Sincronizar ${activeDomains.join(", ")}`
                    : `Analizar ${activeDomains.join(", ")}`}
              </button>

              {syncRunning && (
                <button className="btn-secondary" type="button" disabled={stopRequested} onClick={requestStop}>
                  {stopRequested ? "Deteniendo..." : "Detener"}
                </button>
              )}

              <button
                className="btn-secondary"
                type="button"
                disabled={loading || syncRunning}
                onClick={onRefresh}
                style={{ display: "flex", alignItems: "center", gap: 7 }}
              >
                {loading && <span className="spinner-dark" />}
                Refrescar
              </button>
            </div>

            <details open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Opciones avanzadas</summary>
              <div className="details-body">
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="limit">Lote manual</label>
                    <input type="number" id="limit" min={1} placeholder="Ej. 50" value={limit} onChange={(e) => setLimit(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="item-code">Item code puntual</label>
                    <input type="text" id="item-code" placeholder="Opcional" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
                  </div>
                </div>
                <p className="section-note" style={{ margin: '10px 0 0', fontSize: '0.82rem' }}>
                  El item code y el lote aplican solo a "Ejecutar corrida puntual". El botón principal siempre recorre el catálogo completo.
                </p>
                <div className="button-row" style={{ marginTop: 10 }}>
                  <button className="btn-primary" type="button" disabled={syncRunning} onClick={() => requestSync(false)}>
                    Ejecutar corrida puntual
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* 2 — Progreso + Log */}
      <section className="section">
        <div className="card" style={{ marginBottom: 12 }}>
          <ProgressBar
            title={progressTitle}
            meta={progressMeta}
            note={progressNote}
            percent={progressPercent}
            known={progressKnown}
            running={syncRunning}
          />
        </div>
        <LogBox entries={logEntries} />
      </section>

    </main>
  );
}
