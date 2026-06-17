async function runOrderDomain(log) {
  log("warn", "Dominio orders pendiente de implementacion", {
    sourceOfTruth: "sap",
    currentScope: [
      "definir direccion funcional SAP -> PrestaShop o PrestaShop -> SAP",
      "leer pedidos origen",
      "mapear estados y lineas",
      "sincronizar ordenes y seguimiento",
    ],
    note: "En la mayoria de escenarios ecommerce los pedidos nacen en PrestaShop y se reflejan en SAP. Si se desea que SAP sea fuente de verdad aqui, hay que definir con precision el flujo esperado.",
  });

  return {
    key: "orders",
    reportRows: [],
    summary: {
      implemented: false,
      processed: 0,
      sourceOfTruth: "sap",
      writesReports: false,
      nextStep:
        "definir el flujo real de pedidos antes de programar sincronizacion",
    },
  };
}

module.exports = {
  runOrderDomain,
};
