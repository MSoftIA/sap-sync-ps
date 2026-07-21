const { env, numberEnv } = require("./env");

function roundPrice(value) {
  return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function normalizeStock(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function getSyncDefaults() {
  const defaultCategoryId = env("PRESTASHOP_DEFAULT_CATEGORY_ID", "");
  const languageId = numberEnv("PRESTASHOP_LANGUAGE_ID", 1);

  return {
    defaultCategoryId: defaultCategoryId ? Number(defaultCategoryId) : null,
    languageId,
  };
}

function buildCreatePayload(article, defaults) {
  return {
    product: {
      reference: article.itemCode,
      name: article.itemName,
      price: roundPrice(article.price),
      active: article.status === "Y" ? 1 : 0,
      defaultCategoryId: defaults.defaultCategoryId,
      languageId: defaults.languageId,
    },
    stockAvailable: {
      quantity: normalizeStock(article.stock),
    },
  };
}

function buildUpdatePayload(row, article, defaults) {
  const payload = {};

  if (row.syncPrice) {
    payload.product = {
      id: row.productId,
      reference: row.productReference,
      price: roundPrice(row.sapPrice),
      name: article ? article.itemName : undefined,
      languageId: defaults ? defaults.languageId : 1,
    };
  } else if (row.syncName && article) {
    payload.product = {
      id: row.productId,
      reference: row.productReference,
      name: article.itemName,
      languageId: defaults ? defaults.languageId : 1,
    };
  }

  if (row.syncStock) {
    payload.stockAvailable = {
      productId: row.productId,
      productAttributeId: row.selectedCombinationId || 0,
      quantity: normalizeStock(row.sapStock),
    };
  }

  return payload;
}

function buildPayloadSummary(action, payload) {
  if (action === "skip_no_change") {
    return "sin cambios";
  }

  if (action === "review_combination_mapping") {
    return "requiere revision de combinacion";
  }

  if (action === "review_error") {
    return "requiere revision por error";
  }

  const parts = [];

  if (payload.product) {
    if (payload.product.id) {
      parts.push("productId=" + payload.product.id);
    }
    if (payload.product.reference) {
      parts.push("reference=" + payload.product.reference);
    }
    if (payload.product.price !== undefined) {
      parts.push("price=" + payload.product.price);
    }
    if (payload.product.defaultCategoryId !== undefined) {
      parts.push("defaultCategoryId=" + payload.product.defaultCategoryId);
    }
  }

  if (payload.stockAvailable) {
    if (payload.stockAvailable.productAttributeId !== undefined) {
      parts.push(
        "productAttributeId=" + payload.stockAvailable.productAttributeId,
      );
    }
    parts.push("stock=" + payload.stockAvailable.quantity);
  }

  return parts.join("; ");
}

function buildActionPayload(row, article) {
  const defaults = getSyncDefaults();

  let payload = {};
  let blockedReason = "";

  if (row.action === "create_product") {
    payload = buildCreatePayload(article, defaults);
    if (!defaults.defaultCategoryId) {
      blockedReason = "missing_default_category";
    }
  } else if (
    row.action === "update_product_price" ||
    row.action === "update_product_stock" ||
    row.action === "update_product_price_and_stock"
  ) {
    payload = buildUpdatePayload(row, article, defaults);
  }

  return {
    payload,
    payloadSummary: buildPayloadSummary(row.action, payload),
    blockedReason,
  };
}

module.exports = {
  buildActionPayload,
};
