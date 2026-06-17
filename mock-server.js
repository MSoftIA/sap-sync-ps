"use strict";

/**
 * mock-server.js — Servidor de desarrollo con datos ficticios.
 *
 * No requiere SAP HANA ni PrestaShop configurados.
 *
 * Usos:
 *   # Vista rapida (requiere build previo):
 *   npm run build && npm run mock
 *   → http://localhost:3000
 *
 *   # Dev con hot-reload (dos terminales):
 *   npm run mock          ← terminal 1
 *   npm run dev           ← terminal 2
 *   → http://localhost:5173
 */

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.MOCK_PORT || 3000;

app.use(express.static(path.join(__dirname, "dist")));
app.use(express.json());

// ── Datos mock ────────────────────────────────────────────────────────────────

const MOCK_SAP = {
  source: "sap",
  schema: "BD_CARBALLO",
  warehouse: "AC01",
  priceList: 14,
  totalProducts: 1842,
  activeProducts: 1654,
  inactiveProducts: 188,
  productsWithStock: 1423,
  productsWithoutStock: 419,
  totalStock: 48520.5,
};

const MOCK_PRESTA = {
  source: "prestashop",
  totalProducts: 1589,
  activeProducts: 1401,
  inactiveProducts: 188,
  totalCombinations: 234,
};

function buildContrast(sap, ps) {
  return {
    productGap: sap.totalProducts - ps.totalProducts,
    activeGap: sap.activeProducts - ps.activeProducts,
    inactiveGap: sap.inactiveProducts - ps.inactiveProducts,
    missingProductsInPrestashop: Math.max(sap.totalProducts - ps.totalProducts, 0),
    extraProductsInPrestashop: Math.max(ps.totalProducts - sap.totalProducts, 0),
    activeProductsMissingInPrestashop: Math.max(sap.activeProducts - ps.activeProducts, 0),
    inactiveProductsExtraInPrestashop: Math.max(ps.inactiveProducts - sap.inactiveProducts, 0),
    sapHasMoreProducts: sap.totalProducts > ps.totalProducts,
    sapHasFewerProducts: sap.totalProducts < ps.totalProducts,
  };
}

const now = Date.now();

const MOCK_REPORTS = [
  {
    generatedAt: new Date(now - 3_600_000).toISOString(),
    domain: null,
    summary: { total: 150, matchedProductOk: 118, matchedProductDiff: 21, createFromSap: 9, needsReview: 4, errors: 2 },
    recommendedActions: {
      createProduct: 9,
      updateProductPrice: 11,
      updateProductStock: 6,
      updateProductPriceAndStock: 4,
      skipNoChange: 118,
      reviewCombinationMapping: 3,
      reviewError: 1,
      executed: 0,
    },
  },
  {
    generatedAt: new Date(now - 86_400_000).toISOString(),
    domain: null,
    summary: { total: 1842, matchedProductOk: 1581, matchedProductDiff: 179, createFromSap: 82, needsReview: 11, errors: 0 },
    recommendedActions: {
      createProduct: 82,
      updateProductPrice: 90,
      updateProductStock: 61,
      updateProductPriceAndStock: 28,
      skipNoChange: 1581,
      reviewCombinationMapping: 11,
      reviewError: 0,
      executed: 0,
    },
  },
  {
    generatedAt: new Date(now - 172_800_000).toISOString(),
    domain: null,
    summary: { total: 1842, matchedProductOk: 1600, matchedProductDiff: 160, createFromSap: 82, needsReview: 10, errors: 0 },
    recommendedActions: {
      createProduct: 82,
      updateProductPrice: 80,
      updateProductStock: 56,
      updateProductPriceAndStock: 24,
      skipNoChange: 1600,
      reviewCombinationMapping: 10,
      reviewError: 0,
      executed: 230,
    },
  },
];

const MOCK_DOMAIN_ANALYSIS = {
  generatedAt: new Date().toISOString(),
  domains: {
    products: {
      key: "products",
      available: true,
      generatedAt: new Date(now - 3_600_000).toISOString(),
      summary: { total: 150, errors: 2 },
      recommendedActions: {
        createProduct: 9,
        updateProductPrice: 11,
        updateProductStock: 6,
        updateProductPriceAndStock: 4,
        skipNoChange: 118,
        reviewCombinationMapping: 3,
        reviewError: 1,
      },
    },
    categories: {
      key: "categories",
      available: true,
      generatedAt: new Date(now - 7_200_000).toISOString(),
      summary: {
        total: 1842,
        uniqueMainCategories: 34,
        uniqueActiveProperties: 12,
        rowsWithoutMainCategory: 23,
      },
      alignment: {
        expectedOperationalCatalog: 1842,
        reportCatalog: 1842,
        isAligned: true,
      },
    },
    orders: {
      key: "orders",
      available: true,
      generatedAt: new Date().toISOString(),
      summary: {
        ordersLast30Days: 47,
        openOrders: 12,
        closedOrders: 31,
        canceledOrders: 4,
        uniqueCustomers: 23,
        latestDocNum: 5842,
        latestDocDate: new Date(now - 86_400_000).toISOString(),
      },
      note: "Lectura operativa de pedidos desde SAP.",
    },
  },
};

const MOCK_SYNC_DOMAINS = {
  generatedAt: new Date().toISOString(),
  sourceOfTruth: "sap",
  domains: [
    { key: "products",   status: "active",      sourceOfTruth: "sap", writesReports: true,  scope: ["price", "stock", "create"] },
    { key: "categories", status: "diagnostic",  sourceOfTruth: "sap", writesReports: true,  scope: ["category_mapping"] },
    { key: "orders",     status: "discovery",   sourceOfTruth: "sap", writesReports: false, scope: ["read_only"] },
  ],
};

const MOCK_ITEMS = [
  { itemCode: "61072505", itemName: "ACEITE LUBRICANTE 20W-50 1L",        price: 850.00,   stock: 120, status: "Y" },
  { itemCode: "61072506", itemName: "FILTRO DE ACEITE UNIVERSAL",          price: 320.00,   stock: 45,  status: "Y" },
  { itemCode: "61072507", itemName: "PASTILLAS DE FRENO DELANTERO",        price: 1450.00,  stock: 0,   status: "Y" },
  { itemCode: "61072508", itemName: "BUJIA NGK B8ES",                      price: 185.00,   stock: 200, status: "Y" },
  { itemCode: "61072509", itemName: "FILTRO DE AIRE K&N ALTO RENDIMIENTO", price: 2800.00,  stock: 8,   status: "N" },
  { itemCode: "61072510", itemName: "AMORTIGUADOR TRASERO MONROE",         price: 4200.00,  stock: 14,  status: "Y" },
];

// ── Endpoints ─────────────────────────────────────────────────────────────────

app.get("/api/reports", (_req, res) => {
  res.json(MOCK_REPORTS);
});

app.get("/api/status", (_req, res) => {
  res.json({ running: false });
});

app.get("/api/catalog-overview", (_req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    sap: MOCK_SAP,
    prestashop: MOCK_PRESTA,
    contrast: buildContrast(MOCK_SAP, MOCK_PRESTA),
  });
});

app.get("/api/dashboard-summary", (_req, res) => {
  const overview = {
    generatedAt: new Date().toISOString(),
    sap: MOCK_SAP,
    prestashop: MOCK_PRESTA,
    contrast: buildContrast(MOCK_SAP, MOCK_PRESTA),
  };
  res.json({
    generatedAt: new Date().toISOString(),
    latestReport: MOCK_REPORTS[0],
    overview,
    executive: {
      overallStatus: "attention",
      headline: "Hay diferencias entre SAP y PrestaShop. El tablero recomienda revisar o sincronizar cambios.",
    },
  });
});

app.get("/api/domain-analysis", (_req, res) => {
  res.json(MOCK_DOMAIN_ANALYSIS);
});

app.get("/api/sync-domains", (_req, res) => {
  res.json(MOCK_SYNC_DOMAINS);
});

app.get("/api/prestashop-control", (req, res) => {
  const reference = String(req.query.reference || "").trim();
  const found = MOCK_ITEMS.find(i => i.itemCode === reference);

  if (!found) {
    res.json({
      reference,
      sap: null,
      prestashop: null,
      comparison: { existsInSap: false, existsInPrestashop: false },
    });
    return;
  }

  const inPresta = found.status === "Y";
  res.json({
    reference,
    sap: { ...found },
    prestashop: inPresta
      ? {
          productId: 1000 + MOCK_ITEMS.indexOf(found),
          reference: found.itemCode,
          active: "1",
          productPrice: found.price,
          combinations: [],
          stockAvailables: [{ id: 1, quantity: found.stock }],
        }
      : null,
    comparison: {
      existsInSap: true,
      existsInPrestashop: inPresta,
      samePrice: inPresta,
      stockRecords: inPresta ? 1 : 0,
    },
  });
});

app.post("/api/prestashop-control/active", (req, res) => {
  const active = Boolean(req.body.active);
  res.json({
    ok: true,
    message: active ? "Producto activado en PrestaShop" : "Producto desactivado en PrestaShop",
  });
});

// ── Mock SSE sync ─────────────────────────────────────────────────────────────

const MOCK_ITEM_CODES = [
  "61072505", "61072506", "61072507", "61072508", "61072509", "61072510",
  "61072511", "61072512", "61072513", "61072514", "61072515", "61072516",
  "61072517", "61072518", "61072519", "61072520", "61072521", "61072522",
  "61072523", "61072524", "61072525", "61072526", "61072527", "61072528",
  "61072529", "61072530",
];

const MOCK_ACTIONS = [
  "skip_no_change", "skip_no_change", "skip_no_change",
  "update_product_price", "update_product_stock",
  "create_product", "skip_no_change", "skip_no_change",
];

function jsonLine(level, message, extra = {}) {
  return JSON.stringify({ ts: new Date().toISOString(), level, message, ...extra });
}

app.get("/api/sync", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {}
  };

  const log = (level, message, extra = {}) =>
    send({ type: "log", line: jsonLine(level, message, extra) });

  const domains = req.query.syncDomains
    ? String(req.query.syncDomains).split(",").map(s => s.trim()).filter(Boolean)
    : ["products"];
  const write = req.query.write === "true";
  const fullCatalog = req.query.fullCatalog === "true";
  const TOTAL = fullCatalog ? MOCK_ITEM_CODES.length : 10;

  log("info", "Iniciando sync mock", { domains: domains.join(","), write, fullCatalog });
  log("info", "Conectando a SAP HANA (mock)...");

  let step = 0;
  let closed = false;

  const interval = setInterval(() => {
    if (closed) { clearInterval(interval); return; }
    step++;

    if (step === 2) {
      log("info", "Conexion SAP HANA establecida");
      log("info", `Leyendo articulos del catalogo... schema=BD_CARBALLO warehouse=AC01`);
    }

    if (step === 3) {
      log("info", `SAP devolvio ${TOTAL} articulos para el dominio "${domains[0]}"`);
      log("info", write ? "Modo escritura activado. Los cambios se aplicaran en PrestaShop." : "Modo dry-run. No se modificara PrestaShop.");
    }

    if (step === 4) {
      log("info", "Conectando a PrestaShop (mock)...");
    }

    if (step === 5) {
      log("info", "Conexion PrestaShop establecida");
    }

    if (step >= 6 && step < 6 + TOTAL) {
      const idx = step - 6;
      const itemCode = MOCK_ITEM_CODES[idx] || `610725${String(idx).padStart(2, "0")}`;
      const current = idx + 1;
      const percent = Math.round((current / TOTAL) * 100);
      const action = MOCK_ACTIONS[idx % MOCK_ACTIONS.length];

      send({
        type: "log",
        line: jsonLine("info", "Progreso de dominio", {
          domain: domains[0],
          current,
          total: TOTAL,
          percent,
          itemCode,
        }),
      });

      if (action === "create_product") {
        log("info", `${write ? "Creando" : "[dry-run] Crearia"} producto ${itemCode} en PrestaShop`, {
          action, itemCode, status: write ? "executed" : "dry_run",
        });
      } else if (action === "update_product_price") {
        log("info", `${write ? "Actualizando" : "[dry-run] Actualizaria"} precio de ${itemCode}`, {
          action, itemCode, sapPrice: 850, prestashopProductPrice: 820, status: write ? "executed" : "dry_run",
        });
      } else if (action === "update_product_stock") {
        log("info", `${write ? "Actualizando" : "[dry-run] Actualizaria"} stock de ${itemCode}`, {
          action, itemCode, sapStock: 45, status: write ? "executed" : "dry_run",
        });
      }
    }

    if (step === 6 + TOTAL) {
      log("info", "Guardando reporte de corrida...");
    }

    if (step === 7 + TOTAL) {
      log("info", "Reporte guardado en reports/");
      log("info", `Sync completado: ${TOTAL} articulos procesados.`, {
        domain: domains[0],
        total: TOTAL,
      });
      clearInterval(interval);
      send({ type: "done", code: 0 });
      try { res.end(); } catch {}
    }
  }, 150);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "dist", "index.html");
  const fs = require("fs");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(
      "<pre>dist/ no existe todavia.\nEjecuta primero: npm run build\nLuego: npm run mock</pre>"
    );
  }
});

app.listen(PORT, () => {
  console.log(`\n  [mock] Panel → http://localhost:${PORT}`);
  console.log("  [mock] Datos ficticios activos. No se conecta a SAP ni PrestaShop.\n");
});
