const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyProductAttributeMapping,
  defaultConfig,
  mappingCatalog,
  shouldSyncProductImage,
} = require("../src/product-attribute-mapping");

function article(overrides = {}) {
  return {
    itemCode: "72101020",
    itemName: "Producto demo",
    barcode: "4012632121882",
    metadata: {
      longDescription: "Descripcion larga",
      shortDescription: "Descripcion corta",
      manufacturerCatalogNumber: "MPN-1",
      foreignName: "Foreign name",
      category: "Copas",
      itemGroupName: "Cristaleria",
      manufacturerCode: 28,
      salesUnit: "CTN6",
      unitsPerPackage: 1,
      weight: 1.6,
      pictureName: "72101020.jpg",
    },
    ...overrides,
  };
}

test("mapeo default genera campos directos y caracteristicas PS", () => {
  const payload = applyProductAttributeMapping(article(), defaultConfig());

  assert.match(payload.description, /Descripcion larga/);
  assert.match(payload.description, /Ficha tecnica/);
  assert.equal(payload.descriptionShort, "Descripcion corta");
  assert.equal(payload.mpn, "MPN-1");
  assert.equal(payload.supplierReference, "MPN-1");
  assert.equal(payload.ean13, "4012632121882");
  assert.equal(payload.weight, 1.6);
  assert.equal(payload.metaTitle, "Foreign name");
  assert.ok(Array.isArray(payload.sapFeatures));
  assert.ok(
    payload.sapFeatures.some((feature) => feature.name === "Codigo SAP"),
  );
});

test("ignora EAN13 invalido segun configuracion", () => {
  const payload = applyProductAttributeMapping(
    article({ barcode: "ABC123" }),
    defaultConfig(),
  );

  assert.equal(payload.ean13, undefined);
});

test("permite mapear un campo SAP como caracteristica custom", () => {
  const payload = applyProductAttributeMapping(article(), {
    version: 1,
    entries: [
      {
        id: "custom-feature",
        enabled: true,
        sapField: "metadata.salesUnit",
        prestaTarget: "feature",
        label: "Unidad comercial",
        featureName: "Unidad comercial",
      },
    ],
  });

  assert.deepEqual(payload.sapFeatures, [
    { name: "Unidad comercial", value: "CTN6" },
  ]);
});

test("expone y controla la subida de imagen desde el mapeo", () => {
  const catalog = mappingCatalog();
  assert.ok(catalog.targets.some((target) => target.key === "image"));
  assert.ok(
    catalog.defaults.entries.some((entry) => entry.prestaTarget === "image"),
  );
  assert.equal(shouldSyncProductImage(article(), defaultConfig()), true);
  assert.equal(
    shouldSyncProductImage(article(), {
      version: 1,
      entries: [
        {
          id: "image-off",
          enabled: false,
          sapField: "metadata.pictureName",
          prestaTarget: "image",
          label: "Imagen SAP",
          featureName: "",
        },
      ],
    }),
    false,
  );
});
