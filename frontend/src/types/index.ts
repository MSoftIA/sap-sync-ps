export interface SyncDomain {
  key: string;
  status: "active" | "diagnostic" | "discovery" | "planned";
  sourceOfTruth: string;
  writeEnabled?: boolean;
  writeBlockedReason?: string | null;
  scope: string[];
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
  defaultCategory: string;
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

export type View = "sync" | "products" | "categories" | "automation";

export interface ScheduleConfig {
  enabled: boolean;
  runAt: string; // HH:MM hora local del servidor
  domains: string[];
  write: boolean;
}

export interface ScheduleLastRun {
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  triggered: "auto" | "manual";
}

export interface ScheduleStatus {
  config: ScheduleConfig;
  nextRun: string | null;
  lastRun: ScheduleLastRun | null;
}
export type TagTone = "green" | "amber" | "red" | "gray";
export type MessageKind = "info" | "warn" | "error";
export type StatusTone = "ok" | "warn" | "error";
