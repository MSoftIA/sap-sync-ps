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
  assert.match(query.sql, /B\."ItmsGrpNam"/);
  assert.match(query.sql, /COALESCE\(CAT\."Name", I\."U_Categoria"\)/);
  assert.match(query.sql, /I\."U_Desc_Logistica"/);
  assert.match(query.sql, /I\."FirmCode"/);
  assert.match(query.sql, /I\."SuppCatNum"/);
  assert.match(query.sql, /I\."SalUnitMsr"/);
  assert.match(query.sql, /I\."SalPackUn"/);
  assert.match(query.sql, /I\."SWeight1"/);
  assert.match(query.sql, /I\."PicturName"/);
  assert.match(query.sql, /I\."QryGroup64"/);
  assert.match(query.sql, /D\."BitmapPath"/);
  assert.doesNotMatch(query.sql, /MAX\(D\."BitmapPath"\)/);
  assert.match(query.sql, /TO_NVARCHAR\(D\."BitmapPath"\)/);
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

test("filtra estado del catalogo SAP usando QryGroup64", () => {
  const { buildSapProductListQuery } = require("../src/sap");
  const active = buildSapProductListQuery({
    schema: "BD_CARBALLO",
    priceList: 14,
    warehouse: "AC01",
    status: "active",
    page: 1,
    pageSize: 10,
  });
  const inactive = buildSapProductListQuery({
    schema: "BD_CARBALLO",
    priceList: 14,
    warehouse: "AC01",
    status: "inactive",
    page: 1,
    pageSize: 10,
  });

  assert.match(active.sql, /I\."QryGroup64" = 'Y'/);
  assert.match(inactive.sql, /COALESCE\(I\."QryGroup64", 'N'\) <> 'Y'/);
  assert.doesNotMatch(active.sql, /I\."validFor" = 'Y'/);
  assert.doesNotMatch(inactive.sql, /I\."validFor" <> 'Y'/);
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
    QryGroup64: "Y",
    ItemGroupCode: "159",
    ItemGroupName: "Cristaleria",
    CatName: "Copas",
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
    itemGroupCode: 159,
    itemGroupName: "Cristaleria",
    category: "Copas",
    manufacturerCode: 7,
    manufacturerCatalogNumber: "MPN-1",
    salesUnit: "Caja",
    unitsPerPackage: 12,
    weight: 1.25,
    barcode: "1234567890123",
    pictureName: "ABC.jpg",
    imageDir: "\\\\hanab1\\B1_SHF\\Adjunto\\Imagenes\\FOTOS\\",
  });
  assert.equal(article.prestashopVisibility, "Y");
  assert.equal(article.shouldShowInPrestashop, true);
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
      QryGroup64: "Y",
      UserText: "Descripcion larga",
      U_Desc_Logistica: "Caja de 12",
      FrgnName: "Foreign demo name",
      SuppCatNum: "MPN-1",
      SalUnitMsr: "Caja",
      SalPackUn: "12",
      SWeight1: "1.25",
      ItemGroupName: "Cristaleria",
      CatName: "Copas",
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
      active: undefined,
      name: undefined,
      languageId: 1,
      description:
        'Descripcion larga\n\n<section class="sap-product-specs"><h3>Ficha tecnica</h3><table><tbody><tr><th>Codigo SAP</th><td>ABC</td></tr><tr><th>Codigo de barras</th><td>1234567890123</td></tr><tr><th>Referencia proveedor</th><td>MPN-1</td></tr><tr><th>Nombre internacional</th><td>Foreign demo name</td></tr><tr><th>Categoria SAP</th><td>Copas</td></tr><tr><th>Grupo SAP</th><td>Cristaleria</td></tr><tr><th>Unidad de venta</th><td>Caja</td></tr><tr><th>Unidades por paquete</th><td>12</td></tr><tr><th>Peso</th><td>1.25</td></tr></tbody></table></section>',
      descriptionShort: "Caja de 12",
      mpn: "MPN-1",
      supplierReference: "MPN-1",
      ean13: "1234567890123",
      weight: 1.25,
      metaTitle: "Foreign demo name",
      metaDescription: "Descripcion larga",
      sapFeatures: [
        { name: "Codigo SAP", value: "ABC" },
        { name: "Codigo de barras", value: "1234567890123" },
        { name: "Referencia proveedor", value: "MPN-1" },
        { name: "Nombre internacional", value: "Foreign demo name" },
        { name: "Categoria SAP", value: "Copas" },
        { name: "Grupo SAP", value: "Cristaleria" },
        { name: "Unidad de venta", value: "Caja" },
        { name: "Unidades por paquete", value: "12" },
        { name: "Peso", value: "1.25" },
      ],
    });
  } finally {
    if (previousLanguage === undefined) {
      delete process.env.PRESTASHOP_LANGUAGE_ID;
    } else {
      process.env.PRESTASHOP_LANGUAGE_ID = previousLanguage;
    }
  }
});

test("usa QryGroup64 para determinar visibilidad PrestaShop", () => {
  const hiddenArticle = mapSapRow({
    ItemCode: "HIDDEN",
    ItemName: "Producto oculto",
    Price: "10.5",
    WhsCode: "AC01",
    Existencia: "4",
    Status: "Y",
    QryGroup64: "N",
  });
  const visibleArticle = mapSapRow({
    ItemCode: "VISIBLE",
    ItemName: "Producto visible",
    Price: "10.5",
    WhsCode: "AC01",
    Existencia: "4",
    Status: "Y",
    QryGroup64: "Y",
  });

  assert.equal(hiddenArticle.shouldShowInPrestashop, false);
  assert.equal(visibleArticle.shouldShowInPrestashop, true);

  const createPayload = buildActionPayload(
    { action: "create_product" },
    hiddenArticle,
  );
  assert.equal(createPayload.payload.product.active, 0);
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

  assert.match(result.payload.product.description, /^Caja de 12/);
  assert.match(result.payload.product.description, /Ficha tecnica/);
  assert.match(result.payload.product.description, /Codigo SAP/);
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

  assert.match(
    result.payload.product.description,
    /^UNIVERSAL BORDEAUX GLASS 23oz/,
  );
  assert.match(result.payload.product.description, /Ficha tecnica/);
  assert.match(result.payload.product.description, /Nombre internacional/);
  assert.equal(
    result.payload.product.descriptionShort,
    "UNIVERSAL BORDEAUX GLASS 23oz",
  );
});
