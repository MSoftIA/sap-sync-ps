import type { SyncDomain } from "../types";
import { Tag } from "./Tag";

interface Props {
  domain: SyncDomain;
  checked: boolean;
  onChange: (key: string, checked: boolean) => void;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  diagnostic: "Diagnostico",
  discovery: "Discovery",
  planned: "Planned",
};

const STATUS_TONE: Record<string, "green" | "amber" | "gray"> = {
  active: "green",
  diagnostic: "amber",
  discovery: "gray",
  planned: "gray",
};

const CAPABILITY: Record<string, string> = {
  products: "Permite analizar y sincronizar.",
  categories: "Permite analizar y alinear categorias de productos.",
  orders:
    "Hoy solo compara pedidos; todavia no crea ni actualiza ordenes en PrestaShop.",
};

export function DomainCard({ domain, checked, onChange }: Props) {
  const tone = STATUS_TONE[domain.status] ?? "gray";
  const label = STATUS_LABEL[domain.status] ?? domain.status;
  const capability = CAPABILITY[domain.key] ?? "";
  const scope = domain.scope?.join(", ") ?? "";
  const blockedReason =
    !domain.writeEnabled && domain.writeBlockedReason
      ? domain.writeBlockedReason
      : "";

  return (
    <div className="domain-card">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(domain.key, e.target.checked)}
        />
        <div>
          <div className="domain-card-title">{domain.key}</div>
          <div className="domain-card-copy">
            {capability} {scope}
          </div>
          {blockedReason ? (
            <div className="domain-card-copy">{blockedReason}</div>
          ) : null}
        </div>
      </label>
      <div className="domain-meta">
        <Tag tone={tone}>{label}</Tag>
        <Tag tone="gray">Fuente: {domain.sourceOfTruth}</Tag>
      </div>
    </div>
  );
}
