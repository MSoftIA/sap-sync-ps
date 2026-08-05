import { useEffect, useMemo, useState } from "react";
import {
  getProductAttributeMapping,
  saveProductAttributeMapping,
} from "../api/mapping";
import type {
  AttributeOption,
  ProductAttributeMappingConfig,
  ProductAttributeMappingEntry,
  ProductAttributeMappingPayload,
} from "../types";
import { useToast } from "../context/ToastContext";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Tag } from "../components/Tag";

function newEntry(
  sources: AttributeOption[],
  targets: AttributeOption[],
): ProductAttributeMappingEntry {
  const sapField = sources[0]?.key || "";
  const prestaTarget = targets[0]?.key || "feature";
  return {
    id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: true,
    sapField,
    prestaTarget,
    label: sources[0]?.label || sapField,
    featureName:
      prestaTarget === "feature" ? sources[0]?.label || sapField : "",
  };
}

function findSource(
  sources: AttributeOption[],
  key: string,
): AttributeOption | undefined {
  return sources.find((source) => source.key === key);
}

export function MappingView() {
  const { addToast } = useToast();
  const [payload, setPayload] = useState<ProductAttributeMappingPayload | null>(
    null,
  );
  const [config, setConfig] = useState<ProductAttributeMappingConfig | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getProductAttributeMapping();
      setPayload(data);
      setConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const enabledCount = useMemo(
    () => config?.entries.filter((entry) => entry.enabled).length ?? 0,
    [config],
  );
  const featureCount = useMemo(
    () =>
      config?.entries.filter(
        (entry) => entry.enabled && entry.prestaTarget === "feature",
      ).length ?? 0,
    [config],
  );
  const imageCount = useMemo(
    () =>
      config?.entries.filter(
        (entry) => entry.enabled && entry.prestaTarget === "image",
      ).length ?? 0,
    [config],
  );

  function updateEntry(
    id: string,
    patch: Partial<ProductAttributeMappingEntry>,
  ) {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        entries: current.entries.map((entry) => {
          if (entry.id !== id) return entry;
          const next = { ...entry, ...patch };
          if (patch.sapField && payload) {
            const source = payload.sources.find(
              (item) => item.key === patch.sapField,
            );
            next.label = source?.label || patch.sapField;
            if (next.prestaTarget === "feature") {
              next.featureName = source?.label || patch.sapField;
            }
          }
          if (patch.prestaTarget && patch.prestaTarget !== "feature") {
            next.featureName = "";
          }
          if (patch.prestaTarget === "feature" && !next.featureName) {
            next.featureName = next.label;
          }
          return next;
        }),
      };
    });
  }

  function addRow() {
    if (!payload) return;
    setConfig((current) => ({
      version: 1,
      entries: [
        ...(current?.entries ?? []),
        newEntry(payload.sources, payload.targets),
      ],
    }));
  }

  function removeRow(id: string) {
    setConfig((current) =>
      current
        ? {
            ...current,
            entries: current.entries.filter((entry) => entry.id !== id),
          }
        : current,
    );
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const data = await saveProductAttributeMapping(config);
      setPayload(data);
      setConfig(data.config);
      addToast({ message: "Mapeo guardado.", kind: "success" });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : String(err),
        kind: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    if (!payload) return;
    setConfig({
      ...payload.defaults,
      entries: payload.defaults.entries.map((entry) => ({ ...entry })),
    });
  }

  if (loading) {
    return (
      <main>
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Mapeo SAP a PrestaShop</h2>
          </div>
          <div className="card">
            <div style={{ display: "grid", gap: 10 }}>
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} width="100%" height={20} />
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (error || !payload || !config) {
    return (
      <main>
        <section className="section">
          <div className="card">
            <EmptyState
              icon="!"
              title="No se pudo cargar el mapeo"
              description={error || "Configuracion no disponible."}
              action={{ label: "Reintentar", onClick: load }}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Mapeo SAP a PrestaShop</h2>
            <p className="section-note">
              Define que datos de SAP alimentan campos o caracteristicas del
              producto.
            </p>
          </div>
          <div className="mapping-actions">
            <button
              className="btn-secondary"
              type="button"
              onClick={restoreDefaults}
            >
              Restaurar defaults
            </button>
            <button className="btn-secondary" type="button" onClick={addRow}>
              Agregar campo
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar mapeo"}
            </button>
          </div>
        </div>

        <div className="mapping-summary">
          <div>
            <span>Activos</span>
            <strong>{enabledCount}</strong>
          </div>
          <div>
            <span>Caracteristicas PS</span>
            <strong>{featureCount}</strong>
          </div>
          <div>
            <span>Campos directos</span>
            <strong>
              {Math.max(0, enabledCount - featureCount - imageCount)}
            </strong>
          </div>
          <div>
            <span>Imagenes</span>
            <strong>{imageCount}</strong>
          </div>
        </div>

        <div className="catalog-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Activo</th>
                <th scope="col">Campo SAP</th>
                <th scope="col">Destino PrestaShop</th>
                <th scope="col">Nombre visible</th>
                <th scope="col" style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {config.entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={!entry.enabled ? "row-inactive" : ""}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(event) =>
                        updateEntry(entry.id, { enabled: event.target.checked })
                      }
                    />
                  </td>
                  <td>
                    {(() => {
                      const source = findSource(
                        payload.sources,
                        entry.sapField,
                      );

                      return (
                        <>
                          <select
                            className="mapping-select"
                            value={entry.sapField}
                            onChange={(event) =>
                              updateEntry(entry.id, {
                                sapField: event.target.value,
                              })
                            }
                          >
                            {payload.sources.map((source) => (
                              <option key={source.key} value={source.key}>
                                {source.label}
                                {source.column ? ` - ${source.column}` : ""}
                              </option>
                            ))}
                          </select>
                          <span className="sap-source-note">
                            {source?.column || entry.sapField}
                          </span>
                        </>
                      );
                    })()}
                  </td>
                  <td>
                    <select
                      className="mapping-select"
                      value={entry.prestaTarget}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          prestaTarget: event.target.value,
                        })
                      }
                    >
                      {payload.targets.map((target) => (
                        <option key={target.key} value={target.key}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {entry.prestaTarget === "feature" ? (
                      <input
                        className="mapping-input"
                        value={entry.featureName || ""}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            featureName: event.target.value,
                            label: event.target.value,
                          })
                        }
                      />
                    ) : entry.prestaTarget === "image" ? (
                      <div className="mapping-target-label">
                        <Tag tone="green">Imagen</Tag>
                        <span>Subida desde SAP</span>
                      </div>
                    ) : (
                      <div className="mapping-target-label">
                        <Tag tone="gray">Campo PS</Tag>
                        <span>{entry.label}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => removeRow(entry.id)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
