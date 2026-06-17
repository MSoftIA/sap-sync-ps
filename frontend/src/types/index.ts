export interface SyncDomain {
  key: string
  status: 'active' | 'diagnostic' | 'discovery' | 'planned'
  sourceOfTruth: string
  writesReports: boolean
  scope: string[]
}

export interface SapOverview {
  source: 'sap'
  schema?: string
  warehouse?: string
  priceList?: number
  totalProducts?: number
  activeProducts?: number
  inactiveProducts?: number
  productsWithStock?: number
  productsWithoutStock?: number
  totalStock?: number
  totalPriceListValue?: number
  error?: string
}

export interface PrestaOverview {
  source: 'prestashop'
  totalProducts?: number
  activeProducts?: number
  inactiveProducts?: number
  totalCombinations?: number
  error?: string
}

export interface CatalogContrast {
  productGap: number
  activeGap: number
  inactiveGap: number
  missingProductsInPrestashop: number
  extraProductsInPrestashop: number
  activeProductsMissingInPrestashop: number
  inactiveProductsExtraInPrestashop: number
  sapHasMoreProducts: boolean
  sapHasFewerProducts: boolean
}

export interface CatalogOverview {
  generatedAt: string
  sap: SapOverview
  prestashop: PrestaOverview
  contrast: CatalogContrast | null
}

export interface ReportActions {
  createProduct?: number
  updateProductPrice?: number
  updateProductStock?: number
  updateProductPriceAndStock?: number
  skipNoChange?: number
  reviewCombinationMapping?: number
  reviewError?: number
  blocked?: number
  executed?: number
}

export interface ReportSummary {
  total?: number
  matchedProductOk?: number
  matchedProductDiff?: number
  matchedCombinationReview?: number
  createFromSap?: number
  needsReview?: number
  errors?: number
}

export interface Report {
  generatedAt?: string
  recommendedActions?: ReportActions
  summary?: ReportSummary
  domain?: string
}

export interface SyncProgress {
  domain: string
  current: number
  total: number
  percent: number
  itemCode: string
  known: boolean
}

export interface SyncStatus {
  running: boolean
  startedAt?: string
  pid?: number
  logLines?: number
}

export interface DomainSummaryEntry {
  key: string
  available: boolean
  generatedAt?: string | null
  summary?: Record<string, unknown>
  recommendedActions?: ReportActions
  alignment?: {
    expectedOperationalCatalog: number
    reportCatalog: number
    isAligned: boolean
  }
  note?: string
}

export interface DomainAnalysis {
  generatedAt: string
  domains: {
    products: DomainSummaryEntry
    categories: DomainSummaryEntry
    orders: DomainSummaryEntry & {
      summary?: {
        ordersLast30Days?: number
        openOrders?: number
        closedOrders?: number
        canceledOrders?: number
        uniqueCustomers?: number
        latestDocNum?: number | null
        latestDocDate?: string | null
      }
    }
  }
}

export interface SapArticle {
  itemCode?: string
  itemName?: string
  price?: number
  stock?: number
  status?: string
  error?: string
}

export interface PrestaProduct {
  productId?: number
  reference?: string
  active?: string
  productPrice?: number
  combinations?: unknown[]
  stockAvailables?: unknown[]
  error?: string
}

export interface PrestaControlResult {
  reference: string
  sap: SapArticle | null
  prestashop: PrestaProduct | null
  comparison: {
    existsInSap: boolean
    existsInPrestashop: boolean
    samePrice?: boolean
    stockRecords?: number
  } | null
}

export interface PrestaProductSummary {
  productId: number
  reference: string
  name: string
  active: '1' | '0'
  price: number
  combinations: number
  stock: number
}

export type View = 'sync' | 'sap' | 'presta'
export type TagTone = 'green' | 'amber' | 'red' | 'gray'
export type MessageKind = 'info' | 'warn' | 'error'
export type StatusTone = 'ok' | 'warn' | 'error'
