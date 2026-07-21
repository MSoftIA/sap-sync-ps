export interface SyncDomain {
  key: string;
  status: "active" | "diagnostic" | "discovery" | "planned";
  sourceOfTruth: string;
  writesReports: boolean;
  writeEnabled?: boolean;
  writeBlockedReason?: string | null;
  scope: string[];
}

export interface SapOverview {
  source: "sap";
  schema?: string;
  warehouse?: string;
  priceList?: number;
  totalProducts?: number;
  activeProducts?: number;
  inactiveProducts?: number;
  productsWithStock?: number;
  productsWithoutStock?: number;
  totalStock?: number;
  totalPriceListValue?: number;
  error?: string;
}

export interface PrestaOverview {
  source: "prestashop";
  totalProducts?: number;
  activeProducts?: number;
  inactiveProducts?: number;
  totalCombinations?: number;
  error?: string;
}

export interface CatalogContrast {
  productGap: number;
  activeGap: number;
  inactiveGap: number;
  missingProductsInPrestashop: number;
  extraProductsInPrestashop: number;
  activeProductsMissingInPrestashop: number;
  inactiveProductsExtraInPrestashop: number;
  sapHasMoreProducts: boolean;
  sapHasFewerProducts: boolean;
}

export interface CatalogOverview {
  generatedAt: string;
  sap: SapOverview;
  prestashop: PrestaOverview;
  contrast: CatalogContrast | null;
}

export interface ReportActions {
  createProduct?: number;
  updateProductPrice?: number;
  updateProductStock?: number;
  updateProductPriceAndStock?: number;
  skipNoChange?: number;
  reviewCombinationMapping?: number;
  reviewError?: number;
  blocked?: number;
  executed?: number;
}

export interface ReportSummary {
  total?: number;
  matchedProductOk?: number;
  matchedProductDiff?: number;
  matchedCombinationReview?: number;
  createFromSap?: number;
  needsReview?: number;
  errors?: number;
}

export interface Report {
  generatedAt?: string;
  recommendedActions?: ReportActions;
  detectedActions?: ReportActions;
  summary?: ReportSummary;
  domain?: string;
}

export interface SyncProgress {
  domain: string;
  current: number;
  total: number;
  percent: number;
  itemCode: string;
  known: boolean;
}

export interface SyncStatus {
  running: boolean;
  startedAt?: string;
  pid?: number;
  logLines?: number;
}

export interface DomainSummaryEntry {
  key: string;
  available: boolean;
  generatedAt?: string | null;
  summary?: Record<string, unknown>;
  recommendedActions?: ReportActions;
  alignment?: {
    expectedOperationalCatalog: number;
    reportCatalog: number;
    isAligned: boolean;
  };
  note?: string;
}

export interface DomainAnalysis {
  generatedAt: string;
  domains: {
    products: DomainSummaryEntry;
    categories: DomainSummaryEntry;
    orders: DomainSummaryEntry & {
      summary?: {
        ordersLast30Days?: number;
        openOrders?: number;
        closedOrders?: number;
        canceledOrders?: number;
        uniqueCustomers?: number;
        latestDocNum?: number | null;
        latestDocDate?: string | null;
        writeReadiness?: {
          ready?: boolean;
          canReadSap?: boolean;
          canComparePrestashop?: boolean;
          canWrite?: boolean;
          availableSapFields?: string[];
          missingRequirements?: string[];
          nextStep?: string;
        };
      };
    };
  };
}

export interface SapArticle {
  itemCode?: string;
  itemName?: string;
  price?: number;
  stock?: number;
  status?: string;
  category?: string | null;
  error?: string;
}

export interface PrestaProduct {
  productId?: number;
  reference?: string;
  active?: string;
  productPrice?: number;
  combinations?: unknown[];
  stockAvailables?: unknown[];
  error?: string;
}

export interface PrestaControlResult {
  reference: string;
  sap: SapArticle | null;
  prestashop: PrestaProduct | null;
  comparison: {
    existsInSap: boolean;
    existsInPrestashop: boolean;
    samePrice?: boolean;
    stockRecords?: number;
  } | null;
}

export interface PrestaProductSummary {
  productId: number;
  reference: string;
  name: string;
  active: "1" | "0";
  productPrice: number;
  combinationCount: number;
  hasCombinations: boolean;
  stockTotal: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PsCategory {
  id: number
  parentId: number
  active: string
  name: string
}

export interface SapCategoryNode {
  name: string
  total: number
  children: SapCategoryNode[]
}

export interface SapCategoryTree {
  totalProducts: number
  categorized: number
  uncategorized: number
  categories: SapCategoryNode[]
  error?: string
}

export type View = "sync" | "products" | "categories";
export type TagTone = "green" | "amber" | "red" | "gray";
export type MessageKind = "info" | "warn" | "error";
export type StatusTone = "ok" | "warn" | "error";
