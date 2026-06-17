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
  const limitClause =
    Number.isFinite(limit) && Number(limit) > 0
      ? " LIMIT " + Number(limit)
      : "";

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
      limitClause,
    params: itemCode
      ? [priceList, warehouse, itemCode]
      : [priceList, warehouse],
  };
}

function connectSap(conn, log, config) {
  if (log) {
    log("info", "Conectando a SAP HANA");
  }
  conn.connect(config.connection);
  if (log) {
    log("info", "Conexion SAP HANA exitosa");
  }
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

function buildCategoryDiagnosticQuery({ schema, itemCode, limit }) {
  const propertyFields = Array.from({ length: 64 }, (_, index) => {
    const position = index + 1;
    return `I."QryGroup${position}" AS "QryGroup${position}"`;
  }).join(", ");
  const itemFilter = itemCode ? 'AND I."ItemCode" = ?' : "";
  const limitClause =
    Number.isFinite(limit) && Number(limit) > 0
      ? " LIMIT " + Number(limit)
      : "";

  return {
    sql:
      "SELECT " +
      'I."ItemCode", I."ItemName", I."ItmsGrpCod", B."ItmsGrpNam", ' +
      propertyFields +
      ' FROM "' +
      schema +
      '"."OITM" I ' +
      'LEFT JOIN "' +
      schema +
      '"."OITB" B ON B."ItmsGrpCod" = I."ItmsGrpCod" ' +
      "WHERE 1 = 1 " +
      itemFilter +
      ' ORDER BY I."ItemCode"' +
      limitClause,
    params: itemCode ? [itemCode] : [],
  };
}

function mapPropertyCatalogRow(row) {
  return {
    code: Number(row.ItmsTypCod),
    name: row.ItmsGrpNam,
    userSign: row.UserSign,
  };
}

function readSapCategoryPropertyCatalog(log) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const sql =
    'SELECT "ItmsTypCod", "ItmsGrpNam", "UserSign" ' +
    'FROM "' +
    config.query.schema +
    '"."OITG" ' +
    'ORDER BY "ItmsTypCod"';

  try {
    if (log) {
      log("info", "Consultando catalogo SAP de propiedades de articulos", {
        schema: config.query.schema,
      });
    }

    conn.connect(config.connection);
    return conn.exec(sql).map(mapPropertyCatalogRow);
  } finally {
    try {
      conn.disconnect();
    } catch {}
  }
}

function mapCategoryDiagnosticRow(row, propertyMap) {
  const activePropertyCodes = [];
  const activePropertyNames = [];

  for (let index = 1; index <= 64; index += 1) {
    const field = `QryGroup${index}`;
    if (String(row[field] || "").toUpperCase() !== "Y") {
      continue;
    }

    activePropertyCodes.push(index);
    activePropertyNames.push(propertyMap.get(index) || `QryGroup${index}`);
  }

  return {
    itemCode: row.ItemCode,
    itemName: row.ItemName,
    itemGroupCode: Number(row.ItmsGrpCod),
    itemGroupName: row.ItmsGrpNam || "",
    activePropertyCodes,
    activePropertyNames,
    activePropertyCount: activePropertyCodes.length,
    proposedPrestaCategory: row.ItmsGrpNam || "",
    proposedPrestaCategoryPath: row.ItmsGrpNam
      ? [row.ItmsGrpNam]
      : ["SIN_GRUPO_SAP"],
    hasMainCategory: Boolean(row.ItmsGrpNam),
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
    rawEnvSapItemCode: process.env.SAP_ITEM_CODE || "",
    rawEnvSapLimit: process.env.SAP_LIMIT || "",
  });

  try {
    connectSap(conn, log, config);

    const query = buildArticleQuery(config.query);
    log("info", "Ejecutando query SAP", {
      params: query.params,
      itemCodeFilterApplied: Boolean(config.query.itemCode),
      limitApplied:
        Number.isFinite(config.query.limit) && Number(config.query.limit) > 0,
      effectiveLimit:
        Number.isFinite(config.query.limit) && Number(config.query.limit) > 0
          ? Number(config.query.limit)
          : "sin limite",
      sqlHasLimitClause: /\sLIMIT\s/i.test(query.sql),
    });

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

function readSapArticleByCode(log, itemCode) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const query = buildArticleQuery({
    ...config.query,
    itemCode,
    limit: 1,
  });

  try {
    if (log) {
      log("info", "Consultando articulo puntual en SAP", {
        itemCode,
        warehouse: config.query.warehouse,
        priceList: config.query.priceList,
      });
    }

    connectSap(conn, log, config);
    const rows = conn.exec(query.sql, query.params);
    return rows.length > 0 ? mapSapRow(rows[0]) : null;
  } finally {
    try {
      conn.disconnect();
    } catch {}
  }
}

function readSapCategoryDiagnostics(log) {
  const config = getSapConfig();
  const conn = hana.createConnection();

  log("info", "Configuracion SAP cargada para categories", {
    serverNode: config.connection.serverNode,
    uid: config.connection.uid,
    schema: config.query.schema,
    itemCode: config.query.itemCode,
    limit: config.query.limit,
  });

  try {
    const propertyCatalog = readSapCategoryPropertyCatalog(log);
    const propertyMap = new Map(
      propertyCatalog.map((property) => [property.code, property.name]),
    );

    connectSap(conn, log, config);

    const query = buildCategoryDiagnosticQuery(config.query);
    log("info", "Ejecutando query SAP para categories", {
      params: query.params,
      itemCodeFilterApplied: Boolean(config.query.itemCode),
      limitApplied:
        Number.isFinite(config.query.limit) && Number(config.query.limit) > 0,
      effectiveLimit:
        Number.isFinite(config.query.limit) && Number(config.query.limit) > 0
          ? Number(config.query.limit)
          : "sin limite",
    });

    const startedAt = Date.now();
    const rows = conn.exec(query.sql, query.params);
    const diagnostics = rows.map((row) =>
      mapCategoryDiagnosticRow(row, propertyMap),
    );

    log("info", "Query SAP de categories completada", {
      rows: diagnostics.length,
      propertyCatalogSize: propertyCatalog.length,
      elapsedMs: Date.now() - startedAt,
    });

    return {
      propertyCatalog,
      diagnostics,
    };
  } finally {
    try {
      conn.disconnect();
      log("info", "Conexion SAP cerrada");
    } catch {}
  }
}

module.exports = {
  buildArticleQuery,
  buildCategoryDiagnosticQuery,
  getSapConfig,
  readSapArticleByCode,
  readSapArticles,
  readSapCategoryDiagnostics,
  readSapCategoryPropertyCatalog,
  readSapOverview,
};
