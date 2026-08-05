const fs = require("node:fs");
const path = require("node:path");

const CONFIG_DIR = path.join(process.cwd(), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "product-attribute-mapping.json");

const SAP_ATTRIBUTE_SOURCES = [
  { key: "itemCode", label: "Codigo SAP" },
  { key: "itemName", label: "Nombre SAP" },
  { key: "price", label: "Precio" },
  { key: "warehouse", label: "Almacen" },
  { key: "stock", label: "Stock" },
  { key: "barcode", label: "Codigo de barras" },
  { key: "status", label: "Estado SAP" },
  { key: "prestashopVisibility", label: "Visible PrestaShop (QryGroup64)" },
  { key: "metadata.longDescription", label: "Descripcion larga SAP" },
  {
    key: "metadata.shortDescription",
    label: "Descripcion corta / logistica SAP",
  },
  { key: "metadata.foreignName", label: "Nombre extranjero" },
  { key: "metadata.category", label: "Categoria SAP" },
  { key: "metadata.itemGroupCode", label: "Codigo grupo SAP" },
  { key: "metadata.itemGroupName", label: "Grupo SAP" },
  { key: "metadata.manufacturerCode", label: "Marca SAP" },
  { key: "metadata.manufacturerCatalogNumber", label: "MPN suplidor" },
  { key: "metadata.salesUnit", label: "Unidad venta" },
  { key: "metadata.unitsPerPackage", label: "Unid. paquete" },
  { key: "metadata.weight", label: "Peso" },
  { key: "metadata.pictureName", label: "Imagen SAP" },
  { key: "metadata.imageDir", label: "Directorio imagen SAP" },
];

const PRESTASHOP_TARGETS = [
  { key: "description", label: "Descripcion larga", kind: "field" },
  { key: "descriptionShort", label: "Descripcion corta", kind: "field" },
  { key: "mpn", label: "MPN", kind: "field" },
  { key: "supplierReference", label: "Referencia proveedor", kind: "field" },
  { key: "ean13", label: "EAN13", kind: "field" },
  { key: "weight", label: "Peso", kind: "field" },
  { key: "metaTitle", label: "Meta title", kind: "field" },
  { key: "metaDescription", label: "Meta description", kind: "field" },
  { key: "feature", label: "Caracteristica PrestaShop", kind: "feature" },
  { key: "image", label: "Imagen de producto", kind: "image" },
];

const DEFAULT_ENTRIES = [
  map("description", "metadata.longDescription", "Descripcion larga SAP"),
  map("description", "metadata.shortDescription", "Descripcion corta SAP"),
  map("description", "metadata.foreignName", "Nombre extranjero"),
  map("descriptionShort", "metadata.shortDescription", "Descripcion corta SAP"),
  map("descriptionShort", "metadata.longDescription", "Descripcion larga SAP"),
  map("descriptionShort", "metadata.foreignName", "Nombre extranjero"),
  map("mpn", "metadata.manufacturerCatalogNumber", "MPN suplidor"),
  map(
    "supplierReference",
    "metadata.manufacturerCatalogNumber",
    "Referencia proveedor",
  ),
  map("ean13", "barcode", "Codigo de barras"),
  map("weight", "metadata.weight", "Peso"),
  map("metaTitle", "metadata.foreignName", "Nombre extranjero"),
  map("metaTitle", "itemName", "Nombre SAP", false),
  map("metaDescription", "metadata.longDescription", "Descripcion larga SAP"),
  map(
    "metaDescription",
    "metadata.shortDescription",
    "Descripcion corta SAP",
    false,
  ),
  map("feature", "itemCode", "Codigo SAP"),
  map("feature", "barcode", "Codigo de barras"),
  map("feature", "metadata.manufacturerCatalogNumber", "Referencia proveedor"),
  map("feature", "metadata.foreignName", "Nombre internacional"),
  map("feature", "metadata.category", "Categoria SAP"),
  map("feature", "metadata.itemGroupName", "Grupo SAP"),
  map("feature", "metadata.manufacturerCode", "Marca SAP"),
  map("feature", "metadata.salesUnit", "Unidad de venta"),
  map("feature", "metadata.unitsPerPackage", "Unidades por paquete"),
  map("feature", "metadata.weight", "Peso"),
  map("image", "metadata.pictureName", "Imagen SAP"),
];

function map(prestaTarget, sapField, label, enabled = true) {
  return {
    id: `${prestaTarget}:${sapField}:${label}`.replace(
      /[^a-zA-Z0-9_.:-]/g,
      "_",
    ),
    enabled,
    sapField,
    prestaTarget,
    label,
    featureName: prestaTarget === "feature" ? label : "",
  };
}

function textValue(value) {
  return String(value ?? "").trim();
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactText(value, maxLength) {
  const compacted = textValue(value).replace(/\s+/g, " ");
  return compacted.length > maxLength
    ? compacted.slice(0, maxLength - 1).trim() + "..."
    : compacted;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getByPath(obj, sourcePath) {
  return String(sourcePath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current ? current[key] : undefined), obj);
}

function defaultConfig() {
  return {
    version: 1,
    entries: DEFAULT_ENTRIES.map((entry) => ({ ...entry })),
  };
}

function normalizeEntry(entry, index) {
  const sourceKeys = new Set(SAP_ATTRIBUTE_SOURCES.map((source) => source.key));
  const targetKeys = new Set(PRESTASHOP_TARGETS.map((target) => target.key));
  const sapField = String(entry.sapField || "").trim();
  const prestaTarget = String(entry.prestaTarget || "").trim();

  if (!sourceKeys.has(sapField) || !targetKeys.has(prestaTarget)) {
    return null;
  }

  const label = textValue(entry.label) || sapField;
  return {
    id:
      textValue(entry.id) ||
      `${prestaTarget}:${sapField}:${index}`.replace(/[^a-zA-Z0-9_.:-]/g, "_"),
    enabled: entry.enabled !== false,
    sapField,
    prestaTarget,
    label,
    featureName:
      prestaTarget === "feature" ? textValue(entry.featureName) || label : "",
  };
}

function normalizeConfig(raw) {
  const entries = Array.isArray(raw && raw.entries) ? raw.entries : [];
  const normalizedEntries = entries.map(normalizeEntry).filter(Boolean);
  const seen = new Set(
    normalizedEntries.map((entry) => `${entry.prestaTarget}:${entry.sapField}`),
  );
  const mergedEntries = [
    ...normalizedEntries,
    ...defaultConfig().entries.filter(
      (entry) =>
        entry.prestaTarget === "image" &&
        !seen.has(`${entry.prestaTarget}:${entry.sapField}`),
    ),
  ];

  return {
    version: 1,
    entries: normalizedEntries.length ? mergedEntries : defaultConfig().entries,
  };
}

function readProductAttributeMapping() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultConfig();
  }

  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    return defaultConfig();
  }
}

function saveProductAttributeMapping(config) {
  const normalized = normalizeConfig(config);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(normalized, null, 2) + "\n");
  return normalized;
}

function targetValue(target, value) {
  if (!hasValue(value)) return "";

  if (target === "ean13") {
    const digits = textValue(value).replace(/\D/g, "");
    return /^\d{13}$/.test(digits) ? digits : "";
  }

  if (target === "weight") {
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? Math.floor(number * 1000) / 1000 : "";
  }

  if (target === "metaTitle") return compactText(value, 70);
  if (target === "metaDescription") return compactText(value, 160);

  return textValue(value);
}

function applyProductAttributeMapping(
  article,
  config = readProductAttributeMapping(),
) {
  const productMetadata = {};
  const sapFeatures = [];

  for (const entry of normalizeConfig(config).entries) {
    if (!entry.enabled) continue;

    const rawValue = getByPath(article, entry.sapField);
    const value = targetValue(entry.prestaTarget, rawValue);
    if (!hasValue(value)) continue;

    if (entry.prestaTarget === "feature") {
      sapFeatures.push({
        name: entry.featureName || entry.label,
        value: textValue(value),
      });
      continue;
    }

    if (entry.prestaTarget === "image") {
      continue;
    }

    if (productMetadata[entry.prestaTarget] === undefined) {
      productMetadata[entry.prestaTarget] = value;
    }
  }

  if (sapFeatures.length > 0) {
    productMetadata.sapFeatures = sapFeatures;
  }

  if (productMetadata.description && sapFeatures.length > 0) {
    const technicalHtml =
      '<section class="sap-product-specs"><h3>Ficha tecnica</h3><table><tbody>' +
      sapFeatures
        .map(
          (feature) =>
            "<tr><th>" +
            htmlEscape(feature.name) +
            "</th><td>" +
            htmlEscape(feature.value) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></section>";

    productMetadata.description =
      productMetadata.description + "\n\n" + technicalHtml;
  }

  return productMetadata;
}

function shouldSyncProductImage(
  article,
  config = readProductAttributeMapping(),
) {
  return normalizeConfig(config).entries.some((entry) => {
    if (!entry.enabled || entry.prestaTarget !== "image") return false;
    return hasValue(getByPath(article, entry.sapField));
  });
}

function mappingCatalog() {
  return {
    sources: SAP_ATTRIBUTE_SOURCES,
    targets: PRESTASHOP_TARGETS,
    defaults: defaultConfig(),
  };
}

module.exports = {
  applyProductAttributeMapping,
  defaultConfig,
  hasValue,
  mappingCatalog,
  readProductAttributeMapping,
  saveProductAttributeMapping,
  shouldSyncProductImage,
};
