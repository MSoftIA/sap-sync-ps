const assert = require("node:assert/strict");
const test = require("node:test");

const { buildArticleQuery, mapSapRow } = require("../src/sap");

test("incluye campos de metadata POC en la query principal de articulos", () => {
  const query = buildArticleQuery({
    schema: "BD_CARBALLO",
    priceList: 14,
    warehouse: "AC01",
    itemCode: "",
    limit: 5,
  });

  assert.match(query.sql, /I\."UserText"/);
  assert.match(query.sql, /I\."U_Desc_Logistica"/);
  assert.match(query.sql, /I\."FirmCode"/);
  assert.match(query.sql, /I\."SuppCatNum"/);
  assert.match(query.sql, /I\."SalUnitMsr"/);
  assert.match(query.sql, /I\."SalPackUn"/);
  assert.match(query.sql, /I\."SWeight1"/);
});

test("mapea metadata SAP para nutrir la prueba de concepto de PrestaShop", () => {
  const article = mapSapRow({
    ItemCode: "ABC",
    ItemName: "Producto demo",
    Price: "10.5",
    WhsCode: "AC01",
    Existencia: "4",
    CodeBars: "1234567890123",
    Status: "Y",
    UserText: "Descripcion larga",
    U_Desc_Logistica: "Caja de 12",
    FirmCode: "7",
    SuppCatNum: "MPN-1",
    SalUnitMsr: "Caja",
    SalPackUn: "12",
    SWeight1: "1.25",
  });

  assert.deepEqual(article.metadata, {
    longDescription: "Descripcion larga",
    shortDescription: "Caja de 12",
    manufacturerCode: 7,
    manufacturerCatalogNumber: "MPN-1",
    salesUnit: "Caja",
    unitsPerPackage: 12,
    weight: 1.25,
    barcode: "1234567890123",
  });
});
