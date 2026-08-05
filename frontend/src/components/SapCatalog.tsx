import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { SapArticle, PaginationMeta } from "../types";
import { getSapProducts } from "../api/sap";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { Tag } from "./Tag";
import { money, fmt } from "../utils";

type StatusFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "with" | "without";
type CategoryFilter = "all" | "with" | "without";

const PAGE_SIZE = 50;

const SAP_COLUMNS = {
  itemCode: "OITM.ItemCode",
  itemName: "OITM.ItemName",
  price: "ITM1.AddPrice1",
  warehouse: "OITW.WhsCode",
  stock: "OITW.OnHand",
  barcode: "OITM.CodeBars",
  category: "@CAR_CATEGORIA.Name / OITM.U_Categoria",
  itemGroup: "OITB.ItmsGrpNam / OITM.ItmsGrpCod",
  manufacturerCode: "OITM.FirmCode",
  manufacturerCatalogNumber: "OITM.SuppCatNum",
  salesUnit: "OITM.SalUnitMsr",
  unitsPerPackage: "OITM.SalPackUn",
  weight: "OITM.SWeight1",
  pictureName: "OITM.PicturName",
  imageDir: "OADP.BitmapPath",
  prestashopVisibility: "OITM.QryGroup64",
  status: "OITM.validFor",
  foreignName: "OITM.FrgnName",
  longDescription: "OITM.UserText / OITM.FrgnName",
  shortDescription: "OITM.U_Desc_Logistica / OITM.FrgnName",
};

interface Props {
  onSyncItem?: (itemCode: string) => void;
  syncingItemCode?: string | null;
}

export function SapCatalog({ onSyncItem, syncingItemCode }: Props = {}) {
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<SapArticle[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedItemCode, setExpandedItemCode] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchPage(params: {
    page: number;
    search: string;
    status: StatusFilter;
    stock: StockFilter;
    category: CategoryFilter;
  }) {
    setLoading(true);
    setError(null);
    try {
      const data = await getSapProducts({
        page: params.page,
        pageSize: PAGE_SIZE,
        search: params.search || undefined,
        status: params.status,
        stock: params.stock,
        category: params.category,
      });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loaded) return;
    fetchPage({
      page,
      search,
      status: statusFilter,
      stock: stockFilter,
      category: categoryFilter,
    });
  }, [loaded, page, search, statusFilter, stockFilter, categoryFilter]);

  function startLoad() {
    setLoaded(true);
  }

  function onSearchInput(v: string) {
    setSearchInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(v);
      setPage(1);
    }, 350);
  }

  function onStatus(v: StatusFilter) {
    setStatusFilter(v);
    setPage(1);
  }

  function onStock(v: StockFilter) {
    setStockFilter(v);
    setPage(1);
  }

  function onCategory(v: CategoryFilter) {
    setCategoryFilter(v);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatusFilter("all");
    setStockFilter("all");
    setCategoryFilter("all");
    setPage(1);
  }

  if (!loaded) {
    return (
      <div className="card">
        <EmptyState
          icon="o"
          title="Catalogo no cargado"
          description="Carga la lista de articulos para explorar, filtrar y buscar en el catalogo SAP."
          action={{ label: "Cargar catalogo", onClick: startLoad }}
        />
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="card">
        <div className="catalog-loading-overlay">
          <span className="spinner-dark" />
          Cargando articulos...
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={20} />
          ))}
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="!"
          title="Error al cargar el catalogo"
          description={error}
          action={{
            label: "Reintentar",
            onClick: () =>
              fetchPage({
                page,
                search,
                status: statusFilter,
                stock: stockFilter,
                category: categoryFilter,
              }),
          }}
        />
      </div>
    );
  }

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const safePage = pagination?.page ?? page;
  const pageStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, total);
  const baseColSpan = onSyncItem ? 9 : 8;

  return (
    <>
      <div className="catalog-toolbar catalog-filter-panel">
        <input
          className="catalog-search"
          type="search"
          placeholder="Buscar por codigo o nombre..."
          value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)}
        />

        <div className="catalog-filter-row">
          <FilterSet label="Visibilidad">
            <button
              type="button"
              className={statusFilter === "all" ? "active" : ""}
              onClick={() => onStatus("all")}
            >
              Todos
            </button>
            <button
              type="button"
              className={statusFilter === "active" ? "active" : ""}
              onClick={() => onStatus("active")}
            >
              Visibles PS
            </button>
            <button
              type="button"
              className={statusFilter === "inactive" ? "active" : ""}
              onClick={() => onStatus("inactive")}
            >
              No visibles PS
            </button>
          </FilterSet>

          <FilterSet label="Stock">
            <button
              type="button"
              className={stockFilter === "all" ? "active" : ""}
              onClick={() => onStock("all")}
            >
              Todo
            </button>
            <button
              type="button"
              className={stockFilter === "with" ? "active" : ""}
              onClick={() => onStock("with")}
            >
              Con stock
            </button>
            <button
              type="button"
              className={stockFilter === "without" ? "active" : ""}
              onClick={() => onStock("without")}
            >
              Sin stock
            </button>
          </FilterSet>

          <FilterSet label="Categoria">
            <button
              type="button"
              className={categoryFilter === "all" ? "active" : ""}
              onClick={() => onCategory("all")}
            >
              Todas
            </button>
            <button
              type="button"
              className={categoryFilter === "with" ? "active" : ""}
              onClick={() => onCategory("with")}
            >
              Con categoria
            </button>
            <button
              type="button"
              className={categoryFilter === "without" ? "active" : ""}
              onClick={() => onCategory("without")}
            >
              Sin categoria
            </button>
          </FilterSet>
        </div>

        <button
          className="btn-secondary"
          type="button"
          disabled={loading}
          onClick={() =>
            fetchPage({
              page,
              search,
              status: statusFilter,
              stock: stockFilter,
              category: categoryFilter,
            })
          }
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          {loading && <span className="spinner-dark" />}
          {loading ? "Cargando" : "Recargar"}
        </button>
      </div>

      <div
        className="catalog-info"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        {loading && (
          <span className="spinner-dark" style={{ width: 11, height: 11 }} />
        )}
        {loading
          ? "Cargando..."
          : total === 0
            ? "Sin resultados para los filtros aplicados."
            : `Mostrando ${pageStart}-${pageEnd} de ${fmt(total)} articulo(s)`}
      </div>

      {!loading && total === 0 ? (
        <div className="card">
          <EmptyState
            icon="o"
            title="Sin resultados"
            description="Proba ajustando la busqueda o los filtros."
            action={{ label: "Limpiar filtros", onClick: clearFilters }}
          />
        </div>
      ) : (
        <>
          <div
            className="catalog-table-wrap"
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <HeaderWithSource
                      label="Codigo"
                      source={SAP_COLUMNS.itemCode}
                    />
                  </th>
                  <th scope="col" style={{ width: 64 }}>
                    <HeaderWithSource
                      label="Imagen"
                      source={SAP_COLUMNS.pictureName}
                    />
                  </th>
                  <th scope="col">
                    <HeaderWithSource
                      label="Nombre"
                      source={SAP_COLUMNS.itemName}
                    />
                  </th>
                  <th scope="col">
                    <HeaderWithSource
                      label="Categoria"
                      source={SAP_COLUMNS.category}
                    />
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    <HeaderWithSource
                      label="Precio"
                      source={SAP_COLUMNS.price}
                    />
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    <HeaderWithSource
                      label="Stock"
                      source={SAP_COLUMNS.stock}
                    />
                  </th>
                  <th scope="col">
                    <HeaderWithSource
                      label="Estado"
                      source={SAP_COLUMNS.prestashopVisibility}
                    />
                  </th>
                  {onSyncItem && <th scope="col" style={{ width: 80 }} />}
                  <th scope="col" style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const inactive = a.shouldShowInPrestashop !== true;
                  const zeroStock = (a.stock ?? 0) === 0;
                  const isSyncing = syncingItemCode === a.itemCode;
                  const isExpanded = expandedItemCode === a.itemCode;
                  const metadata = a.metadata ?? {};

                  return (
                    <FragmentRow
                      key={a.itemCode}
                      article={a}
                      inactive={inactive}
                      zeroStock={zeroStock}
                      isSyncing={isSyncing}
                      isExpanded={isExpanded}
                      metadata={metadata}
                      onSyncItem={onSyncItem}
                      syncingItemCode={syncingItemCode}
                      baseColSpan={baseColSpan}
                      onToggle={() =>
                        setExpandedItemCode(
                          isExpanded ? null : (a.itemCode ?? null),
                        )
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="section-note">{fmt(total)} articulo(s) total</div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasPreviousPage || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="pagination-label">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasNextPage || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FilterSet({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="catalog-filter-set">
      <span className="catalog-filter-label">{label}</span>
      <div className="catalog-filter-group">{children}</div>
    </div>
  );
}

function HeaderWithSource({
  label,
  source,
}: {
  label: string;
  source: string;
}) {
  return (
    <span className="sap-header-source">
      <span>{label}</span>
      <small>{source}</small>
    </span>
  );
}

function FieldWithSource({
  label,
  source,
  children,
}: {
  label: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <>
      <span>{label}</span>
      <small className="sap-source-note">{source}</small>
      <strong>{children}</strong>
    </>
  );
}

interface FragmentRowProps {
  article: SapArticle;
  inactive: boolean;
  zeroStock: boolean;
  isSyncing: boolean;
  isExpanded: boolean;
  metadata: NonNullable<SapArticle["metadata"]>;
  onSyncItem?: (itemCode: string) => void;
  syncingItemCode?: string | null;
  baseColSpan: number;
  onToggle: () => void;
}

function FragmentRow({
  article,
  inactive,
  zeroStock,
  isSyncing,
  isExpanded,
  metadata,
  onSyncItem,
  syncingItemCode,
  baseColSpan,
  onToggle,
}: FragmentRowProps) {
  return (
    <>
      <tr className={inactive ? "row-inactive" : ""}>
        <td style={{ fontFamily: "Consolas, monospace", fontSize: "0.88rem" }}>
          {article.itemCode ?? "-"}
        </td>
        <td>
          <ProductThumb
            src={article.sapImageUrl}
            alt={article.itemName || article.itemCode || "Imagen SAP"}
          />
        </td>
        <td>{article.itemName ?? "-"}</td>
        <td
          style={{
            color: article.category ? undefined : "var(--muted)",
            fontSize: "0.85rem",
          }}
        >
          {article.category ?? "-"}
        </td>
        <td style={{ textAlign: "right", fontWeight: 700 }}>
          {money(article.price)}
        </td>
        <td style={{ textAlign: "right" }}>
          <span className={zeroStock && !inactive ? "stock-zero" : ""}>
            {fmt(article.stock) ?? "0"}
          </span>
        </td>
        <td>
          <div className="tag-stack">
            <Tag tone={inactive ? "gray" : "green"}>
              {inactive ? "Inactivo PS" : "Activo PS"}
            </Tag>
            {article.status !== "Y" && <Tag tone="gray">SAP inactivo</Tag>}
          </div>
        </td>
        {onSyncItem && (
          <td>
            <button
              type="button"
              className="btn-secondary"
              style={{
                padding: "3px 10px",
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
              disabled={!!syncingItemCode}
              onClick={() => article.itemCode && onSyncItem(article.itemCode)}
            >
              {isSyncing && (
                <span
                  className="spinner-dark"
                  style={{ width: 10, height: 10 }}
                />
              )}
              {isSyncing ? "Sync..." : "Sync"}
            </button>
          </td>
        )}
        <td>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "3px 10px", fontSize: "0.8rem" }}
            onClick={onToggle}
          >
            {isExpanded ? "Ocultar" : "Detalle"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="sap-detail-row">
          <td colSpan={baseColSpan}>
            <div className="sap-detail-panel">
              <div className="sap-detail-grid">
                <div>
                  <FieldWithSource
                    label="Almacen"
                    source={SAP_COLUMNS.warehouse}
                  >
                    {fmt(article.warehouse)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Grupo SAP"
                    source={SAP_COLUMNS.itemGroup}
                  >
                    {fmt(metadata.itemGroupName || article.itemGroupCode)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Categoria SAP"
                    source={SAP_COLUMNS.category}
                  >
                    {fmt(metadata.category || article.category)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Codigo barras"
                    source={SAP_COLUMNS.barcode}
                  >
                    {fmt(article.barcode ?? metadata.barcode)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="MPN suplidor"
                    source={SAP_COLUMNS.manufacturerCatalogNumber}
                  >
                    {fmt(metadata.manufacturerCatalogNumber)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Marca SAP"
                    source={SAP_COLUMNS.manufacturerCode}
                  >
                    {fmt(metadata.manufacturerCode)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Unidad venta"
                    source={SAP_COLUMNS.salesUnit}
                  >
                    {fmt(metadata.salesUnit)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Unid. paquete"
                    source={SAP_COLUMNS.unitsPerPackage}
                  >
                    {fmt(metadata.unitsPerPackage)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource label="Peso" source={SAP_COLUMNS.weight}>
                    {fmt(metadata.weight)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Imagen SAP"
                    source={SAP_COLUMNS.pictureName}
                  >
                    {fmt(metadata.pictureName)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Ruta imagen SAP"
                    source={SAP_COLUMNS.imageDir}
                  >
                    {fmt(metadata.imageDir)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="QryGroup64"
                    source={SAP_COLUMNS.prestashopVisibility}
                  >
                    {fmt(article.prestashopVisibility)}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Visible en PrestaShop"
                    source={SAP_COLUMNS.prestashopVisibility}
                  >
                    {article.shouldShowInPrestashop ? "Si" : "No"}
                  </FieldWithSource>
                </div>
                <div>
                  <FieldWithSource
                    label="Nombre extranjero"
                    source={SAP_COLUMNS.foreignName}
                  >
                    {fmt(metadata.foreignName)}
                  </FieldWithSource>
                </div>
              </div>
              <div className="sap-detail-text">
                <span>Descripcion larga SAP</span>
                <small className="sap-source-note">
                  {SAP_COLUMNS.longDescription}
                </small>
                <p>{fmt(metadata.longDescription)}</p>
              </div>
              <div className="sap-detail-text">
                <span>Descripcion corta / logistica SAP</span>
                <small className="sap-source-note">
                  {SAP_COLUMNS.shortDescription}
                </small>
                <p>{fmt(metadata.shortDescription)}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProductThumb({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className="product-thumb product-thumb-empty">Sin foto</div>;
  }

  return (
    <img
      className="product-thumb"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
