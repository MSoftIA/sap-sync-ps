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

  async function get(resource, params = {}) {
    const url = buildUrl(resource, params);
    log("info", "GET PrestaShop", { url: safeUrl(url) });

    const startedAt = Date.now();
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();

    log("info", "Respuesta PrestaShop", {
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
      bytes: text.length,
    });

    if (!response.ok) {
      throw new Error(
        "PrestaShop HTTP " + response.status + ": " + text.slice(0, 300),
      );
    }

    return text;
  }

  return { get };
}

function parseProductSummary(productXml) {
  return {
    reference: xmlText(productXml, "reference"),
    active: xmlText(productXml, "active"),
    defaultCategory: xmlText(productXml, "id_category_default"),
    productPrice: Number(xmlText(productXml, "price") || 0),
  };
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
    "filter[reference]": article.itemCode,
  });
  const productIds = parseIdList(searchXml, "product");

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
  const productXml = await client.get("products/" + productId);
  const product = parseProductSummary(productXml);

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
  createPrestaClient,
  findBestPrestaMatch,
  getPrestaConfig,
  hasPrestaConfig,
  inspectProductByReference,
};
