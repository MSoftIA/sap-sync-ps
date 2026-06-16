const hana = require("@sap/hana-client");

const { env, numberEnv, requiredEnv } = require("./env");

function getSapConfig() {
  const schema = env("HANA_SCHEMA", "BD_CARBALLO");

  if (!/^[A-Za-z0-9_]+$/.test(schema)) {
    throw new Error("HANA_SCHEMA invalido: " + schema);
  }

  return {
    connection: {
      serverNode: requiredEnv("HANA_SERVER_NODE"),
      uid: requiredEnv("HANA_USER"),
      pwd: requiredEnv("HANA_PASSWORD"),
      encrypt: false,
      sslValidateCertificate: false,
    },
    query: {
      schema,
      priceList: numberEnv("SAP_PRICE_LIST", 14),
      warehouse: env("SAP_WAREHOUSE", "AC01"),
      itemCode: env("SAP_ITEM_CODE", "61072505"),
      limit: numberEnv("SAP_LIMIT", 5),
    },
  };
}

function buildArticleQuery({ schema, priceList, warehouse, itemCode, limit }) {
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

function mapSapRow(row) {
  return {
    itemCode: row.ItemCode,
    itemName: row.ItemName,
    price: Number(row.Price),
    warehouse: row.WhsCode,
    stock: Number(row.Existencia),
    barcode: row.CodeBars || null,
    status: row.Status,
    raw: row,
  };
}

function readSapOverview(log) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const sql =
    "SELECT " +
    'COUNT(*) AS "TotalProducts", ' +
    'SUM(CASE WHEN I."validFor" = \'Y\' THEN 1 ELSE 0 END) AS "ActiveProducts", ' +
    'SUM(CASE WHEN I."validFor" <> \'Y\' THEN 1 ELSE 0 END) AS "InactiveProducts", ' +
    'SUM(CASE WHEN C."OnHand" > 0 THEN 1 ELSE 0 END) AS "ProductsWithStock", ' +
    'SUM(CASE WHEN C."OnHand" <= 0 THEN 1 ELSE 0 END) AS "ProductsWithoutStock", ' +
    'SUM(COALESCE(C."OnHand", 0)) AS "TotalStock", ' +
    'SUM(COALESCE(P."AddPrice1", 0)) AS "TotalPriceListValue" ' +
    'FROM "' +
    config.query.schema +
    '"."OITM" I ' +
    'INNER JOIN "' +
    config.query.schema +
    '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
    'INNER JOIN "' +
    config.query.schema +
    '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
    "WHERE I.\"frozenFor\" = 'N' " +
    'AND P."PriceList" = ? ' +
    'AND C."WhsCode" = ?';

  try {
    log("info", "Consultando resumen SAP", {
      schema: config.query.schema,
      priceList: config.query.priceList,
      warehouse: config.query.warehouse,
    });

    conn.connect(config.connection);
    const rows = conn.exec(sql, [
      config.query.priceList,
      config.query.warehouse,
    ]);
    const row = rows[0] || {};

    return {
      source: "sap",
      schema: config.query.schema,
      warehouse: config.query.warehouse,
      priceList: config.query.priceList,
      totalProducts: Number(row.TotalProducts || 0),
      activeProducts: Number(row.ActiveProducts || 0),
      inactiveProducts: Number(row.InactiveProducts || 0),
      productsWithStock: Number(row.ProductsWithStock || 0),
      productsWithoutStock: Number(row.ProductsWithoutStock || 0),
      totalStock: Number(row.TotalStock || 0),
      totalPriceListValue: Number(row.TotalPriceListValue || 0),
    };
  } finally {
    try {
      conn.disconnect();
    } catch {}
  }
}

function readSapArticles(log) {
  const config = getSapConfig();
  const conn = hana.createConnection();

  log("info", "Configuracion SAP cargada", {
    serverNode: config.connection.serverNode,
    uid: config.connection.uid,
    schema: config.query.schema,
    priceList: config.query.priceList,
    warehouse: config.query.warehouse,
    itemCode: config.query.itemCode,
    limit: config.query.limit,
  });

  try {
    log("info", "Conectando a SAP HANA");
    conn.connect(config.connection);
    log("info", "Conexion SAP HANA exitosa");

    const query = buildArticleQuery(config.query);
    log("info", "Ejecutando query SAP", { params: query.params });

    const startedAt = Date.now();
    const rows = conn.exec(query.sql, query.params);
    const articles = rows.map(mapSapRow);

    log("info", "Query SAP completada", {
      rows: articles.length,
      elapsedMs: Date.now() - startedAt,
    });

    for (const article of articles) {
      log("debug", "Articulo SAP", article);
    }

    return articles;
  } finally {
    try {
      conn.disconnect();
      log("info", "Conexion SAP cerrada");
    } catch {}
  }
}

module.exports = {
  buildArticleQuery,
  getSapConfig,
  readSapArticles,
  readSapOverview,
};
