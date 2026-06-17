const {
  createPrestaClient,
  hasPrestaConfig,
  readPrestaOrdersOverview,
} = require("../prestashop");
const { writeDomainSnapshot } = require("../report");
const { readSapOrdersOverview, readSapOrdersSnapshot } = require("../sap");
const { isWriteEnabled } = require("../sync-executor");

function buildOrderSummary(sapOverview, sapRows, prestaOverview) {
  return {
    total: sapRows.length,
    totalOrders: sapOverview.totalOrders,
    openOrders: sapOverview.openOrders,
    closedOrders: sapOverview.closedOrders,
    canceledOrders: sapOverview.canceledOrders,
    uniqueCustomers: sapOverview.uniqueCustomers,
    ordersLast30Days: sapOverview.ordersLast30Days,
    ordersLast7Days: sapOverview.ordersLast7Days,
    latestDocNum: sapOverview.latestDocNum,
    latestDocDate: sapOverview.latestDocDate,
    prestaAvailable: Boolean(prestaOverview),
    prestaTotalOrders: prestaOverview ? prestaOverview.totalOrders : null,
    prestaOrdersLast30Days: prestaOverview ? prestaOverview.ordersLast30Days : null,
    orderGap: prestaOverview
      ? Number(sapOverview.totalOrders || 0) - Number(prestaOverview.totalOrders || 0)
      : null,
    lastSyncMode: isWriteEnabled() ? "write_requested_but_blocked" : "diagnostic",
  };
}

function mapOrderRow(row, prestaOverview) {
  return {
    status: "pending_business_mapping",
    docEntry: row.docEntry,
    docNum: row.docNum,
    cardCode: row.cardCode,
    cardName: row.cardName,
    docDate: row.docDate,
    docStatus: row.docStatus,
    canceled: row.canceled,
    docTotal: row.docTotal,
    numAtCard: row.numAtCard,
    comments: row.comments,
    lineCount: row.lineCount,
    distinctItems: row.distinctItems,
    totalQuantity: row.totalQuantity,
    prestaTotalOrders: prestaOverview ? prestaOverview.totalOrders : null,
    note:
      "La lectura de pedidos ya esta implementada. La escritura hacia PrestaShop sigue bloqueada hasta definir el mapeo funcional de cliente, direccion, carrito y estados.",
  };
}

async function runOrderDomain(log) {
  log("info", "Dominio orders iniciado", {
    sourceOfTruth: "sap",
    mode: "diagnostic",
    writeRequested: isWriteEnabled(),
  });

  const sapOverview = readSapOrdersOverview(log);
  const sapRows = readSapOrdersSnapshot(log, { limit: 200 });

  let prestaOverview = null;
  if (hasPrestaConfig()) {
    try {
      const client = createPrestaClient(log);
      prestaOverview = await readPrestaOrdersOverview(client, log);
    } catch (error) {
      log("warn", "No pude leer pedidos de PrestaShop", {
        message: error.message,
      });
    }
  }

  const rows = sapRows.map((row) => mapOrderRow(row, prestaOverview));
  const summary = buildOrderSummary(sapOverview, sapRows, prestaOverview);

  log("info", "Plan de corrida de orders", {
    domain: "orders",
    mode: "diagnostic",
    total: rows.length,
    prestaAvailable: Boolean(prestaOverview),
  });

  log("info", "Progreso de dominio", {
    domain: "orders",
    current: rows.length,
    total: rows.length,
    percent: rows.length > 0 ? 100 : 0,
  });

  const report = writeDomainSnapshot(log, {
    domain: "orders",
    summary,
    rows,
    csvHeaders: [
      "status",
      "docEntry",
      "docNum",
      "cardCode",
      "cardName",
      "docDate",
      "docStatus",
      "canceled",
      "docTotal",
      "numAtCard",
      "lineCount",
      "distinctItems",
      "totalQuantity",
      "prestaTotalOrders",
      "note",
    ],
  });

  log("warn", "Dominio orders finalizado sin escritura", {
    processed: rows.length,
    note:
      "No se escribieron pedidos en PrestaShop porque falta definir el mapeo funcional completo.",
    summary,
  });

  return {
    key: "orders",
    reportRows: [],
    summary: {
      implemented: true,
      processed: rows.length,
      sourceOfTruth: "sap",
      writesReports: false,
      diagnosticOnly: true,
      reportPaths: report.paths,
      orderSummary: summary,
      nextStep:
        "Definir la correspondencia SAP -> cliente/direccion/carrito/estado en PrestaShop antes de habilitar escritura.",
    },
  };
}

module.exports = {
  runOrderDomain,
};
