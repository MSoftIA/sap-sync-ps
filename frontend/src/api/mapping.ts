import type {
  ProductAttributeMappingConfig,
  ProductAttributeMappingPayload,
} from "../types";

export async function getProductAttributeMapping(): Promise<ProductAttributeMappingPayload> {
  const res = await fetch("/api/product-attribute-mapping");
  if (!res.ok) throw new Error("Error al cargar mapeo: " + res.status);
  return res.json();
}

export async function saveProductAttributeMapping(
  config: ProductAttributeMappingConfig,
): Promise<ProductAttributeMappingPayload> {
  const res = await fetch("/api/product-attribute-mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data?.error || "Error al guardar mapeo"));
  }
  return data;
}
