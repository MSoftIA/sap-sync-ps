const assert = require("node:assert/strict");
const test = require("node:test");

const { buildArticleQuery, mapSapRow } = require("../src/sap");
const { buildActionPayload } = require("../src/sync-plan");

test("incluye campos de metadata POC en la query principal de articulos", () => {
  const query = buildArticleQuery({
    schema: "BD_CARBALLO",
    priceList: 14,
    warehouse: "AC01",
    itemCode: "",
    limit: 5,
  });

  assert.match(query.sql, /I\."UserText"/);
  assert.match(query.sql, /I\."FrgnName"/);
  assert.match(query.sql, /I\."U_Desc_Logistica"/);
  assert.match(query.sql, /I\."FirmCode"/);
  assert.match(query.sql, /I\."SuppCatNum"/);
  assert.match(query.sql, /I\."SalUnitMsr"/);
  assert.match(query.sql, /I\."SalPackUn"/);
  assert.match(query.sql, /I\."SWeight1"/);
  assert.match(query.sql, /I\."PicturName"/);
  assert.match(query.sql, /D\."BitmapPath"/);
});

test("permite filtrar articulos SAP con categoria asignada", () => {
  const { buildSapProductListQuery } = require("../src/sap");
  const withCategory = buildSapProductListQuery({
    schema: "BD_CARBALLO",
    priceList: 14,
    warehouse: "AC01",
    category: "with",
    page: 1,
    pageSize: 10,
  });
  const withoutCategory = buildSapProductListQuery({
    schema: "BD_CARBALLO",
    priceList: 14,
    warehouse: "AC01",
    category: "without",
    page: 1,
    pageSize: 10,
  });

  assert.match(
    withCategory.sql,
    /COALESCE\(TRIM\(I\."U_Categoria"\), ''\) <> ''/,
  );
  assert.match(
    withoutCategory.sql,
    /COALESCE\(TRIM\(I\."U_Categoria"\), ''\) = ''/,
  );
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
    FrgnName: "Foreign demo name",
    FirmCode: "7",
    SuppCatNum: "MPN-1",
    SalUnitMsr: "Caja",
    SalPackUn: "12",
    SWeight1: "1.25",
    PicturName: "ABC.jpg",
    BitmapPath: "\\\\hanab1\\B1_SHF\\Adjunto\\Imagenes\\FOTOS\\",
  });

  assert.deepEqual(article.metadata, {
    longDescription: "Descripcion larga",
    shortDescription: "Caja de 12",
    foreignName: "Foreign demo name",
    manufacturerCode: 7,
    manufacturerCatalogNumber: "MPN-1",
    salesUnit: "Caja",
    unitsPerPackage: 12,
    weight: 1.25,
    barcode: "1234567890123",
    pictureName: "ABC.jpg",
    imageDir: "\\\\hanab1\\B1_SHF\\Adjunto\\Imagenes\\FOTOS\\",
  });
});

test("incluye metadata SAP en payload de actualizacion PrestaShop", () => {
  const previousLanguage = process.env.PRESTASHOP_LANGUAGE_ID;
  process.env.PRESTASHOP_LANGUAGE_ID = "1";

  try {
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
      SuppCatNum: "MPN-1",
      SWeight1: "1.25",
    });
    const result = buildActionPayload(
      {
        action: "update_product_metadata",
        productId: 10,
        productReference: "ABC",
        syncMetadata: true,
      },
      article,
    );

    assert.deepEqual(result.payload.product, {
      id: 10,
      reference: "ABC",
      price: undefined,
      name: undefined,
      languageId: 1,
      description: "Descripcion larga",
      descriptionShort: "Caja de 12",
      mpn: "MPN-1",
      ean13: "1234567890123",
      weight: 1.25,
    });
  } finally {
    if (previousLanguage === undefined) {
      delete process.env.PRESTASHOP_LANGUAGE_ID;
    } else {
      process.env.PRESTASHOP_LANGUAGE_ID = previousLanguage;
    }
  }
});

test("usa la descripcion logistica como fallback visible si SAP no trae UserText", () => {
  const article = mapSapRow({
    ItemCode: "ABC",
    ItemName: "Producto demo",
    Price: "10.5",
    WhsCode: "AC01",
    Existencia: "4",
    Status: "Y",
    UserText: "",
    U_Desc_Logistica: "Caja de 12",
  });
  const result = buildActionPayload(
    {
      action: "update_product_metadata",
      productId: 10,
      productReference: "ABC",
      syncMetadata: true,
    },
    article,
  );

  assert.equal(result.payload.product.description, "Caja de 12");
  assert.equal(result.payload.product.descriptionShort, "Caja de 12");
});

test("usa FrgnName como fallback de descripcion cuando SAP no trae textos dedicados", () => {
  const article = mapSapRow({
    ItemCode: "ABC",
    ItemName: "Producto demo",
    Price: "10.5",
    WhsCode: "AC01",
    Existencia: "4",
    Status: "Y",
    UserText: "",
    U_Desc_Logistica: "",
    FrgnName: "UNIVERSAL BORDEAUX GLASS 23oz",
  });
  const result = buildActionPayload(
    {
      action: "update_product_metadata",
      productId: 10,
      productReference: "ABC",
      syncMetadata: true,
    },
    article,
  );

  assert.equal(
    result.payload.product.description,
    "UNIVERSAL BORDEAUX GLASS 23oz",
  );
  assert.equal(
    result.payload.product.descriptionShort,
    "UNIVERSAL BORDEAUX GLASS 23oz",
  );
});
