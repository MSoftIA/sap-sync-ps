const { env, numberEnv } = require("./env");
const { applyProductAttributeMapping } = require("./product-attribute-mapping");

function floorNumber(value, decimals = 0) {
  const number = Number(value || 0);
  const factor = 10 ** decimals;
  return Math.floor(number * factor) / factor;
}

function roundPrice(value) {
  return floorNumber(value, 6);
}

function normalizeStock(value) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

function getSyncDefaults() {
  const defaultCategoryId = env("PRESTASHOP_DEFAULT_CATEGORY_ID", "");
  const languageId = numberEnv("PRESTASHOP_LANGUAGE_ID", 1);

  return {
    defaultCategoryId: defaultCategoryId ? Number(defaultCategoryId) : null,
    languageId,
  };
}

function shouldShowInPrestashop(article) {
  if (typeof article.shouldShowInPrestashop === "boolean") {
    return article.shouldShowInPrestashop;
  }

  return (
    String(article.prestashopVisibility || "")
      .trim()
      .toUpperCase() === "Y"
  );
}

function buildCreatePayload(article, defaults) {
  const metadata = buildProductMetadata(article);

  return {
    product: {
      reference: article.itemCode,
      name: article.itemName,
      price: roundPrice(article.price),
      active: shouldShowInPrestashop(article) ? 1 : 0,
      defaultCategoryId: defaults.defaultCategoryId,
      languageId: defaults.languageId,
      ...metadata,
    },
    stockAvailable: {
      quantity: normalizeStock(article.stock),
    },
  };
}

function buildProductMetadata(article) {
  return applyProductAttributeMapping(article);
}

function buildUpdatePayload(row, article, defaults) {
  const payload = {};
  const langId = defaults ? defaults.languageId : 1;
  const metadata = row.syncMetadata ? buildProductMetadata(article) : {};

  if (row.syncPrice || row.syncMetadata || row.syncActive) {
    payload.product = {
      id: row.productId,
      reference: row.productReference,
      price: row.syncPrice ? roundPrice(row.sapPrice) : undefined,
      active: row.syncActive
        ? shouldShowInPrestashop(article)
          ? 1
          : 0
        : undefined,
      name: row.syncName && article ? article.itemName : undefined,
      languageId: langId,
      ...metadata,
    };
  } else if (row.syncName && article) {
    // update_product_name: only name, no price
    payload.product = {
      id: row.productId,
      reference: row.productReference,
      name: article.itemName,
      languageId: langId,
    };
  }

  // Attach name to price-update payload too so executor can sync it separately
  if (row.syncPrice && row.syncName && article && payload.product) {
    payload.product.name = article.itemName;
    payload.product.languageId = langId;
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
    if (payload.product.active !== undefined) {
      parts.push("active=" + payload.product.active);
    }
    if (payload.product.defaultCategoryId !== undefined) {
      parts.push("defaultCategoryId=" + payload.product.defaultCategoryId);
    }
    if (payload.product.description !== undefined) {
      parts.push("description=SAP");
    }
    if (payload.product.descriptionShort !== undefined) {
      parts.push("descriptionShort=SAP");
    }
    if (payload.product.mpn !== undefined) {
      parts.push("mpn=" + payload.product.mpn);
    }
    if (payload.product.supplierReference !== undefined) {
      parts.push("supplierReference=" + payload.product.supplierReference);
    }
    if (payload.product.ean13 !== undefined) {
      parts.push("ean13=" + payload.product.ean13);
    }
    if (payload.product.weight !== undefined) {
      parts.push("weight=" + payload.product.weight);
    }
    if (payload.product.metaTitle !== undefined) {
      parts.push("metaTitle=SAP");
    }
    if (payload.product.metaDescription !== undefined) {
      parts.push("metaDescription=SAP");
    }
    if (
      Array.isArray(payload.product.sapFeatures) &&
      payload.product.sapFeatures.length > 0
    ) {
      parts.push("featuresSAP=" + payload.product.sapFeatures.length);
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
    row.action === "update_product_price_and_stock" ||
    row.action === "update_product_name" ||
    row.action === "update_product_metadata" ||
    row.action === "update_product_visibility"
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
  shouldShowInPrestashop,
};
