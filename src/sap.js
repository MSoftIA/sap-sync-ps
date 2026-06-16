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
};
