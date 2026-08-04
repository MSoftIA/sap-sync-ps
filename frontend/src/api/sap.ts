import type {
  SapArticle,
  PaginationMeta,
  SapCategoryTree,
  PsCategory,
} from "../types";

export interface SapProductsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "inactive";
  stock?: "all" | "with" | "without";
  category?: "all" | "with" | "without";
}

export interface SapProductsResponse {
  pagination: PaginationMeta;
  items: SapArticle[];
}

let psCategoriesCache: Promise<PsCategory[]> | null = null;

export function clearPsCategoriesCache() {
  psCategoriesCache = null;
}

export function getPsCategories(): Promise<PsCategory[]> {
  if (!psCategoriesCache) {
    psCategoriesCache = fetch("/api/prestashop-categories")
      .then((res) => {
        if (!res.ok)
          throw new Error(
            "Error al cargar categorias PrestaShop: " + res.status,
          );
        return res.json() as Promise<{ categories?: PsCategory[] }>;
      })
      .then((data) => data.categories ?? [])
      .catch((err) => {
        psCategoriesCache = null;
        throw err;
      });
  }
  return psCategoriesCache;
}

export async function getSapCategories(): Promise<SapCategoryTree> {
  const res = await fetch("/api/sap-categories");
  if (!res.ok) throw new Error("Error al cargar categorias SAP: " + res.status);
  return res.json();
}

export async function getSapProducts(
  params: SapProductsParams = {},
): Promise<SapProductsResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  if (params.stock) q.set("stock", params.stock);
  if (params.category) q.set("category", params.category);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch("/api/sap-products?" + q, {
      signal: controller.signal,
    });
    if (!res.ok)
      throw new Error("Error al cargar articulos SAP: " + res.status);
    return res.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("SAP tardo demasiado en responder el catalogo.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
