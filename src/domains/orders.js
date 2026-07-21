const {
  createPrestaClient,
  hasPrestaConfig,
  readPrestaOrdersOverview,
} = require("../prestashop");
const { readSapOrdersOverview, readSapOrdersSnapshot } = require("../sap");
const { isWriteEnabled } = require("../sync-executor");

function buildOrderWriteReadiness(prestaAvailable) {
  return {
    ready: false,
    canReadSap: true,
    canComparePrestashop: Boolean(prestaAvailable),
    canWrite: false,
    availableSapFields: [
      "DocEntry",
      "DocNum",
      "CardCode",
      "CardName",
      "DocDate",
      "DocStatus",
      "CANCELED",
      "DocTotal",
      "NumAtCard",
      "Comments",
      "LineCount",
      "DistinctItems",
      "TotalQuantity",
    ],
    missingRequirements: [
      "cliente PrestaShop por pedido (id_customer o regla de alta)",
      "direccion de facturacion completa",
      "direccion de envio completa",
      "transportista o regla de carrier",
      "metodo de pago",
      "estado de pedido SAP -> order_state de PrestaShop",
      "armado de carrito previo a crear la orden",
      "mapeo seguro de cada linea SAP a id_product / id_product_attribute",
    ],
    nextStep:
      "Definir el mapping funcional SAP -> cliente/direccion/carrito/estado antes de habilitar escritura real de pedidos.",
  };
}

function buildOrderSummary(sapOverview, sapRows, prestaOverview) {
  const writeReadiness = buildOrderWriteReadiness(Boolean(prestaOverview));

  return {
    total: sapRows.length,
    ordersEvaluated: sapRows.length,
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
    prestaOrdersLast30Days: prestaOverview
      ? prestaOverview.ordersLast30Days
      : null,
    orderGap: prestaOverview
      ? Number(sapOverview.totalOrders || 0) -
        Number(prestaOverview.totalOrders || 0)
      : null,
    writeReadiness,
    lastSyncMode: isWriteEnabled()
      ? "write_requested_but_blocked"
      : "diagnostic",
  };
}

function mapOrderRow(row, prestaOverview, writeReadiness) {
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
    missingRequirements: writeReadiness.missingRequirements,
    note: "La lectura de pedidos ya esta implementada. La escritura hacia PrestaShop sigue bloqueada porque aun falta resolver cliente, direcciones, carrito, carrier, pago y estados.",
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

  const summary = buildOrderSummary(sapOverview, sapRows, prestaOverview);
  const rows = sapRows.map((row) =>
    mapOrderRow(row, prestaOverview, summary.writeReadiness),
  );

  log("info", "Plan de corrida de orders", {
    domain: "orders",
    mode: "diagnostic",
    total: rows.length,
    prestaAvailable: Boolean(prestaOverview),
    canWrite: summary.writeReadiness.canWrite,
  });

  log("info", "Progreso de dominio", {
    domain: "orders",
    current: rows.length,
    total: rows.length,
    percent: rows.length > 0 ? 100 : 0,
  });

  if (isWriteEnabled()) {
    log("warn", "Escritura de pedidos bloqueada por definicion funcional", {
      domain: "orders",
      missingRequirements: summary.writeReadiness.missingRequirements,
      nextStep: summary.writeReadiness.nextStep,
    });
  }

  log("warn", "Dominio orders finalizado sin escritura", {
    processed: rows.length,
    note: "No se escribieron pedidos en PrestaShop porque falta definir el mapeo funcional completo.",
    summary,
  });

  return {
    key: "orders",
    summary: {
      implemented: true,
      processed: rows.length,
      sourceOfTruth: "sap",
      diagnosticOnly: true,
      orderSummary: summary,
      writeReadiness: summary.writeReadiness,
      nextStep: summary.writeReadiness.nextStep,
    },
  };
}

module.exports = {
  runOrderDomain,
};
