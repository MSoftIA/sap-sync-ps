const { env } = require("./env");
const { findProductIdsByReference } = require("./prestashop");
const { parseAnyIdList } = require("./xml");

function isWriteEnabled() {
  return String(env("SYNC_WRITE", "false")).toLowerCase() === "true";
}

function cdata(value) {
  return "<![CDATA[" + String(value ?? "") + "]]>";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(text) {
  return (
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "producto-" + Date.now()
  );
}

function sanitizeProductName(text, fallback = "") {
  const normalized = String(text || fallback || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || String(fallback || "").trim() || "Producto").slice(
    0,
    128,
  );
}

function sanitizeAsciiProductName(text, fallback = "") {
  const normalized = sanitizeProductName(text, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,_()/#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || String(fallback || "").trim() || "Producto").slice(
    0,
    128,
  );
}

function setTagValue(xml, tagName, value) {
  const tagPattern = new RegExp(
    `(<${tagName}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tagName}>)`,
  );
  return xml.replace(tagPattern, `$1${cdata(value)}$3`);
}

function removeTag(xml, tagName) {
  const tagPattern = new RegExp(
    `\\s*<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</${tagName}>`,
    "g",
  );
  return xml.replace(tagPattern, "");
}

function setLanguageTagValue(xml, tagName, value, fallbackLanguageId = 1) {
  const tagPattern = new RegExp(
    `(<${tagName}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tagName}>)`,
  );

  return xml.replace(tagPattern, (_, openTag, inner, closeTag) => {
    const updatedInner = inner.replace(
      /(<language\b[^>]*>)([\s\S]*?)(<\/language>)/g,
      `$1${cdata(value)}$3`,
    );

    if (updatedInner !== inner) {
      return `${openTag}${updatedInner}${closeTag}`;
    }

    return (
      `${openTag}<language id="${escapeXml(fallbackLanguageId)}">` +
      `${cdata(value)}</language>${closeTag}`
    );
  });
}

function buildCreateProductXml(payload) {
  const safeName = sanitizeProductName(
    payload.product.name,
    payload.product.reference,
  );
  const safeSlug = slugify(safeName || payload.product.reference);

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product>
    <id_category_default>${cdata(payload.product.defaultCategoryId)}</id_category_default>
    <id_tax_rules_group>${cdata(0)}</id_tax_rules_group>
    <id_shop_default>${cdata(1)}</id_shop_default>
    <reference>${cdata(payload.product.reference)}</reference>
    <state>${cdata(1)}</state>
    <product_type>${cdata("standard")}</product_type>
    <price>${cdata(payload.product.price)}</price>
    <active>${cdata(payload.product.active)}</active>
    <name>
      <language id="${escapeXml(payload.product.languageId)}">${cdata(safeName)}</language>
    </name>
    <link_rewrite>
      <language id="${escapeXml(payload.product.languageId)}">${cdata(safeSlug)}</language>
    </link_rewrite>
  </product>
</prestashop>`;
}

function buildCreateProductXmlFromSchema(schemaXml, payload) {
  const safeName = sanitizeProductName(
    payload.product.name,
    payload.product.reference,
  );
  const safeSlug = slugify(safeName || payload.product.reference);

  let xml = schemaXml;
  xml = setTagValue(
    xml,
    "id_category_default",
    payload.product.defaultCategoryId,
  );
  xml = setTagValue(xml, "id_tax_rules_group", 1);
  xml = setTagValue(xml, "id_shop_default", 1);
  xml = setTagValue(xml, "reference", payload.product.reference);
  xml = setTagValue(xml, "state", 1);
  xml = setTagValue(xml, "price", payload.product.price);
  xml = setTagValue(xml, "active", payload.product.active);
  xml = setTagValue(xml, "available_for_order", 1);
  xml = setTagValue(xml, "show_price", 1);
  xml = setTagValue(xml, "minimal_quantity", 1);
  xml = setLanguageTagValue(xml, "name", safeName, payload.product.languageId);
  xml = setLanguageTagValue(
    xml,
    "link_rewrite",
    safeSlug,
    payload.product.languageId,
  );
  xml = setLanguageTagValue(
    xml,
    "description",
    safeName,
    payload.product.languageId,
  );
  xml = setLanguageTagValue(
    xml,
    "description_short",
    safeName,
    payload.product.languageId,
  );
  xml = setTagValue(xml, "id", "");
  xml = removeTag(xml, "associations");
  xml = xml.replace(
    /<\/product>/,
    "  <associations>\n" +
      '      <categories nodeType="category" api="categories">\n' +
      "        <category><id>" +
      cdata(payload.product.defaultCategoryId) +
      "</id></category>\n" +
      "      </categories>\n" +
      "    </associations>\n" +
      "  </product>",
  );

  return xml;
}

function buildPatchProductXml(productId, payload = {}) {
  const fields = ["<id>" + cdata(productId) + "</id>"];

  if (payload.reference) {
    fields.push("<reference>" + cdata(payload.reference) + "</reference>");
  }

  if (payload.price !== undefined) {
    fields.push("<price>" + cdata(payload.price) + "</price>");
  }

  if (payload.active !== undefined) {
    fields.push("<active>" + cdata(payload.active) + "</active>");
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product>
    ${fields.join("\n    ")}
  </product>
</prestashop>`;
}

function buildPatchStockXml(stockAvailableId, quantity) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <stock_available>
    <id>${cdata(stockAvailableId)}</id>
    <quantity>${cdata(quantity)}</quantity>
  </stock_available>
</prestashop>`;
}

async function findStockAvailableId(client, productId, productAttributeId = 0) {
  const xml = await client.get("stock_availables", {
    display: "full",
    "filter[id_product]": productId,
    "filter[id_product_attribute]": productAttributeId,
  });
  const ids = parseAnyIdList(xml, "stock_available");
  return ids[0] || null;
}

function buildPutProductXml(existingXml, payload = {}) {
  let xml = existingXml;
  xml = removeTag(xml, "manufacturer_name");
  xml = removeTag(xml, "quantity");

  if (payload.reference) {
    xml = setTagValue(xml, "reference", payload.reference);
  }

  if (payload.price !== undefined) {
    xml = setTagValue(xml, "price", payload.price);
  }

  if (payload.active !== undefined) {
    xml = setTagValue(xml, "active", payload.active);
  }

  return xml;
}

function buildPutStockXml(existingXml, quantity) {
  return setTagValue(existingXml, "quantity", quantity);
}

async function createProductWithFallbackName(client, row) {
  const createXml = buildCreateProductXml(row.actionPayload);

  try {
    return await client.post("products", createXml, { display: "[id]" });
  } catch (error) {
    const isNameValidationError =
      error.message &&
      error.message.includes("Product->name") &&
      error.message.includes("Validation error");

    if (!isNameValidationError) {
      throw error;
    }

    const fallbackPayload = {
      ...row.actionPayload,
      product: {
        ...row.actionPayload.product,
        name: sanitizeAsciiProductName(
          row.itemCode,
          row.actionPayload.product.reference,
        ),
      },
    };

    return client.post("products", buildCreateProductXml(fallbackPayload), {
      display: "[id]",
    });
  }
}

async function recoverCreatedProductId(client, row, log, error) {
  const productIds = await findProductIdsByReference(client, row.itemCode);

  if (productIds.length === 1) {
    log(
      "warn",
      "PrestaShop devolvio error luego de crear, pero el producto existe",
      {
        itemCode: row.itemCode,
        recoveredProductId: productIds[0],
        status: error.status || null,
      },
    );
    return productIds[0];
  }

  if (productIds.length > 1) {
    throw new Error(
      "La creacion dejo multiples productos con la misma referencia: " +
        row.itemCode,
    );
  }

  throw error;
}

async function executeSyncAction(client, row, log) {
  if (!isWriteEnabled()) {
    return {
      mode: "dry_run",
      executed: false,
      status: "planned_only",
      details: row.payloadSummary,
    };
  }

  if (row.blockedReason) {
    return {
      mode: "write",
      executed: false,
      status: "blocked",
      details: row.blockedReason,
    };
  }

  if (
    row.action === "skip_no_change" ||
    row.action === "review_combination_mapping" ||
    row.action === "review_error"
  ) {
    return {
      mode: "write",
      executed: false,
      status: "skipped",
      details: row.action,
    };
  }

  if (row.action === "create_product") {
    let productId = null;

    try {
      const createResponse = await createProductWithFallbackName(client, row);
      const productIds = parseAnyIdList(createResponse, "product");
      productId = productIds[0] || null;
    } catch (error) {
      if (error.status === 500) {
        productId = await recoverCreatedProductId(client, row, log, error);
      } else {
        throw error;
      }
    }

    if (!productId) {
      productId = await recoverCreatedProductId(
        client,
        row,
        log,
        new Error(
          "No se pudo obtener el id del producto creado desde la respuesta",
        ),
      );
    }

    const stockId = await findStockAvailableId(client, productId, 0);
    if (stockId && row.actionPayload.stockAvailable) {
      const existingStockXml = await client.get("stock_availables/" + stockId);
      const stockXml = buildPutStockXml(
        existingStockXml,
        row.actionPayload.stockAvailable.quantity,
      );
      await client.put("stock_availables/" + stockId, stockXml);
    }

    log("info", "Producto creado en PrestaShop", {
      itemCode: row.itemCode,
      productId,
      stockId: stockId || null,
    });

    return {
      mode: "write",
      executed: true,
      status: "created",
      details: "productId=" + productId,
      productId,
      stockId: stockId || null,
    };
  }

  if (
    row.action === "update_product_price" ||
    row.action === "update_product_price_and_stock"
  ) {
    if (!row.actionPayload || !row.actionPayload.product) {
      throw new Error("Falta actionPayload.product para action=" + row.action);
    }

    const existingProductXml = await client.get("products/" + row.productId);
    const productXml = buildPutProductXml(
      existingProductXml,
      row.actionPayload.product,
    );
    await client.put("products/" + row.productId, productXml, { display: "[id]" });
  }

  // Name update: always via minimal XML, never inside the price PUT
  if (
    row.syncName &&
    (row.action === "update_product_price" ||
      row.action === "update_product_price_and_stock" ||
      row.action === "update_product_stock" ||
      row.action === "update_product_name")
  ) {
    const product = row.actionPayload && row.actionPayload.product;
    const name = product && product.name;
    const langId = (product && product.languageId) || 1;

    if (name) {
      const safeName = sanitizeProductName(name, row.itemCode);
      const asciiName = sanitizeAsciiProductName(name, row.itemCode);

      log("info", `Actualizando nombre: safe="${safeName}" ascii="${asciiName}" lang=${langId}`, {
        itemCode: row.itemCode,
        productId: row.productId,
      });

      const existingXmlForName = await client.get("products/" + row.productId);
      let baseNameXml = removeTag(existingXmlForName, "manufacturer_name");
      baseNameXml = removeTag(baseNameXml, "quantity");

      const tryPutName = async (nameValue) => {
        const nameXml = setLanguageTagValue(baseNameXml, "name", nameValue, langId);
        log("info", "PUT nombre (intento)", { nameValue, productId: row.productId });
        await client.put("products/" + row.productId, nameXml, { display: "[id]" });
      };

      try {
        await tryPutName(safeName);
        log("info", "Nombre actualizado en PrestaShop", { itemCode: row.itemCode, name: safeName });
      } catch (firstError) {
        log("warn", "Fallo PUT nombre UTF-8: " + firstError.message, {
          itemCode: row.itemCode,
          safeName,
        });
        try {
          await tryPutName(asciiName);
          log("info", "Nombre actualizado en PrestaShop (ASCII)", { itemCode: row.itemCode, name: asciiName });
        } catch (secondError) {
          log("warn", "Fallo PUT nombre ASCII: " + secondError.message, {
            itemCode: row.itemCode,
            productId: row.productId,
            asciiName,
          });
        }
      }
    }
  }

  if (
    row.action === "update_product_stock" ||
    row.action === "update_product_price_and_stock"
  ) {
    if (!row.actionPayload || !row.actionPayload.stockAvailable) {
      throw new Error(
        "Falta actionPayload.stockAvailable para action=" + row.action,
      );
    }

    const stockId =
      row.selectedStockId ||
      (await findStockAvailableId(
        client,
        row.productId,
        row.actionPayload.stockAvailable.productAttributeId || 0,
      ));

    if (!stockId) {
      throw new Error(
        "No se encontro stock_available para productId=" + row.productId,
      );
    }

    const existingStockXml = await client.get("stock_availables/" + stockId);
    const stockXml = buildPutStockXml(
      existingStockXml,
      row.actionPayload.stockAvailable.quantity,
    );
    await client.put("stock_availables/" + stockId, stockXml);
  }

  log("info", "Accion aplicada en PrestaShop", {
    itemCode: row.itemCode,
    action: row.action,
    productId: row.productId,
  });

  return {
    mode: "write",
    executed: true,
    status: "updated",
    details: row.action,
    productId: row.productId,
  };
}

module.exports = {
  executeSyncAction,
  isWriteEnabled,
};
