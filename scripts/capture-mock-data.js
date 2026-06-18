"use strict";

const fs = require("node:fs");
const path = require("node:path");

function getArgValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function normalizeBaseUrl(value) {
  return String(value || "http://localhost:3000").replace(/\/+$/, "");
}

async function fetchJson(baseUrl, endpoint) {
  const url = baseUrl + endpoint;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al consultar ${url}`);
  }

  return response.json();
}

async function fetchAllPages(baseUrl, endpoint, extraParams = {}) {
  const pageSize = 250;
  let page = 1;
  let totalPages = 1;
  const items = [];

  while (page <= totalPages) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...Object.fromEntries(
        Object.entries(extraParams).filter(
          ([, value]) => value !== undefined && value !== null && value !== "",
        ),
      ),
    });

    const payload = await fetchJson(
      baseUrl,
      `${endpoint}?${params.toString()}`,
    );
    const pageItems = Array.isArray(payload.items) ? payload.items : [];
    const pagination = payload.pagination || {};

    items.push(...pageItems);
    totalPages = Math.max(1, Number(pagination.totalPages) || 1);
    page += 1;
  }

  return items;
}

async function main() {
  const baseUrl = normalizeBaseUrl(
    getArgValue("baseUrl") || process.env.MOCK_CAPTURE_BASE_URL,
  );
  const outputPath = path.resolve(
    getArgValue("out") ||
      process.env.MOCK_CAPTURE_OUT ||
      path.join(process.cwd(), "mock-data", "latest.json"),
  );

  console.log(`Capturando datos mock desde ${baseUrl}`);

  const [
    catalogOverview,
    reports,
    domainAnalysis,
    syncDomains,
    sapProducts,
    prestashopProducts,
  ] = await Promise.all([
    fetchJson(baseUrl, "/api/catalog-overview"),
    fetchJson(baseUrl, "/api/reports"),
    fetchJson(baseUrl, "/api/domain-analysis"),
    fetchJson(baseUrl, "/api/sync-domains"),
    fetchAllPages(baseUrl, "/api/sap-products"),
    fetchAllPages(baseUrl, "/api/prestashop-products"),
  ]);

  const sampleReferences = [
    ...new Set(
      [
        ...sapProducts.slice(0, 10).map((item) => item.itemCode),
        ...prestashopProducts.slice(0, 10).map((item) => item.reference),
      ].filter(Boolean),
    ),
  ].slice(0, 12);

  const referenceChecks = [];

  for (const reference of sampleReferences) {
    try {
      const payload = await fetchJson(
        baseUrl,
        `/api/prestashop-control?reference=${encodeURIComponent(reference)}`,
      );
      referenceChecks.push(payload);
    } catch (error) {
      referenceChecks.push({
        reference,
        error: error.message,
      });
    }
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    sourceBaseUrl: baseUrl,
    catalogOverview,
    reports,
    domainAnalysis,
    syncDomains,
    sapProducts,
    prestashopProducts,
    referenceChecks,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(snapshot, null, 2) + "\n",
    "utf8",
  );

  console.log(`Snapshot guardado en ${outputPath}`);
  console.log(
    `SAP=${sapProducts.length} productos | PrestaShop=${prestashopProducts.length} productos | Reports=${Array.isArray(reports) ? reports.length : 0}`,
  );
}

main().catch((error) => {
  console.error("No pude capturar los mocks:", error.message);
  process.exitCode = 1;
});
