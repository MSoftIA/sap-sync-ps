const { env, requiredEnv } = require("./env");
const {
  parseAnyIdList,
  parseIdList,
  parseXmlBlocks,
  xmlLanguageText,
  xmlText,
} = require("./xml");

function getPrestaConfig() {
  return {
    endpoint: env("PRESTASHOP_ENDPOINT"),
    apiKey: env("PRESTASHOP_API_KEY"),
  };
}

function hasPrestaConfig() {
  const config = getPrestaConfig();
  return Boolean(config.endpoint && config.apiKey);
}

function createPrestaClient(log) {
  function buildUrl(resource, params = {}) {
    const base = requiredEnv("PRESTASHOP_ENDPOINT").replace(/\/+$/, "");
    const apiKey = requiredEnv("PRESTASHOP_API_KEY");
    const url = new URL(base + "/api/" + resource.replace(/^\/+/, ""));
    url.searchParams.set("ws_key", apiKey);
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
    if (clone.searchParams.has("ws_key")) {
      clone.searchParams.set("ws_key", "[OCULTO]");
    }
    return clone.toString();
  }

  async function request(method, resource, { params = {}, body = null } = {}) {
    const url = buildUrl(resource, params);
    log("debug", method + " PrestaShop", { url: safeUrl(url) });

    const startedAt = Date.now();
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/xml" } : undefined,
      body,
    });
    const text = await response.text();

    log("debug", "Respuesta PrestaShop", {
      method,
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
      bytes: text.length,
    });

    if (!response.ok) {
      const error = new Error(
        "PrestaShop HTTP " + response.status + ": " + text.slice(0, 300),
      );
      error.status = response.status;
      error.responseBody = text;
      throw error;
    }

    return text;
  }

  async function get(resource, params = {}) {
    return request("GET", resource, { params });
  }

  async function getSchema(resource, schema = "blank") {
    return request("GET", resource, { params: { schema } });
  }

  async function post(resource, body, params = {}) {
    return request("POST", resource, { params, body });
  }

  async function put(resource, body, params = {}) {
    return request("PUT", resource, { params, body });
  }

  async function patch(resource, body, params = {}) {
    return request("PATCH", resource, { params, body });
  }

  async function deleteResource(resource) {
    return request("DELETE", resource);
  }

  return { get, getSchema, post, put, patch, delete: deleteResource };
}

async function findProductIdsByReference(client, reference) {
  const searchXml = await client.get("products", {
    display: "[id,reference]",
    "filter[reference]": reference,
  });

  return parseAnyIdList(searchXml, "product");
}

function parseProductSummary(productXml) {
  return {
    id: Number(xmlText(productXml, "id") || 0),
    reference: xmlText(productXml, "reference"),
    active: xmlText(productXml, "active"),
    defaultCategory: xmlText(productXml, "id_category_default"),
    productPrice: Number(xmlText(productXml, "price") || 0),
  };
}

function parseProductSummaryList(xml) {
  return parseXmlBlocks(xml, "product").map((block) =>
    parseProductSummary(block),
  );
}

function parseCombinationList(xml) {
  return parseXmlBlocks(xml, "combination").map((block) => ({
    id: Number(xmlText(block, "id")),
    reference: xmlText(block, "reference"),
    price: Number(xmlText(block, "price") || 0),
    quantity: Number(xmlText(block, "quantity") || 0),
  }));
}

function parseCombinationDetails(xml) {
  return {
    id: Number(xmlText(xml, "id")),
    reference: xmlText(xml, "reference"),
    price: Number(xmlText(xml, "price") || 0),
    quantity: Number(xmlText(xml, "quantity") || 0),
    optionValueIds: parseIdList(xml, "product_option_value"),
  };
}

function parseStockAvailables(xml) {
  return parseXmlBlocks(xml, "stock_available").map((block) => ({
    id: Number(xmlText(block, "id")),
    productId: Number(xmlText(block, "id_product") || 0),
    productAttributeId: Number(xmlText(block, "id_product_attribute") || 0),
    quantity: Number(xmlText(block, "quantity") || 0),
  }));
}

function setXmlTagValue(xml, tagName, value) {
  const pattern = new RegExp(
    `(<${tagName}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tagName}>)`,
  );
  return xml.replace(pattern, `$1<![CDATA[${String(value ?? "")}]]>$3`);
}

function removeXmlTag(xml, tagName) {
  const pattern = new RegExp(
    `\\s*<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</${tagName}>`,
    "g",
  );
  return xml.replace(pattern, "");
}

async function countPrestaResources(
  client,
  resource,
  params = {},
  batchSize = 250,
) {
  let offset = 0;
  let total = 0;

  while (true) {
    const xml = await client.get(resource, {
      display: "[id]",
      limit: `${offset},${batchSize}`,
      ...params,
    });
    const ids = parseAnyIdList(xml, resource.slice(0, -1));
    total += ids.length;

    if (ids.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return total;
}

async function readPrestaOverview(client, log) {
  log("info", "Consultando resumen PrestaShop");

  const [totalProducts, activeProducts, inactiveProducts, totalCombinations] =
    await Promise.all([
      countPrestaResources(client, "products"),
      countPrestaResources(client, "products", { "filter[active]": 1 }),
      countPrestaResources(client, "products", { "filter[active]": 0 }),
      countPrestaResources(client, "combinations"),
    ]);

  return {
    source: "prestashop",
    totalProducts,
    activeProducts,
    inactiveProducts,
    totalCombinations,
  };
}

function normalizePrestaSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function mapPrestaProductListItem(product, stockRows) {
  const directStockRow =
    stockRows.find((row) => Number(row.productAttributeId) === 0) || null;
  const combinationStockRows = stockRows.filter(
    (row) => Number(row.productAttributeId) > 0,
  );
  const totalStock =
    stockRows.length > 0
      ? stockRows.reduce((acc, row) => acc + Number(row.quantity || 0), 0)
      : 0;

  return {
    productId: product.id,
    reference: product.reference || "",
    active: product.active,
    defaultCategory: product.defaultCategory || "",
    productPrice: Number(product.productPrice || 0),
    stockTotal: totalStock,
    stockRows: stockRows.length,
    directStock:
      directStockRow && Number.isFinite(Number(directStockRow.quantity))
        ? Number(directStockRow.quantity)
        : null,
    combinationCount: combinationStockRows.length,
    hasCombinations: combinationStockRows.length > 0,
  };
}

async function readPrestaProductsPage(client, log, options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(250, Math.max(1, Number(options.pageSize) || 50));
  const search = normalizePrestaSearch(options.search);
  const status = String(options.status || "all")
    .trim()
    .toLowerCase();

  if (log) {
    log("info", "Consultando pagina de productos PrestaShop", {
      page,
      pageSize,
      search,
      status,
    });
  }

  const startedAt = Date.now();
  const [products, stockAvailables] = await Promise.all([
    listPrestaProducts(client),
    listPrestaStockAvailables(client),
  ]);

  const stockByProductId = groupBy(stockAvailables, (row) => row.productId);

  let filteredProducts = products;

  if (status === "active") {
    filteredProducts = filteredProducts.filter(
      (product) => String(product.active) === "1",
    );
  } else if (status === "inactive") {
    filteredProducts = filteredProducts.filter(
      (product) => String(product.active) !== "1",
    );
  }

  if (search) {
    filteredProducts = filteredProducts.filter((product) => {
      const haystack = [
        String(product.id || ""),
        String(product.reference || ""),
        String(product.defaultCategory || ""),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  filteredProducts.sort((a, b) => a.id - b.id);

  const total = filteredProducts.length;
  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pageItems = filteredProducts
    .slice(offset, offset + pageSize)
    .map((product) =>
      mapPrestaProductListItem(product, stockByProductId.get(product.id) || []),
    );

  if (log) {
    log("info", "Pagina de productos PrestaShop cargada", {
      page: safePage,
      pageSize,
      returned: pageItems.length,
      total,
      totalPages,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return {
    source: "prestashop",
    filters: {
      search,
      status,
    },
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
    items: pageItems,
  };
}

async function listPrestaProducts(client, params = {}, batchSize = 250) {
  let offset = 0;
  const products = [];

  while (true) {
    const xml = await client.get("products", {
      display: "[id,reference,active,id_category_default,price]",
      limit: `${offset},${batchSize}`,
      ...params,
    });
    const batch = parseProductSummaryList(xml);
    products.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return products;
}

async function listPrestaStockAvailables(client, params = {}, batchSize = 250) {
  let offset = 0;
  const rows = [];

  while (true) {
    const xml = await client.get("stock_availables", {
      display: "full",
      limit: `${offset},${batchSize}`,
      ...params,
    });
    const batch = parseStockAvailables(xml);
    rows.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return rows;
}

function groupBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
  }

  return map;
}

async function buildPrestaCatalogSnapshot(client, log) {
  log("info", "Precargando snapshot de PrestaShop", {
    resources: ["products", "stock_availables"],
  });

  const startedAt = Date.now();
  const [products, stockAvailables] = await Promise.all([
    listPrestaProducts(client),
    listPrestaStockAvailables(client),
  ]);

  const productsByReference = groupBy(products, (product) => product.reference);
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const stockByProductId = groupBy(stockAvailables, (stock) => stock.productId);
  const productsWithCombinations = new Set(
    stockAvailables
      .filter((stock) => Number(stock.productAttributeId) > 0)
      .map((stock) => Number(stock.productId)),
  );

  const snapshot = {
    products,
    stockAvailables,
    productsByReference,
    productsById,
    stockByProductId,
    productsWithCombinations,
    combinationCache: new Map(),
    attributeValueCache: new Map(),
    attributeGroupCache: new Map(),
  };

  log("info", "Snapshot de PrestaShop listo", {
    products: products.length,
    stockRows: stockAvailables.length,
    references: productsByReference.size,
    productsWithCombinations: productsWithCombinations.size,
    elapsedMs: Date.now() - startedAt,
  });

  return snapshot;
}

async function inspectProductByReferenceValue(client, reference, log) {
  const searchXml = await client.get("products", {
    display: "[id,reference,active,id_category_default,price]",
    "filter[reference]": reference,
  });
  const productIds = parseAnyIdList(searchXml, "product");
  const productSummaries = parseProductSummaryList(searchXml);

  if (log) {
    log("info", "Busqueda producto PrestaShop", {
      reference,
      productIds,
      matches: productIds.length,
    });
  }

  if (productIds.length === 0) {
    if (log) {
      log("warn", "Producto no encontrado en PrestaShop", { reference });
    }
    return null;
  }

  const productId = productIds[0];
  const product =
    productSummaries.find((item) => item.id === productId) || null;

  if (!product) {
    throw new Error(
      "No se pudo obtener el resumen del producto PrestaShop id=" + productId,
    );
  }

  const combinationsXml = await client.get("combinations", {
    display: "full",
    "filter[id_product]": productId,
  });
  const combinations = await enrichCombinations(
    client,
    parseCombinationList(combinationsXml),
  );

  const stockXml = await client.get("stock_availables", {
    display: "full",
    "filter[id_product]": productId,
  });
  const stockAvailables = parseStockAvailables(stockXml);

  return {
    productId,
    ...product,
    matchCount: productIds.length,
    combinationIds: combinations.map((item) => item.id),
    stockIds: stockAvailables.map((item) => item.id),
    combinations,
    stockAvailables,
  };
}

async function getAttributeValueDetailsCached(client, snapshot, id) {
  if (snapshot.attributeValueCache.has(id)) {
    return snapshot.attributeValueCache.get(id);
  }

  const xml = await client.get("product_option_values/" + id);
  const value = {
    id,
    groupId: Number(xmlText(xml, "id_attribute_group") || 0),
    name: xmlLanguageText(xml, "name"),
  };
  snapshot.attributeValueCache.set(id, value);
  return value;
}

async function getAttributeGroupDetailsCached(client, snapshot, id) {
  if (snapshot.attributeGroupCache.has(id)) {
    return snapshot.attributeGroupCache.get(id);
  }

  const xml = await client.get("product_options/" + id);
  const group = {
    id,
    name: xmlLanguageText(xml, "name"),
  };
  snapshot.attributeGroupCache.set(id, group);
  return group;
}

async function enrichCombinationsCached(
  client,
  snapshot,
  productId,
  baseCombinations,
) {
  const cached = snapshot.combinationCache.get(productId);
  if (cached) {
    return cached;
  }

  const detailedCombinations = await Promise.all(
    baseCombinations.map(async (combination) => {
      const xml = await client.get("combinations/" + combination.id);
      const details = parseCombinationDetails(xml);
      return {
        ...combination,
        ...details,
      };
    }),
  );

  const optionValueIds = [
    ...new Set(
      detailedCombinations.flatMap((combination) => combination.optionValueIds),
    ),
  ];

  if (optionValueIds.length === 0) {
    const result = detailedCombinations.map((combination) => ({
      ...combination,
      optionValues: [],
    }));
    snapshot.combinationCache.set(productId, result);
    return result;
  }

  const attributeValues = await Promise.all(
    optionValueIds.map(async (id) =>
      getAttributeValueDetailsCached(client, snapshot, id),
    ),
  );
  const attributeValueMap = new Map(
    attributeValues.map((item) => [item.id, item]),
  );

  const groupIds = [
    ...new Set(
      attributeValues
        .map((item) => item.groupId)
        .filter((groupId) => Number.isFinite(groupId) && groupId > 0),
    ),
  ];
  const groups = await Promise.all(
    groupIds.map(async (id) =>
      getAttributeGroupDetailsCached(client, snapshot, id),
    ),
  );
  const groupMap = new Map(groups.map((item) => [item.id, item]));

  const result = detailedCombinations.map((combination) => ({
    ...combination,
    optionValues: combination.optionValueIds.map((id) => {
      const value = attributeValueMap.get(id);
      const group = value ? groupMap.get(value.groupId) : null;

      return {
        id,
        groupId: value ? value.groupId : null,
        groupName: group ? group.name : "",
        name: value ? value.name : "",
      };
    }),
  }));

  snapshot.combinationCache.set(productId, result);
  return result;
}

async function inspectProductByReferenceFromSnapshot(
  client,
  snapshot,
  reference,
  log,
) {
  const matches = snapshot.productsByReference.get(reference) || [];

  if (log) {
    log("debug", "Busqueda producto PrestaShop", {
      reference,
      productIds: matches.map((item) => item.id),
      matches: matches.length,
      source: "snapshot",
    });
  }

  if (matches.length === 0) {
    return null;
  }

  const product = matches[0];
  const stockAvailables = snapshot.stockByProductId.get(product.id) || [];
  let combinations = [];

  if (snapshot.productsWithCombinations.has(product.id)) {
    const combinationsXml = await client.get("combinations", {
      display: "full",
      "filter[id_product]": product.id,
    });
    combinations = await enrichCombinationsCached(
      client,
      snapshot,
      product.id,
      parseCombinationList(combinationsXml),
    );
  }

  return {
    productId: product.id,
    ...product,
    matchCount: matches.length,
    combinationIds: combinations.map((item) => item.id),
    stockIds: stockAvailables.map((item) => item.id),
    combinations,
    stockAvailables,
  };
}

async function updatePrestaProductActive(client, productId, active) {
  const existingProductXml = await client.get("products/" + productId);
  let updatedXml = existingProductXml;
  updatedXml = removeXmlTag(updatedXml, "manufacturer_name");
  updatedXml = removeXmlTag(updatedXml, "quantity");
  updatedXml = setXmlTagValue(updatedXml, "active", active ? 1 : 0);
  await client.put("products/" + productId, updatedXml);
  return { productId, active: active ? 1 : 0 };
}

function findBestPrestaMatch(article, combinations, stockAvailables) {
  const exactReference = combinations.find(
    (combination) => combination.reference === article.itemCode,
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
    (combination) => Number(combination.price) === Number(article.price),
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

async function getAttributeValueDetails(client, id) {
  const xml = await client.get("product_option_values/" + id);
  return {
    id,
    groupId: Number(xmlText(xml, "id_attribute_group") || 0),
    name: xmlLanguageText(xml, "name"),
  };
}

async function getAttributeGroupDetails(client, id) {
  const xml = await client.get("product_options/" + id);
  return {
    id,
    name: xmlLanguageText(xml, "name"),
  };
}

async function enrichCombinations(client, baseCombinations) {
  const detailedCombinations = await Promise.all(
    baseCombinations.map(async (combination) => {
      const xml = await client.get("combinations/" + combination.id);
      const details = parseCombinationDetails(xml);
      return {
        ...combination,
        ...details,
      };
    }),
  );

  const optionValueIds = [
    ...new Set(
      detailedCombinations.flatMap((combination) => combination.optionValueIds),
    ),
  ];

  if (optionValueIds.length === 0) {
    return detailedCombinations.map((combination) => ({
      ...combination,
      optionValues: [],
    }));
  }

  const attributeValues = await Promise.all(
    optionValueIds.map(async (id) => getAttributeValueDetails(client, id)),
  );
  const attributeValueMap = new Map(
    attributeValues.map((item) => [item.id, item]),
  );

  const groupIds = [
    ...new Set(
      attributeValues
        .map((item) => item.groupId)
        .filter((groupId) => Number.isFinite(groupId) && groupId > 0),
    ),
  ];
  const groups = await Promise.all(
    groupIds.map(async (id) => getAttributeGroupDetails(client, id)),
  );
  const groupMap = new Map(groups.map((item) => [item.id, item]));

  return detailedCombinations.map((combination) => ({
    ...combination,
    optionValues: combination.optionValueIds.map((id) => {
      const value = attributeValueMap.get(id);
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

async function inspectProductByReference(client, article, log) {
  const inspection = await inspectProductByReferenceValue(
    client,
    article.itemCode,
    log,
  );

  if (!inspection) {
    return null;
  }

  if (inspection.matchCount > 1) {
    log("warn", "Referencia duplicada en PrestaShop", {
      reference: article.itemCode,
      productIds: [inspection.productId],
    });
  }

  return {
    ...inspection,
    bestMatch: findBestPrestaMatch(
      article,
      inspection.combinations,
      inspection.stockAvailables,
    ),
  };
}

async function inspectProductByReferenceCached(client, snapshot, article, log) {
  const inspection = await inspectProductByReferenceFromSnapshot(
    client,
    snapshot,
    article.itemCode,
    log,
  );

  if (!inspection) {
    if (log) {
      log("warn", "Producto no encontrado en PrestaShop", {
        reference: article.itemCode,
      });
    }
    return null;
  }

  if (inspection.matchCount > 1) {
    log("warn", "Referencia duplicada en PrestaShop", {
      reference: article.itemCode,
      productIds: [inspection.productId],
    });
  }

  return {
    ...inspection,
    bestMatch: findBestPrestaMatch(
      article,
      inspection.combinations,
      inspection.stockAvailables,
    ),
  };
}

module.exports = {
  buildPrestaCatalogSnapshot,
  countPrestaResources,
  createPrestaClient,
  findBestPrestaMatch,
  findProductIdsByReference,
  getPrestaConfig,
  hasPrestaConfig,
  inspectProductByReference,
  inspectProductByReferenceCached,
  inspectProductByReferenceValue,
  listPrestaProducts,
  listPrestaStockAvailables,
  readPrestaProductsPage,
  readPrestaOverview,
  updatePrestaProductActive,
};
