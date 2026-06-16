const { env } = require("./env");
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
    <new>${cdata(1)}</new>
    <id_tax_rules_group>${cdata(1)}</id_tax_rules_group>
    <type>${cdata(1)}</type>
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
    <associations>
      <categories>
        <category>
          <id>${cdata(payload.product.defaultCategoryId)}</id>
        </category>
      </categories>
    </associations>
  </product>
</prestashop>`;
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
    const createXml = buildCreateProductXml(row.actionPayload);
    const createResponse = await client.post("products", createXml);
    const productIds = parseAnyIdList(createResponse, "product");
    const productId = productIds[0];

    if (!productId) {
      throw new Error("No se pudo obtener el id del producto creado");
    }

    const stockId = await findStockAvailableId(client, productId, 0);
    if (stockId && row.actionPayload.stockAvailable) {
      const stockXml = buildPatchStockXml(
        stockId,
        row.actionPayload.stockAvailable.quantity,
      );
      await client.patch("stock_availables/" + stockId, stockXml);
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

    const productXml = buildPatchProductXml(
      row.productId,
      row.actionPayload.product,
    );
    await client.patch("products/" + row.productId, productXml);
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

    const stockId = await findStockAvailableId(
      client,
      row.productId,
      row.actionPayload.stockAvailable.productAttributeId || 0,
    );

    if (!stockId) {
      throw new Error(
        "No se encontro stock_available para productId=" + row.productId,
      );
    }

    const stockXml = buildPatchStockXml(
      stockId,
      row.actionPayload.stockAvailable.quantity,
    );
    await client.patch("stock_availables/" + stockId, stockXml);
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
