const { env } = require("./env");
const { runProductDomain } = require("./domains/products");
const { runCategoryDomain } = require("./domains/categories");
const { runOrderDomain } = require("./domains/orders");

const DOMAIN_REGISTRY = {
  products: {
    key: "products",
    runner: runProductDomain,
    writesReports: true,
    sourceOfTruth: "sap",
    status: "active",
    scope: [
      "productos simples",
      "precios",
      "stock",
      "variantes en modo comparacion",
    ],
  },
  categories: {
    key: "categories",
    runner: runCategoryDomain,
    writesReports: false,
    sourceOfTruth: "sap",
    status: "diagnostic",
    scope: [
      "arbol de categorias",
      "mapeo jerarquico",
      "asociacion producto-categoria",
    ],
  },
  orders: {
    key: "orders",
    runner: runOrderDomain,
    writesReports: false,
    sourceOfTruth: "sap",
    status: "discovery",
    scope: [
      "definicion del flujo de negocio",
      "estados de pedido",
      "seguimiento y despacho",
    ],
  },
};

function listSyncDomains() {
  return Object.values(DOMAIN_REGISTRY).map((domain) => ({
    key: domain.key,
    writesReports: domain.writesReports,
    sourceOfTruth: domain.sourceOfTruth,
    status: domain.status,
    scope: [...domain.scope],
  }));
}

function parseSyncDomains(rawValue = env("SYNC_DOMAINS", "products")) {
  const requested = String(rawValue || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!requested.length) {
    return {
      domains: [DOMAIN_REGISTRY.products],
      unknown: [],
    };
  }

  const domains = [];
  const unknown = [];

  for (const key of requested) {
    if (!DOMAIN_REGISTRY[key]) {
      unknown.push(key);
      continue;
    }

    if (!domains.some((domain) => domain.key === key)) {
      domains.push(DOMAIN_REGISTRY[key]);
    }
  }

  if (!domains.length) {
    return {
      domains: [DOMAIN_REGISTRY.products],
      unknown,
    };
  }

  return {
    domains,
    unknown,
  };
}

module.exports = {
  listSyncDomains,
  parseSyncDomains,
};
