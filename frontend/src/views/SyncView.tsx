import { useState, useCallback } from "react";
import type { Report, DomainAnalysis, SyncProgress } from "../types";
import { useAppContext, defaultProgress } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { DomainCard } from "../components/DomainCard";
import { LogBox } from "../components/LogBox";
import type { LogEntry } from "../components/LogBox";
import { MessageBox } from "../components/MessageBox";
import { ProgressBar } from "../components/ProgressBar";
import { Tag } from "../components/Tag";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { fmt, fmtDate } from "../utils";
import { startSyncStream, stopSync } from "../api/sync";

interface Props {
  reports: Report[];
  domainAnalysis: DomainAnalysis | null;
  loading?: boolean;
  onRefresh: () => void;
}

function buildLogDetails(obj: Record<string, unknown>): string {
  const keys = [
    "itemCode",
    "reference",
    "productId",
    "action",
    "status",
    "details",
    "payloadSummary",
    "sapPrice",
    "prestashopProductPrice",
    "sapStock",
    "childSapLimit",
    "effectiveSapLimit",
  ];
  const pairs: string[] = [];
  for (const key of keys) {
    if (!(key in obj)) continue;
    const val = obj[key];
    if (val === undefined || val === null || val === "") continue;
    const str = Array.isArray(val)
      ? val.join(", ")
      : typeof val === "object"
        ? JSON.stringify(val)
        : String(val);
    if (str) pairs.push(`${key}=${str}`);
  }
  return pairs.length ? " | " + pairs.join(" | ") : "";
}

function parseLogLine(raw: string): {
  text: string;
  cls: LogEntry["cls"];
  progress?: SyncProgress;
} {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    let progress: SyncProgress | undefined;
    if (obj.message === "Progreso de dominio") {
      progress = {
        domain: String(obj.domain ?? ""),
        current: Number(obj.current ?? 0),
        total: Number(obj.total ?? 0),
        percent: Number(obj.percent ?? 0),
        itemCode: String(obj.itemCode ?? ""),
        known: Number.isFinite(Number(obj.total)) && Number(obj.total) > 0,
      };
    }
    const time = obj.ts
      ? new Date(String(obj.ts)).toLocaleTimeString("es")
      : "";
    const level = String(obj.level ?? "info");
    const text =
      `[${time}] ${level.toUpperCase()} ${String(obj.message ?? raw)}` +
      buildLogDetails(obj);
    const cls: LogEntry["cls"] =
      level === "error" ? "error" : level === "warn" ? "warn" : "info";
    return { text, cls, progress };
  } catch {
    return { text: raw, cls: "info" };
  }
}

export function SyncView({
  reports,
  domainAnalysis,
  loading,
  onRefresh,
}: Props) {
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
  const [progress, setProgress] = useState<SyncProgress>(defaultProgress);
  const [statusLabel, setStatusLabel] = useState<string>("Listo");
  const [itemCode, setItemCode] = useState("");
  const [limit, setLimit] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFullCatalog, setPendingFullCatalog] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  const latest = reports[0] ?? null;
  const latestActions = latest?.recommendedActions ?? {};
  const latestSummary = latest?.summary ?? {};
  const updateCount =
    (latestActions.updateProductPrice ?? 0) +
    (latestActions.updateProductStock ?? 0) +
    (latestActions.updateProductPriceAndStock ?? 0);
  const reviewCount =
    (latestActions.reviewCombinationMapping ?? 0) +
    (latestActions.reviewError ?? 0);

  const normalizedDomains = selectedDomains.filter((k) =>
    availableDomains.some((d) => d.key === k),
  );
  const activeDomains =
    normalizedDomains.length > 0 ? normalizedDomains : ["products"];
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
        setLogEntries((prev) => [...prev, { text, cls }]);

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
            ...prev,
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
            ...prev,
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
          ...prev,
          { text: "Error de conexion con el servidor.", cls: "error" },
        ]);
        es.close();
        setSyncRunning(false);
        setStopRequested(false);
        setStatusLabel("Con errores");
        addToast({
          message: "Error de conexion con el servidor.",
          kind: "error",
        });
      };
    },
    [syncRunning, writeMode, activeDomains, itemCode, limit, addToast],
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
                  <button className="btn-secondary" type="button" onClick={() => setSelectedDomains(availableDomains.map((d) => d.key))}>
                    Todos
                  </button>
                </div>
              </div>

              <div className="domain-grid">
                {availableDomains.length === 0 ? (
                  <div className="empty">Cargando dominios...</div>
                ) : (
                  availableDomains.map((domain) => (
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

            <details>
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
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button className="btn-primary" type="button" disabled={syncRunning} onClick={() => requestSync(false)}>
                    Ejecutar corrida puntual
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* 2 — Estado del catalogo */}
      <section className="section">
        {!syncRunning && latest && (() => {
          const totalPending = (latestActions.createProduct ?? 0) + updateCount + reviewCount;
          const hasErrors = (latestSummary.errors ?? 0) > 0;
          if (hasErrors) return (
            <div className="sync-status-banner error" style={{ marginBottom: 12 }}>
              <span>!</span>
              <span>La ultima corrida tuvo {latestSummary.errors} error(es). Revisa el log.</span>
            </div>
          );
          if (totalPending === 0 && (latestSummary.total ?? 0) > 0) return (
            <div className="sync-status-banner ok" style={{ marginBottom: 12 }}>
              <span>OK</span>
              <span>Los {latestSummary.total} articulos de la ultima muestra estan sincronizados.</span>
            </div>
          );
          if (totalPending > 0) return (
            <div className="sync-status-banner warn" style={{ marginBottom: 12 }}>
              <span>!</span>
              <span>{totalPending} articulo(s) requieren accion.</span>
            </div>
          );
          return null;
        })()}

        {latest ? (
          <div className="action-cards">
            <div className={`action-card${(latestActions.createProduct ?? 0) > 0 ? " pending-create" : ""}`}>
              <div className="action-card-count">{fmt(latestActions.createProduct) ?? "0"}</div>
              <div className="action-card-label">Por crear</div>
              <div className="action-card-desc">En SAP, sin existir en PrestaShop.</div>
            </div>
            <div className={`action-card${updateCount > 0 ? " pending-update" : ""}`}>
              <div className="action-card-count">{fmt(updateCount) ?? "0"}</div>
              <div className="action-card-label">Por actualizar</div>
              <div className="action-card-desc">Precio o stock diferente.</div>
            </div>
            <div className={`action-card${reviewCount > 0 ? " pending-review" : ""}`}>
              <div className="action-card-count">{fmt(reviewCount) ?? "0"}</div>
              <div className="action-card-label">Revision manual</div>
              <div className="action-card-desc">Combinaciones o errores.</div>
            </div>
            <div className={`action-card${(latestActions.skipNoChange ?? 0) > 0 ? " all-clear" : ""}`}>
              <div className="action-card-count">{fmt(latestActions.skipNoChange) ?? "0"}</div>
              <div className="action-card-label">Sin cambios</div>
              <div className="action-card-desc">Ya coinciden SAP y PrestaShop.</div>
            </div>
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon="o"
              title="Sin corridas registradas"
              description="Ejecuta un analisis para ver el estado del catalogo."
            />
          </div>
        )}
      </section>

      {/* 3 — Progreso + Log */}
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

      {/* 4 — Historial */}
      {reports.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Historial</h2>
            <div className="section-note">Ultimas ejecuciones.</div>
          </div>
          <div className="history-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Muestra</th>
                  <th>Crear</th>
                  <th>Actualizar</th>
                  <th>Sin cambio</th>
                  <th>Revision</th>
                  <th>Aplicados</th>
                  <th>Errores</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => {
                  const a = r.recommendedActions ?? {};
                  const s = r.summary ?? {};
                  const upd = (a.updateProductPrice ?? 0) + (a.updateProductStock ?? 0) + (a.updateProductPriceAndStock ?? 0);
                  const rev = (a.reviewCombinationMapping ?? 0) + (a.reviewError ?? 0);
                  const executed = a.executed ?? 0;
                  const errors = s.errors ?? 0;
                  return (
                    <tr key={i}>
                      <td>{fmtDate(r.generatedAt)}</td>
                      <td>{fmt(s.total)}</td>
                      <td>{fmt(a.createProduct)}</td>
                      <td>{fmt(upd)}</td>
                      <td>{fmt(a.skipNoChange)}</td>
                      <td><Tag tone={rev > 0 ? "amber" : "gray"}>{fmt(rev)}</Tag></td>
                      <td><Tag tone={executed > 0 ? "green" : "gray"}>{fmt(executed)}</Tag></td>
                      <td><Tag tone={errors > 0 ? "red" : "gray"}>{fmt(errors)}</Tag></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
