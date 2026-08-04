import { useEffect, useRef, useState } from "react";

export interface LogEntry {
  text: string;
  cls: "info" | "warn" | "error" | "done-ok" | "done-err";
}

interface Props {
  entries: LogEntry[];
}

export function LogBox({ entries }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [entries]);

  async function copyLog() {
    const text = entries.map((entry) => entry.text).join("\n");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2200);
    }
  }

  return (
    <div className="log-panel">
      <div className="log-toolbar">
        <span>{entries.length} linea(s)</span>
        <button
          type="button"
          className="btn-secondary log-copy-btn"
          disabled={entries.length === 0}
          onClick={copyLog}
        >
          {copyStatus === "copied"
            ? "Copiado"
            : copyStatus === "error"
              ? "Error"
              : "Copiar log"}
        </button>
      </div>
      <div
        className="log-box"
        ref={ref}
        role="log"
        aria-live="polite"
        aria-label="Log de sincronizacion"
      >
        {entries.length === 0 ? (
          <div className="log-line info">
            Los logs de la sync apareceran aqui.
          </div>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className={`log-line ${entry.cls}`}>
              {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
