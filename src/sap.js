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

function buildSapProductListFilters({
  priceList,
  warehouse,
  search = "",
  status = "all",
  stock = "all",
}) {
  const filters = [
    `I."frozenFor" = 'N'`,
    `P."PriceList" = ?`,
    `C."WhsCode" = ?`,
  ];
  const params = [priceList, warehouse];

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    const searchPattern = `%${normalizedSearch.toUpperCase()}%`;
    filters.push(
      `(UPPER(I."ItemCode") LIKE ? OR UPPER(I."ItemName") LIKE ? OR UPPER(COALESCE(I."CodeBars", '')) LIKE ?)`,
    );
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const normalizedStatus = String(status || "all")
    .trim()
    .toLowerCase();
  if (normalizedStatus === "active") {
    filters.push(`I."validFor" = 'Y'`);
  } else if (normalizedStatus === "inactive") {
    filters.push(`I."validFor" <> 'Y'`);
  }

  const normalizedStock = String(stock || "all").trim().toLowerCase();
  if (normalizedStock === "with") {
    filters.push(`C."OnHand" > 0`);
  } else if (normalizedStock === "without") {
    filters.push(`C."OnHand" <= 0`);
  }

  return {
    whereClause: filters.join(" AND "),
    params,
  };
}

function buildSapProductListQuery({
  schema,
  priceList,
  warehouse,
  search,
  status,
  stock,
  page,
  pageSize,
}) {
  const { whereClause, params } = buildSapProductListFilters({
    priceList,
    warehouse,
    search,
    status,
    stock,
  });
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 50);
  const offset = (safePage - 1) * safePageSize;

  return {
    sql:
      "SELECT " +
      'I."ItemCode", I."ItemName", P."AddPrice1" AS "Price", ' +
      'C."WhsCode", C."OnHand" AS "Existencia", I."CodeBars", ' +
      'I."validFor" AS "Status", I."ItmsGrpCod" AS "ItemGroupCode" ' +
      'FROM "' +
      schema +
      '"."OITM" I ' +
      'INNER JOIN "' +
      schema +
      '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' +
      schema +
      '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      "WHERE " +
      whereClause +
      ' ORDER BY I."ItemCode" ASC ' +
      "LIMIT " +
      safePageSize +
      " OFFSET " +
      offset,
    params,
    page: safePage,
    pageSize: safePageSize,
    offset,
  };
}

function buildSapProductListCountQuery({
  schema,
  priceList,
  warehouse,
  search,
  status,
  stock,
}) {
  const { whereClause, params } = buildSapProductListFilters({
    priceList,
    warehouse,
    search,
    status,
    stock,
  });

  return {
    sql:
      'SELECT COUNT(*) AS "Total" ' +
      'FROM "' +
      schema +
      '"."OITM" I ' +
      'INNER JOIN "' +
      schema +
      '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' +
      schema +
      '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      "WHERE " +
      whereClause,
    params,
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

function mapSapProductListRow(row) {
  return {
    itemCode: row.ItemCode,
    itemName: row.ItemName,
    price: Number(row.Price),
    warehouse: row.WhsCode,
    stock: Number(row.Existencia),
    barcode: row.CodeBars || null,
    status: row.Status,
    itemGroupCode:
      row.ItemGroupCode === null || row.ItemGroupCode === undefined
        ? null
        : Number(row.ItemGroupCode),
  };
}

function buildCategoryDiagnosticQuery({
  schema,
  priceList,
  warehouse,
  itemCode,
  limit,
}) {
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
      'I."U_Categoria", I."U_SubCategoria1", I."U_SubCategoria2", I."U_SubCategoria3", ' +
      'CAT."Name" AS "CatName", SC1."Name" AS "Sub1Name", SC2."Name" AS "Sub2Name", SC3."Name" AS "Sub3Name", ' +
      propertyFields +
      ' FROM "' +
      schema +
      '"."OITM" I ' +
      'INNER JOIN "' +
      schema +
      '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' +
      schema +
      '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      'LEFT JOIN "' +
      schema +
      '"."OITB" B ON B."ItmsGrpCod" = I."ItmsGrpCod" ' +
      'LEFT JOIN "' +
      schema +
      '"."@CATEGORIA" CAT ON CAT."Code" = I."U_Categoria" ' +
      'LEFT JOIN "' +
      schema +
      '"."@SUBCAT_1" SC1 ON SC1."Code" = I."U_SubCategoria1" ' +
      'LEFT JOIN "' +
      schema +
      '"."@SUBCAT_2" SC2 ON SC2."Code" = I."U_SubCategoria2" ' +
      'LEFT JOIN "' +
      schema +
      '"."@SUBCAT_3" SC3 ON SC3."Code" = I."U_SubCategoria3" ' +
      "WHERE I.\"frozenFor\" = 'N' " +
      'AND P."PriceList" = ? ' +
      'AND C."WhsCode" = ? ' +
      itemFilter +
      ' ORDER BY I."ItemCode"' +
      limitClause,
    params: itemCode
      ? [priceList, warehouse, itemCode]
      : [priceList, warehouse],
  };
}

function readSapOrdersOverview(log) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const sql =
    "SELECT " +
    'COUNT(*) AS "TotalOrders", ' +
    'SUM(CASE WHEN O."DocStatus" = \'O\' AND O."CANCELED" = \'N\' THEN 1 ELSE 0 END) AS "OpenOrders", ' +
    'SUM(CASE WHEN O."DocStatus" = \'C\' AND O."CANCELED" = \'N\' THEN 1 ELSE 0 END) AS "ClosedOrders", ' +
    'SUM(CASE WHEN O."CANCELED" = \'Y\' THEN 1 ELSE 0 END) AS "CanceledOrders", ' +
    'COUNT(DISTINCT O."CardCode") AS "UniqueCustomers", ' +
    'MAX(O."DocDate") AS "LatestDocDate", ' +
    'MAX(O."DocNum") AS "LatestDocNum", ' +
    'SUM(CASE WHEN O."DocDate" >= ADD_DAYS(CURRENT_DATE, -30) THEN 1 ELSE 0 END) AS "OrdersLast30Days", ' +
    'SUM(CASE WHEN O."DocDate" >= ADD_DAYS(CURRENT_DATE, -7) THEN 1 ELSE 0 END) AS "OrdersLast7Days" ' +
    'FROM "' +
    config.query.schema +
    '"."ORDR" O';

  try {
    if (log) {
      log("info", "Consultando resumen SAP de pedidos", {
        schema: config.query.schema,
      });
    }

    conn.connect(config.connection);
    const rows = conn.exec(sql);
    const row = rows[0] || {};

    return {
      source: "sap",
      schema: config.query.schema,
      totalOrders: Number(row.TotalOrders || 0),
      openOrders: Number(row.OpenOrders || 0),
      closedOrders: Number(row.ClosedOrders || 0),
      canceledOrders: Number(row.CanceledOrders || 0),
      uniqueCustomers: Number(row.UniqueCustomers || 0),
      ordersLast30Days: Number(row.OrdersLast30Days || 0),
      ordersLast7Days: Number(row.OrdersLast7Days || 0),
      latestDocNum:
        row.LatestDocNum === null || row.LatestDocNum === undefined
          ? null
          : Number(row.LatestDocNum),
      latestDocDate: row.LatestDocDate
        ? new Date(row.LatestDocDate).toISOString()
        : null,
    };
  } finally {
    try {
      conn.disconnect();
    } catch {}
  }
}

function readSapOrdersSnapshot(log, options = {}) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const limit = Math.max(1, Number(options.limit) || 200);
  const sql =
    "SELECT " +
    'O."DocEntry", O."DocNum", O."CardCode", O."CardName", ' +
    'O."DocDate", O."DocStatus", O."CANCELED", O."DocTotal", ' +
    'O."NumAtCard", O."Comments", ' +
    'COUNT(L."LineNum") AS "LineCount", ' +
    'COUNT(DISTINCT L."ItemCode") AS "DistinctItems", ' +
    'COALESCE(SUM(L."Quantity"), 0) AS "TotalQuantity" ' +
    'FROM "' +
    config.query.schema +
    '"."ORDR" O ' +
    'LEFT JOIN "' +
    config.query.schema +
    '"."RDR1" L ON L."DocEntry" = O."DocEntry" ' +
    'GROUP BY ' +
    'O."DocEntry", O."DocNum", O."CardCode", O."CardName", ' +
    'O."DocDate", O."DocStatus", O."CANCELED", O."DocTotal", ' +
    'O."NumAtCard", O."Comments" ' +
    'ORDER BY O."DocDate" DESC, O."DocEntry" DESC ' +
    "LIMIT " +
    limit;

  try {
    if (log) {
      log("info", "Consultando snapshot SAP de pedidos", {
        schema: config.query.schema,
        limit,
      });
    }

    conn.connect(config.connection);
    const rows = conn.exec(sql);

    return rows.map((row) => ({
      docEntry: Number(row.DocEntry || 0),
      docNum: Number(row.DocNum || 0),
      cardCode: row.CardCode || "",
      cardName: row.CardName || "",
      docDate: row.DocDate ? new Date(row.DocDate).toISOString() : null,
      docStatus: row.DocStatus || "",
      canceled: row.CANCELED || "",
      docTotal: Number(row.DocTotal || 0),
      numAtCard: row.NumAtCard || "",
      comments: row.Comments || "",
      lineCount: Number(row.LineCount || 0),
      distinctItems: Number(row.DistinctItems || 0),
      totalQuantity: Number(row.TotalQuantity || 0),
    }));
  } finally {
    try {
      conn.disconnect();
    } catch {}
  }
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

  const categoryPath = [
    row.CatName || row.U_Categoria,
    row.Sub1Name || row.U_SubCategoria1,
    row.Sub2Name || row.U_SubCategoria2,
    row.Sub3Name || row.U_SubCategoria3,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  return {
    itemCode: row.ItemCode,
    itemName: row.ItemName,
    itemGroupCode: Number(row.ItmsGrpCod),
    itemGroupName: row.ItmsGrpNam || "",
    activePropertyCodes,
    activePropertyNames,
    activePropertyCount: activePropertyCodes.length,
    proposedPrestaCategory: categoryPath[categoryPath.length - 1] || "",
    proposedPrestaCategoryPath: categoryPath,
    hasMainCategory: categoryPath.length > 0,
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

function readSapProductsPage(log, options = {}) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(250, Math.max(1, Number(options.pageSize) || 50));
  const search = String(options.search || "").trim();
  const status = String(options.status || "all")
    .trim()
    .toLowerCase();
  const stock = String(options.stock || "all")
    .trim()
    .toLowerCase();
  const listQuery = buildSapProductListQuery({
    schema: config.query.schema,
    priceList: config.query.priceList,
    warehouse: config.query.warehouse,
    search,
    status,
    stock,
    page,
    pageSize,
  });
  const countQuery = buildSapProductListCountQuery({
    schema: config.query.schema,
    priceList: config.query.priceList,
    warehouse: config.query.warehouse,
    search,
    status,
    stock,
  });

  try {
    if (log) {
      log("info", "Consultando pagina de productos SAP", {
        schema: config.query.schema,
        warehouse: config.query.warehouse,
        priceList: config.query.priceList,
        page,
        pageSize,
        search,
        status,
      });
    }

    connectSap(conn, log, config);

    const startedAt = Date.now();
    const rows = conn.exec(listQuery.sql, listQuery.params);
    const totalRows = conn.exec(countQuery.sql, countQuery.params);
    const total = Number(totalRows[0]?.Total || 0);
    const items = rows.map(mapSapProductListRow);
    const totalPages =
      pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

    if (log) {
      log("info", "Pagina de productos SAP cargada", {
        page,
        pageSize,
        returned: items.length,
        total,
        totalPages,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return {
      source: "sap",
      schema: config.query.schema,
      warehouse: config.query.warehouse,
      priceList: config.query.priceList,
      filters: {
        search,
        status,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      items,
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

function readSapCategoryGroups(log) {
  const config = getSapConfig();
  const conn = hana.createConnection();
  const schema = config.query.schema;
  const sql =
    'SELECT B."ItmsGrpCod", B."ItmsGrpNam", COUNT(*) AS "ProductCount" ' +
    'FROM "' +
    schema +
    '"."OITM" I ' +
    'INNER JOIN "' +
    schema +
    '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
    'INNER JOIN "' +
    schema +
    '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
    'LEFT JOIN "' +
    schema +
    '"."OITB" B ON B."ItmsGrpCod" = I."ItmsGrpCod" ' +
    "WHERE I.\"frozenFor\" = 'N' " +
    'AND P."PriceList" = ? ' +
    'AND C."WhsCode" = ? ' +
    'GROUP BY B."ItmsGrpCod", B."ItmsGrpNam" ' +
    'ORDER BY B."ItmsGrpNam"';

  try {
    if (log) {
      log("info", "Consultando grupos de articulos SAP", {
        schema,
        priceList: config.query.priceList,
        warehouse: config.query.warehouse,
      });
    }

    conn.connect(config.connection);
    const rows = conn.exec(sql, [
      config.query.priceList,
      config.query.warehouse,
    ]);

    return rows.map((row) => ({
      groupCode: Number(row.ItmsGrpCod),
      groupName: row.ItmsGrpNam || "(sin grupo)",
      productCount: Number(row.ProductCount),
    }));
  } finally {
    try {
      conn.disconnect();
    } catch {}
  }
}

module.exports = {
  buildArticleQuery,
  buildCategoryDiagnosticQuery,
  buildSapProductListCountQuery,
  buildSapProductListQuery,
  getSapConfig,
  readSapArticleByCode,
  readSapArticles,
  readSapCategoryDiagnostics,
  readSapCategoryGroups,
  readSapCategoryPropertyCatalog,
  readSapOrdersOverview,
  readSapOrdersSnapshot,
  readSapOverview,
  readSapProductsPage,
};
