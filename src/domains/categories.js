async function runCategoryDomain(log) {
  log("warn", "Dominio categories pendiente de implementacion", {
    sourceOfTruth: "sap",
    currentScope: [
      "leer categorias maestras desde SAP",
      "mapear jerarquia SAP -> PrestaShop",
      "crear y actualizar categorias",
      "asociar categorias a productos",
    ],
  });

  return {
    key: "categories",
    reportRows: [],
    summary: {
      implemented: false,
      processed: 0,
      sourceOfTruth: "sap",
      writesReports: false,
      nextStep: "definir query SAP para categorias y su relacion con productos",
    },
  };
}

module.exports = {
  runCategoryDomain,
};
