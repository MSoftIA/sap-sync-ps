"use strict";

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const PORT = process.env.MOCK_PORT || 3000;
const SNAPSHOT_PATH =
  process.env.MOCK_DATA_FILE ||
  path.join(__dirname, "mock-data", "latest.json");

app.use(express.static(path.join(__dirname, "dist")));
app.use(express.json());

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function buildContrast(sap, ps) {
  return {
    productGap: (sap?.totalProducts || 0) - (ps?.totalProducts || 0),
    activeGap: (sap?.activeProducts || 0) - (ps?.activeProducts || 0),
    inactiveGap: (sap?.inactiveProducts || 0) - (ps?.inactiveProducts || 0),
    missingProductsInPrestashop: Math.max(
      (sap?.totalProducts || 0) - (ps?.totalProducts || 0),
      0,
    ),
    extraProductsInPrestashop: Math.max(
      (ps?.totalProducts || 0) - (sap?.totalProducts || 0),
      0,
    ),
    activeProductsMissingInPrestashop: Math.max(
      (sap?.activeProducts || 0) - (ps?.activeProducts || 0),
      0,
    ),
    inactiveProductsExtraInPrestashop: Math.max(
      (ps?.inactiveProducts || 0) - (sap?.inactiveProducts || 0),
      0,
    ),
    sapHasMoreProducts: (sap?.totalProducts || 0) > (ps?.totalProducts || 0),
    sapHasFewerProducts: (sap?.totalProducts || 0) < (ps?.totalProducts || 0),
  };
}

function mockPaginate(items, req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(250, Math.max(1, Number(req.query.pageSize) || 50));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  return {
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
    pageItems: items.slice(offset, offset + pageSize),
  };
}

function createFallbackArticles() {
  const names = [
    "ACEITE LUBRICANTE 20W-50 1L",
    "FILTRO DE ACEITE UNIVERSAL",
    "PASTILLAS DE FRENO DELANTERO",
    "BUJIA NGK B8ES",
    "AMORTIGUADOR TRASERO MONROE",
  ];

  return Array.from({ length: 120 }, (_, index) => {
    const itemCode = String(61072500 + index);
    const itemName = `${names[index % names.length]} #${index + 1}`;
    const price = Math.round((80 + index * 7.5) * 100) / 100;
    const stock = index % 6 === 0 ? 0 : (index * 3) % 150;
    const status = index % 8 === 0 ? "N" : "Y";

    return {
      itemCode,
      itemName,
      price,
      stock,
      status,
    };
  });
}

function derivePrestaProductsFromSap(sapProducts) {
  return sapProducts
    .filter((_, index) => index % 9 !== 4)
    .map((item, index) => ({
      productId: 1000 + index,
      reference: item.itemCode,
      name: item.itemName,
      active: item.status === "Y" && index % 7 !== 0 ? "1" : "0",
      productPrice: Number(item.price || 0),
      combinationCount: index % 11 === 0 ? 2 : 0,
      hasCombinations: index % 11 === 0,
      stockTotal: index % 11 === 0 ? 0 : Number(item.stock || 0),
      stockRows: index % 11 === 0 ? 2 : 1,
      directStock: index % 11 === 0 ? null : Number(item.stock || 0),
      defaultCategory: "",
    }));
}

function deriveFallbackReports(total, missing) {
  const now = Date.now();

  return [
    {
      generatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
      summary: {
        total,
        matchedProductOk: Math.max(total - missing - 12, 0),
        matchedProductDiff: 8,
        createFromSap: missing,
        needsReview: 4,
        errors: 0,
      },
      recommendedActions: {
        createProduct: missing,
        updateProductPrice: 5,
        updateProductStock: 3,
        updateProductPriceAndStock: 0,
        skipNoChange: Math.max(total - missing - 12, 0),
        reviewCombinationMapping: 3,
        reviewError: 1,
        blocked: 0,
        executed: 0,
      },
      detectedActions: {
        createProduct: missing,
        updateProductPrice: 5,
        updateProductStock: 3,
        updateProductPriceAndStock: 0,
        skipNoChange: Math.max(total - missing - 12, 0),
        reviewCombinationMapping: 3,
        reviewError: 1,
        blocked: 0,
        executed: 0,
      },
    },
  ];
}

const snapshot = readJsonSafe(SNAPSHOT_PATH);
const fallbackSapProducts = createFallbackArticles();
const sapProducts =
  Array.isArray(snapshot?.sapProducts) && snapshot.sapProducts.length > 0
    ? snapshot.sapProducts
    : fallbackSapProducts;
const prestashopProducts =
  Array.isArray(snapshot?.prestashopProducts) &&
  snapshot.prestashopProducts.length > 0
    ? snapshot.prestashopProducts
    : derivePrestaProductsFromSap(sapProducts);
const reports =
  Array.isArray(snapshot?.reports) && snapshot.reports.length > 0
    ? snapshot.reports
    : deriveFallbackReports(
        sapProducts.length,
        Math.max(sapProducts.length - prestashopProducts.length, 0),
      );

const catalogOverview =
  snapshot?.catalogOverview ||
  (() => {
    const activeSap = sapProducts.filter((item) => item.status === "Y").length;
    const activePresta = prestashopProducts.filter(
      (item) => String(item.active) === "1",
    ).length;
    const sap = {
      source: "sap",
      schema: "BD_CARBALLO",
      warehouse: "AC01",
      priceList: 14,
      totalProducts: sapProducts.length,
      activeProducts: activeSap,
      inactiveProducts: sapProducts.length - activeSap,
      productsWithStock: sapProducts.filter((item) => Number(item.stock) > 0)
        .length,
      productsWithoutStock: sapProducts.filter(
        (item) => Number(item.stock) <= 0,
      ).length,
      totalStock: sapProducts.reduce(
        (acc, item) => acc + Number(item.stock || 0),
        0,
      ),
    };
    const prestashop = {
      source: "prestashop",
      totalProducts: prestashopProducts.length,
      activeProducts: activePresta,
      inactiveProducts: prestashopProducts.length - activePresta,
      totalCombinations: prestashopProducts.reduce(
        (acc, item) => acc + Number(item.combinationCount || 0),
        0,
      ),
    };

    return {
      generatedAt: new Date().toISOString(),
      sap,
      prestashop,
      contrast: buildContrast(sap, prestashop),
    };
  })();

const domainAnalysis =
  snapshot?.domainAnalysis ||
  (() => ({
    generatedAt: new Date().toISOString(),
    domains: {
      products: {
        key: "products",
        available: true,
        generatedAt: reports[0]?.generatedAt || new Date().toISOString(),
        summary: reports[0]?.summary || {},
        recommendedActions: reports[0]?.recommendedActions || {},
      },
      categories: {
        key: "categories",
        available: true,
        generatedAt: new Date().toISOString(),
        summary: {
          total: sapProducts.length,
          productsEvaluated: sapProducts.length,
          uniqueMainCategories: 24,
          categoriesInPrestashop: 18,
          categoriesMissingInPrestashop: 6,
          rowsWithoutMainCategory: 0,
        },
      },
      orders: {
        key: "orders",
        available: true,
        generatedAt: new Date().toISOString(),
        summary: {
          totalOrders: 42,
          prestaTotalOrders: 0,
          orderGap: 42,
          ordersLast30Days: 11,
          openOrders: 7,
          closedOrders: 31,
          canceledOrders: 4,
          uniqueCustomers: 13,
          latestDocNum: 38529,
        },
      },
    },
  }))();

const syncDomains = snapshot?.syncDomains || {
  generatedAt: new Date().toISOString(),
  sourceOfTruth: "sap",
  domains: [
    {
      key: "products",
      status: "active",
      sourceOfTruth: "sap",
      writesReports: true,
      scope: ["price", "stock", "create"],
    },
    {
      key: "categories",
      status: "active",
      sourceOfTruth: "sap",
      writesReports: false,
      scope: ["category_mapping"],
    },
    {
      key: "orders",
      status: "diagnostic",
      sourceOfTruth: "sap",
      writesReports: false,
      scope: ["read_only"],
    },
  ],
};

let activeSync = null;

app.get("/api/reports", (_req, res) => {
  res.json(reports);
});

app.get("/api/status", (_req, res) => {
  res.json(
    activeSync
      ? {
          running: true,
          startedAt: activeSync.startedAt,
          stopRequested: Boolean(activeSync.stopRequested),
        }
      : { running: false },
  );
});

app.get("/api/catalog-overview", (_req, res) => {
  res.json(catalogOverview);
});

app.get("/api/dashboard-summary", (_req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    latestReport: reports[0] || null,
    overview: catalogOverview,
    executive: {
      overallStatus: "attention",
      headline:
        "Snapshot mock cargado. Puedes usar este tablero fuera del servidor real.",
    },
  });
});

app.get("/api/domain-analysis", (_req, res) => {
  res.json(domainAnalysis);
});

app.get("/api/sync-domains", (_req, res) => {
  res.json(syncDomains);
});

app.get("/api/sap-products", (req, res) => {
  const search = String(req.query.search || "")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();
  const stock = String(req.query.stock || "all")
    .trim()
    .toLowerCase();

  let filtered = sapProducts;

  if (status === "active") {
    filtered = filtered.filter((item) => String(item.status) === "Y");
  } else if (status === "inactive") {
    filtered = filtered.filter((item) => String(item.status) !== "Y");
  }

  if (stock === "with") {
    filtered = filtered.filter((item) => Number(item.stock || 0) > 0);
  } else if (stock === "without") {
    filtered = filtered.filter((item) => Number(item.stock || 0) <= 0);
  }

  if (search) {
    filtered = filtered.filter((item) =>
      [item.itemCode, item.itemName].join(" ").toLowerCase().includes(search),
    );
  }

  const { pagination, pageItems } = mockPaginate(filtered, req);
  res.json({
    source: "sap",
    filters: { search, status, stock },
    pagination,
    items: pageItems,
  });
});

app.get("/api/prestashop-products", (req, res) => {
  const search = String(req.query.search || "")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();
  const combo = String(req.query.combo || "all")
    .trim()
    .toLowerCase();

  let filtered = prestashopProducts;

  if (status === "active") {
    filtered = filtered.filter((item) => String(item.active) === "1");
  } else if (status === "inactive") {
    filtered = filtered.filter((item) => String(item.active) !== "1");
  }

  if (combo === "simple") {
    filtered = filtered.filter((item) => !item.hasCombinations);
  } else if (combo === "combo") {
    filtered = filtered.filter((item) => item.hasCombinations);
  }

  if (search) {
    filtered = filtered.filter((item) =>
      [item.reference, item.name, item.productId]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }

  const { pagination, pageItems } = mockPaginate(filtered, req);
  res.json({
    source: "prestashop",
    filters: { search, status, combo },
    pagination,
    items: pageItems,
  });
});

app.get("/api/prestashop-control", (req, res) => {
  const reference = String(req.query.reference || "").trim();
  const sap =
    sapProducts.find((item) => String(item.itemCode) === reference) || null;
  const prestashop =
    prestashopProducts.find((item) => String(item.reference) === reference) ||
    null;

  res.json({
    reference,
    sap,
    prestashop,
    comparison: {
      existsInSap: Boolean(sap),
      existsInPrestashop: Boolean(prestashop),
      samePrice:
        Boolean(sap && prestashop) &&
        Number(sap.price || 0) === Number(prestashop.productPrice || 0),
      stockRecords: prestashop ? Number(prestashop.stockRows || 0) : 0,
    },
  });
});

app.post("/api/prestashop-control/active", (req, res) => {
  res.json({
    ok: true,
    message: req.body.active
      ? "Producto activado en PrestaShop (mock)"
      : "Producto desactivado en PrestaShop (mock)",
  });
});

function jsonLine(level, message, extra = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...extra,
  });
}

app.get("/api/sync", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const syncDomainsQuery = req.query.syncDomains
    ? String(req.query.syncDomains)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : ["products"];
  const write = req.query.write === "true";
  const itemCode = String(req.query.itemCode || "").trim();
  const rawLimit = Number(req.query.limit || 0);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 0;

  let items = sapProducts;

  if (itemCode) {
    items = items.filter((item) => String(item.itemCode) === itemCode);
  }

  if (limit > 0) {
    items = items.slice(0, limit);
  }

  const total = items.length;
  const syncState = {
    startedAt: new Date().toISOString(),
    stopRequested: false,
  };
  activeSync = syncState;

  const send = (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  };

  const logLine = (level, message, extra = {}) =>
    send({ type: "log", line: jsonLine(level, message, extra) });

  logLine("info", "Iniciando sync mock", {
    domains: syncDomainsQuery.join(","),
    write,
    itemCode,
    limit,
    total,
    snapshotLoaded: Boolean(snapshot),
  });

  let index = 0;
  const interval = setInterval(() => {
    if (syncState.stopRequested) {
      clearInterval(interval);
      send({ type: "done", code: 0, stopped: true });
      activeSync = null;
      try {
        res.end();
      } catch {}
      return;
    }

    if (index >= total) {
      logLine("info", "Sync mock completada", {
        domain: syncDomainsQuery[0] || "products",
        total,
      });
      clearInterval(interval);
      send({ type: "done", code: 0 });
      activeSync = null;
      try {
        res.end();
      } catch {}
      return;
    }

    const item = items[index];
    const current = index + 1;
    const percent = total > 0 ? Math.round((current / total) * 100) : 100;

    send({
      type: "log",
      line: jsonLine("info", "Progreso de dominio", {
        domain: syncDomainsQuery[0] || "products",
        current,
        total,
        percent,
        itemCode: item.itemCode,
      }),
    });

    index += 1;
  }, 80);

  req.on("close", () => {
    clearInterval(interval);
  });
});

app.post("/api/sync/stop", (_req, res) => {
  if (!activeSync) {
    res.status(409).json({ ok: false, error: "No hay una sync mock activa" });
    return;
  }

  activeSync.stopRequested = true;
  res.json({ ok: true, message: "Sync mock marcada para detenerse" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Mock panel disponible en http://localhost:${PORT}`);
  if (snapshot) {
    console.log(`Usando snapshot mock: ${SNAPSHOT_PATH}`);
    console.log(
      `Snapshot generado el ${snapshot.generatedAt || "desconocido"} desde ${snapshot.sourceBaseUrl || "origen desconocido"}`,
    );
  } else {
    console.log("Sin snapshot mock. Usando datos ficticios embebidos.");
  }
});
