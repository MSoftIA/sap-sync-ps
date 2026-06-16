const fs = require("fs");
const path = require("path");
const hana = require("@sap/hana-client");

function log(level, message, data = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...data,
    }),
  );
}

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) {
    log("warn", "No encontre .env.local", { file });
    return;
  }

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;

    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();

    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }

    process.env[k] = process.env[k] || v;
  }

  log("info", ".env.local cargado");
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error("Falta variable: " + name);
  return value;
}

function numberEnv(name, fallback) {
  const raw = env(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error("Variable numerica invalida: " + name);
  return value;
}

function xmlText(xml, tag) {
  const match = xml.match(
    new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">"),
  );
  return match ? decodeXml(match[1].trim()) : "";
}

function xmlLanguageText(xml, tag) {
  const container = xmlText(xml, tag);
  if (!container) return "";

  const languageMatch = container.match(
    /<language(?:\s[^>]*)?><!\[CDATA\[([\s\S]*?)\]\]><\/language>/,
  );
  if (languageMatch) return decodeXml(languageMatch[1].trim());

  return decodeXml(container);
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function buildSapQuery({ schema, priceList, warehouse, itemCode, limit }) {
  const itemFilter = itemCode ? 'AND I."ItemCode" = ?' : "";

  return {
    sql:
      "SELECT " +
      'I."ItemCode", I."ItemName", P."AddPrice1" AS "Price", ' +
      'C."WhsCode", C."OnHand" AS "Existencia", I."CodeBars", I."validFor" AS "Status" ' +
      'FROM "' +
      schema +
      '"."OITM" I ' +
      'INNER JOIN "' +
      schema +
      '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' +
      schema +
      '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      'WHERE I."frozenFor" = ' +
      "'N'" +
      " " +
      'AND P."PriceList" = ? ' +
      'AND C."WhsCode" = ? ' +
      itemFilter +
      " " +
      "LIMIT " +
      limit,
    params: itemCode
      ? [priceList, warehouse, itemCode]
      : [priceList, warehouse],
  };
}

function readSapRows() {
  const serverNode = required("HANA_SERVER_NODE");
  const uid = required("HANA_USER");
  const pwd = required("HANA_PASSWORD");
  const schema = env("HANA_SCHEMA", "BD_CARBALLO");
  const priceList = numberEnv("SAP_PRICE_LIST", 14);
  const warehouse = env("SAP_WAREHOUSE", "AC01");
  const itemCode = env("SAP_ITEM_CODE", "61072505");
  const limit = numberEnv("SAP_LIMIT", 5);

  if (!/^[A-Za-z0-9_]+$/.test(schema)) {
    throw new Error("HANA_SCHEMA invalido: " + schema);
  }

  log("info", "Configuracion SAP cargada", {
    serverNode,
    uid,
    schema,
    priceList,
    warehouse,
    itemCode,
    limit,
  });

  const conn = hana.createConnection();

  try {
    log("info", "Conectando a SAP HANA");
    conn.connect({
      serverNode,
      uid,
      pwd,
      encrypt: false,
      sslValidateCertificate: false,
    });
    log("info", "Conexion SAP HANA exitosa");

    const query = buildSapQuery({
      schema,
      priceList,
      warehouse,
      itemCode,
      limit,
    });
    log("info", "Ejecutando query SAP", { params: query.params });

    const start = Date.now();
    const rows = conn.exec(query.sql, query.params);

    log("info", "Query SAP completada", {
      rows: rows.length,
      elapsedMs: Date.now() - start,
    });

    for (const row of rows) {
      log("data", "Articulo SAP", {
        itemCode: row.ItemCode,
        itemName: row.ItemName,
        price: Number(row.Price),
        warehouse: row.WhsCode,
        stock: Number(row.Existencia),
        barcode: row.CodeBars || null,
        status: row.Status,
      });
    }

    return rows;
  } finally {
    try {
      conn.disconnect();
      log("info", "Conexion SAP cerrada");
    } catch {}
  }
}

function prestaUrl(resource, params = {}) {
  const base = required("PRESTASHOP_ENDPOINT").replace(/\/+$/, "");
  const key = required("PRESTASHOP_API_KEY");
  const url = new URL(base + "/api/" + resource.replace(/^\/+/, ""));
  url.searchParams.set("ws_key", key);
  url.searchParams.set("output_format", "XML");

  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  return url;
}

function safeUrl(url) {
  const clone = new URL(url.toString());
  if (clone.searchParams.has("ws_key"))
    clone.searchParams.set("ws_key", "[OCULTO]");
  return clone.toString();
}

async function prestaGet(resource, params = {}) {
  const url = prestaUrl(resource, params);
  log("info", "GET PrestaShop", { url: safeUrl(url) });

  const start = Date.now();
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();

  log("info", "Respuesta PrestaShop", {
    status: res.status,
    ok: res.ok,
    elapsedMs: Date.now() - start,
    bytes: text.length,
  });

  if (!res.ok) {
    throw new Error(
      "PrestaShop HTTP " + res.status + ": " + text.slice(0, 300),
    );
  }

  return text;
}

function parseIdList(xml, tagName) {
  const ids = [];
  const re = new RegExp("<" + tagName + '[^>]*\\bid="(\\d+)"', "g");
  let match;
  while ((match = re.exec(xml))) ids.push(Number(match[1]));
  return ids;
}

function parseXmlBlocks(xml, tagName) {
  const blocks = [];
  const re = new RegExp(
    "<" + tagName + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tagName + ">",
    "g",
  );
  let match;
  while ((match = re.exec(xml))) blocks.push(match[1]);
  return blocks;
}

function parseCombinations(xml) {
  return parseXmlBlocks(xml, "combination").map((block) => ({
    id: Number(xmlText(block, "id")),
    reference: xmlText(block, "reference"),
    price: Number(xmlText(block, "price") || 0),
    quantity: Number(xmlText(block, "quantity") || 0),
    optionValueIds: parseIdList(block, "product_option_value"),
  }));
}

function parseStockAvailables(xml) {
  return parseXmlBlocks(xml, "stock_available").map((block) => ({
    id: Number(xmlText(block, "id")),
    productAttributeId: Number(xmlText(block, "id_product_attribute") || 0),
    quantity: Number(xmlText(block, "quantity") || 0),
  }));
}

function findBestPrestaMatch(sapRow, combinations, stockAvailables) {
  const exactReference = combinations.find(
    (combination) => combination.reference === sapRow.ItemCode,
  );

  if (exactReference) {
    return {
      kind: "combination",
      reason: "reference_exacta",
      combination: exactReference,
      stock:
        stockAvailables.find(
          (item) => item.productAttributeId === exactReference.id,
        ) || null,
    };
  }

  const samePrice = combinations.filter(
    (combination) => Number(combination.price) === Number(sapRow.Price),
  );

  if (samePrice.length === 1) {
    return {
      kind: "combination",
      reason: "precio_unico",
      combination: samePrice[0],
      stock:
        stockAvailables.find(
          (item) => item.productAttributeId === samePrice[0].id,
        ) || null,
    };
  }

  return {
    kind: "product",
    reason: combinations.length ? "sin_match_claro" : "sin_combinaciones",
    combination: null,
    stock:
      stockAvailables.find((item) => item.productAttributeId === 0) || null,
  };
}

async function getAttributeValueDetails(id) {
  const xml = await prestaGet("product_option_values/" + id);
  return {
    id,
    groupId: Number(xmlText(xml, "id_attribute_group") || 0),
    name: xmlLanguageText(xml, "name"),
  };
}

async function getAttributeGroupDetails(id) {
  const xml = await prestaGet("product_options/" + id);
  return {
    id,
    name: xmlLanguageText(xml, "name"),
  };
}

async function enrichCombinations(combinations) {
  const optionValueIds = [
    ...new Set(
      combinations.flatMap((combination) => combination.optionValueIds || []),
    ),
  ];

  if (optionValueIds.length === 0) {
    return combinations;
  }

  const optionValueEntries = await Promise.all(
    optionValueIds.map(async (id) => [id, await getAttributeValueDetails(id)]),
  );
  const optionValueMap = new Map(optionValueEntries);

  const groupIds = [
    ...new Set(
      optionValueEntries
        .map(([, value]) => value.groupId)
        .filter((groupId) => Number.isFinite(groupId) && groupId > 0),
    ),
  ];

  const groupEntries = await Promise.all(
    groupIds.map(async (id) => [id, await getAttributeGroupDetails(id)]),
  );
  const groupMap = new Map(groupEntries);

  return combinations.map((combination) => ({
    ...combination,
    optionValues: combination.optionValueIds.map((id) => {
      const value = optionValueMap.get(id);
      const group = value ? groupMap.get(value.groupId) : null;
      return {
        id,
        groupId: value ? value.groupId : null,
        groupName: group ? group.name : "",
        name: value ? value.name : "",
      };
    }),
  }));
}

async function inspectPrestaProduct(sapRow) {
  const reference = sapRow.ItemCode;

  const searchXml = await prestaGet("products", {
    "filter[reference]": reference,
  });

  const productIds = parseIdList(searchXml, "product");

  log("info", "Busqueda producto PrestaShop", {
    reference,
    productIds,
    matches: productIds.length,
  });

  if (productIds.length === 0) {
    log("warn", "Producto no encontrado en PrestaShop", { reference });
    return;
  }

  if (productIds.length > 1) {
    log("warn", "Referencia duplicada en PrestaShop", {
      reference,
      productIds,
    });
  }

  const productId = productIds[0];
  const productXml = await prestaGet("products/" + productId);
  const productReference = xmlText(productXml, "reference");
  const productPrice = Number(xmlText(productXml, "price"));
  const productActive = xmlText(productXml, "active");
  const defaultCategory = xmlText(productXml, "id_category_default");

  const combinationsXml = await prestaGet("combinations", {
    display: "full",
    "filter[id_product]": productId,
  });
  const combinations = await enrichCombinations(
    parseCombinations(combinationsXml),
  );
  const combinationIds = combinations.map((item) => item.id);

  const stockXml = await prestaGet("stock_availables", {
    display: "full",
    "filter[id_product]": productId,
  });
  const stockAvailables = parseStockAvailables(stockXml);
  const stockIds = stockAvailables.map((item) => item.id);
  const bestMatch = findBestPrestaMatch(sapRow, combinations, stockAvailables);

  log("data", "Producto PrestaShop", {
    productId,
    reference: productReference,
    active: productActive,
    defaultCategory,
    productPrice,
    combinationIds,
    stockIds,
    combinations,
    stockAvailables,
  });

  log("info", "Comparacion SAP vs PrestaShop", {
    itemCode: sapRow.ItemCode,
    sapPrice: Number(sapRow.Price),
    prestashopProductPrice: productPrice,
    sapStock: Number(sapRow.Existencia),
    selectedTarget:
      bestMatch.kind === "combination"
        ? {
            kind: bestMatch.kind,
            reason: bestMatch.reason,
            combinationId: bestMatch.combination.id,
            combinationReference: bestMatch.combination.reference,
            combinationPrice: bestMatch.combination.price,
            optionValues: bestMatch.combination.optionValues || [],
            stockQuantity: bestMatch.stock ? bestMatch.stock.quantity : null,
          }
        : {
            kind: bestMatch.kind,
            reason: bestMatch.reason,
            stockQuantity: bestMatch.stock ? bestMatch.stock.quantity : null,
          },
    note: "Solo lectura. No se envio ningun cambio.",
  });
}

async function main() {
  log("info", "Iniciando main.js", {
    cwd: process.cwd(),
    node: process.version,
  });

  loadEnvLocal();

  const rows = readSapRows();

  if (!env("PRESTASHOP_ENDPOINT") || !env("PRESTASHOP_API_KEY")) {
    log(
      "warn",
      "Variables PrestaShop no configuradas. Termina luego de leer SAP.",
    );
    return;
  }

  for (const row of rows) {
    await inspectPrestaProduct(row);
  }
}

main().catch((err) => {
  log("error", "Fallo el script", {
    name: err.name,
    message: err.message,
    code: err.code || null,
  });
  process.exitCode = 1;
});
