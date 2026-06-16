const { env, requiredEnv } = require("./env");
const {
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

  return { get, getSchema, post, put, patch };
}

async function findProductIdsByReference(client, reference) {
  const searchXml = await client.get("products", {
    display: "[id,reference]",
    "filter[reference]": reference,
  });

  return parseIdList(searchXml, "product");
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
    productAttributeId: Number(xmlText(block, "id_product_attribute") || 0),
    quantity: Number(xmlText(block, "quantity") || 0),
  }));
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
    const ids = parseIdList(xml, resource.slice(0, -1));
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
  const searchXml = await client.get("products", {
    display: "[id,reference,active,id_category_default,price]",
    "filter[reference]": article.itemCode,
  });
  const productIds = parseIdList(searchXml, "product");
  const productSummaries = parseProductSummaryList(searchXml);

  log("info", "Busqueda producto PrestaShop", {
    reference: article.itemCode,
    productIds,
    matches: productIds.length,
  });

  if (productIds.length === 0) {
    log("warn", "Producto no encontrado en PrestaShop", {
      reference: article.itemCode,
    });
    return null;
  }

  if (productIds.length > 1) {
    log("warn", "Referencia duplicada en PrestaShop", {
      reference: article.itemCode,
      productIds,
    });
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

  const bestMatch = findBestPrestaMatch(article, combinations, stockAvailables);

  return {
    productId,
    ...product,
    matchCount: productIds.length,
    combinationIds: combinations.map((item) => item.id),
    stockIds: stockAvailables.map((item) => item.id),
    combinations,
    stockAvailables,
    bestMatch,
  };
}

module.exports = {
  countPrestaResources,
  createPrestaClient,
  findBestPrestaMatch,
  findProductIdsByReference,
  getPrestaConfig,
  hasPrestaConfig,
  inspectProductByReference,
  readPrestaOverview,
};
