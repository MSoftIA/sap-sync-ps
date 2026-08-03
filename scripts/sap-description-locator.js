/**
 * Inspecciona SAP HANA para encontrar donde estan las descripciones de producto.
 *
 * Uso:
 *   npm run sap:descriptions
 *
 * Producto puntual:
 *   $env:SAP_DESCRIPTION_ITEM_CODE="72102010"; npm run sap:descriptions
 */

const { loadEnvFile, env } = require("../src/env");
const { log } = require("../src/logger");
const hana = require("@sap/hana-client");

const envResult = loadEnvFile();
if (envResult.found) {
  log("info", ".env.local cargado");
}

const schema = env("HANA_SCHEMA", "BD_CARBALLO");
const priceList = Number(env("SAP_PRICE_LIST", "14"));
const warehouse = env("SAP_WAREHOUSE", "AC01");
const itemCode = env(
  "SAP_DESCRIPTION_ITEM_CODE",
  env("SAP_ITEM_CODE", ""),
).trim();

const DESCRIPTION_KEYWORDS = [
  "DESC",
  "DESCR",
  "DESCRIP",
  "DETAIL",
  "DETALLE",
  "TEXT",
  "TEXTO",
  "MEMO",
  "NOTE",
  "NOTA",
  "COMMENT",
  "COMENT",
  "WEB",
  "ECOM",
  "ECOMM",
  "HTML",
  "SEO",
  "LOGIST",
];

function quoteIdent(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function tableName(schemaName, table) {
  return quoteIdent(schemaName) + "." + quoteIdent(table);
}

function truncate(value, max = 240) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function printRows(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log("  (sin datos)");
    return;
  }

  for (const row of rows) {
    console.log(
      "  " +
        columns
          .map((column) => column + "=" + truncate(row[column]))
          .join(" | "),
    );
  }
}

function tableExists(conn, table) {
  const rows = conn.exec(
    'SELECT COUNT(*) AS "Total" FROM "SYS"."TABLES" ' +
      'WHERE "SCHEMA_NAME" = ? AND "TABLE_NAME" = ?',
    [schema, table],
  );
  return Number(rows[0]?.Total || 0) > 0;
}

function getColumns(conn, table) {
  return conn.exec(
    'SELECT "COLUMN_NAME", "DATA_TYPE_NAME", "POSITION" ' +
      'FROM "SYS"."TABLE_COLUMNS" ' +
      'WHERE "SCHEMA_NAME" = ? AND "TABLE_NAME" = ? ' +
      'ORDER BY "POSITION"',
    [schema, table],
  );
}

function isTextColumn(dataType) {
  return [
    "ALPHANUM",
    "CHAR",
    "CLOB",
    "NCLOB",
    "NVARCHAR",
    "SHORTTEXT",
    "TEXT",
    "VARCHAR",
  ].includes(String(dataType || "").toUpperCase());
}

function buildKeywordWhereExpression(columnExpr) {
  return DESCRIPTION_KEYWORDS.map(
    (keyword) => "UPPER(" + columnExpr + ") LIKE '%" + keyword + "%'",
  ).join(" OR ");
}

function inspectKnownOitmFields(conn) {
  console.log("\n=== Campos conocidos en OITM para descripcion ===");

  const rows = conn.exec(
    'SELECT I."ItemCode", I."ItemName", I."FrgnName", I."UserText", I."U_Desc_Logistica" ' +
      "FROM " +
      tableName(schema, "OITM") +
      " I " +
      (itemCode ? 'WHERE I."ItemCode" = ? ' : "") +
      'ORDER BY I."ItemCode" LIMIT 20',
    itemCode ? [itemCode] : [],
  );

  printRows(rows, [
    "ItemCode",
    "ItemName",
    "FrgnName",
    "UserText",
    "U_Desc_Logistica",
  ]);
}

function inspectOitmDescriptionCoverage(conn) {
  console.log("\n=== Cobertura de campos descripcion en OITM ===");

  const rows = conn.exec(
    'SELECT COUNT(*) AS "Total", ' +
      'SUM(CASE WHEN I."UserText" IS NOT NULL AND TRIM(I."UserText") <> \'\' THEN 1 ELSE 0 END) AS "ConUserText", ' +
      'SUM(CASE WHEN I."U_Desc_Logistica" IS NOT NULL AND TRIM(I."U_Desc_Logistica") <> \'\' THEN 1 ELSE 0 END) AS "ConDescLogistica", ' +
      'SUM(CASE WHEN I."FrgnName" IS NOT NULL AND TRIM(I."FrgnName") <> \'\' THEN 1 ELSE 0 END) AS "ConFrgnName" ' +
      "FROM " +
      tableName(schema, "OITM") +
      " I " +
      "INNER JOIN " +
      tableName(schema, "ITM1") +
      ' P ON P."ItemCode" = I."ItemCode" ' +
      "INNER JOIN " +
      tableName(schema, "OITW") +
      ' C ON C."ItemCode" = I."ItemCode" ' +
      "WHERE I.\"frozenFor\" = 'N' " +
      'AND P."PriceList" = ? AND C."WhsCode" = ?',
    [priceList, warehouse],
  );

  const row = rows[0] || {};
  const total = Number(row.Total || 0);

  for (const key of ["ConUserText", "ConDescLogistica", "ConFrgnName"]) {
    const value = Number(row[key] || 0);
    const pct = total ? Math.round((value / total) * 100) : 0;
    console.log("  " + key + ": " + value + "/" + total + " (" + pct + "%)");
  }
}

function findCandidateColumns(conn) {
  console.log("\n=== Columnas candidatas por nombre/tipo ===");

  const keywordSql = DESCRIPTION_KEYWORDS.map(
    (keyword) => 'UPPER("COLUMN_NAME") LIKE \'%' + keyword + "%'",
  ).join(" OR ");
  const rows = conn.exec(
    'SELECT "TABLE_NAME", "COLUMN_NAME", "DATA_TYPE_NAME" ' +
      'FROM "SYS"."TABLE_COLUMNS" ' +
      'WHERE "SCHEMA_NAME" = ? AND (' +
      keywordSql +
      " OR \"DATA_TYPE_NAME\" IN ('CLOB', 'NCLOB', 'TEXT', 'SHORTTEXT')) " +
      'ORDER BY "TABLE_NAME", "COLUMN_NAME" LIMIT 300',
    [schema],
  );

  printRows(rows, ["TABLE_NAME", "COLUMN_NAME", "DATA_TYPE_NAME"]);
  return rows;
}

function inspectOitmUdfDefinitions(conn) {
  console.log("\n=== UDFs OITM con nombres relacionados a descripcion ===");

  if (!tableExists(conn, "CUFD")) {
    console.log("  (CUFD no existe)");
    return;
  }

  const keywordSql = DESCRIPTION_KEYWORDS.map(
    (keyword) =>
      'UPPER("AliasID") LIKE \'%' +
      keyword +
      "%' OR UPPER(\"Descr\") LIKE '%" +
      keyword +
      "%'",
  ).join(" OR ");

  const rows = conn.exec(
    'SELECT "AliasID", "Descr", "EditType", "SizeID" ' +
      "FROM " +
      tableName(schema, "CUFD") +
      " WHERE \"TableID\" = 'OITM' AND (" +
      keywordSql +
      ') ORDER BY "AliasID"',
  );

  printRows(rows, ["AliasID", "Descr", "EditType", "SizeID"]);
}

function sampleOitmCandidateColumns(conn) {
  console.log(
    "\n=== Valores del producto puntual en columnas candidatas de OITM ===",
  );

  if (!itemCode) {
    console.log(
      "  Define SAP_DESCRIPTION_ITEM_CODE para ver valores puntuales.",
    );
    return;
  }

  const columns = getColumns(conn, "OITM")
    .filter((column) => isTextColumn(column.DATA_TYPE_NAME))
    .filter((column) => {
      const name = String(column.COLUMN_NAME || "").toUpperCase();
      return DESCRIPTION_KEYWORDS.some((keyword) => name.includes(keyword));
    });

  if (columns.length === 0) {
    console.log("  (sin columnas candidatas en OITM)");
    return;
  }

  const selectList = columns
    .map((column) => quoteIdent(column.COLUMN_NAME))
    .join(", ");
  const rows = conn.exec(
    'SELECT "ItemCode", ' +
      selectList +
      " FROM " +
      tableName(schema, "OITM") +
      ' WHERE "ItemCode" = ? LIMIT 1',
    [itemCode],
  );
  const row = rows[0];

  if (!row) {
    console.log("  Producto no encontrado: " + itemCode);
    return;
  }

  for (const column of columns) {
    const value = row[column.COLUMN_NAME];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      console.log(
        "  " +
          column.COLUMN_NAME +
          " (" +
          column.DATA_TYPE_NAME +
          ") = " +
          truncate(value),
      );
    }
  }
}

function sampleCandidateTableValues(conn, candidates) {
  console.log("\n=== Muestras con valores de texto en tablas candidatas ===");

  const limited = candidates
    .filter((candidate) => isTextColumn(candidate.DATA_TYPE_NAME))
    .slice(0, 120);

  for (const candidate of limited) {
    const table = candidate.TABLE_NAME;
    const column = candidate.COLUMN_NAME;
    const expr = "TO_NVARCHAR(" + quoteIdent(column) + ")";

    try {
      const rows = conn.exec(
        "SELECT " +
          expr +
          ' AS "Value" FROM ' +
          tableName(schema, table) +
          " WHERE " +
          quoteIdent(column) +
          " IS NOT NULL AND TRIM(" +
          expr +
          ") <> '' AND LENGTH(" +
          expr +
          ") >= 12 LIMIT 5",
      );

      if (rows.length > 0) {
        console.log("Tabla " + table + "." + column);
        printRows(rows, ["Value"]);
      }
    } catch (error) {
      // Algunas columnas/tables requieren permisos o no convierten a texto.
    }
  }
}

function inspectItemRelatedTables(conn) {
  console.log("\n=== Tablas con ItemCode y columnas de texto candidatas ===");

  const rows = conn.exec(
    'SELECT C."TABLE_NAME", C."COLUMN_NAME", C."DATA_TYPE_NAME" ' +
      'FROM "SYS"."TABLE_COLUMNS" C ' +
      'WHERE C."SCHEMA_NAME" = ? ' +
      "AND EXISTS (" +
      '  SELECT 1 FROM "SYS"."TABLE_COLUMNS" I ' +
      '  WHERE I."SCHEMA_NAME" = C."SCHEMA_NAME" ' +
      '  AND I."TABLE_NAME" = C."TABLE_NAME" ' +
      "  AND I.\"COLUMN_NAME\" = 'ItemCode'" +
      ") AND (" +
      buildKeywordWhereExpression('C."COLUMN_NAME"') +
      " OR C.\"DATA_TYPE_NAME\" IN ('CLOB', 'NCLOB', 'TEXT', 'SHORTTEXT')) " +
      'ORDER BY C."TABLE_NAME", C."COLUMN_NAME" LIMIT 200',
    [schema],
  );

  printRows(rows, ["TABLE_NAME", "COLUMN_NAME", "DATA_TYPE_NAME"]);

  if (!itemCode) {
    return;
  }

  console.log("\n=== Valores por ItemCode en tablas candidatas ===");
  for (const candidate of rows.filter((row) =>
    isTextColumn(row.DATA_TYPE_NAME),
  )) {
    const table = candidate.TABLE_NAME;
    const column = candidate.COLUMN_NAME;
    const expr = "TO_NVARCHAR(" + quoteIdent(column) + ")";

    try {
      const sample = conn.exec(
        'SELECT "ItemCode", ' +
          expr +
          ' AS "Value" FROM ' +
          tableName(schema, table) +
          ' WHERE "ItemCode" = ? AND ' +
          quoteIdent(column) +
          " IS NOT NULL AND TRIM(" +
          expr +
          ") <> '' LIMIT 5",
        [itemCode],
      );
      if (sample.length > 0) {
        console.log("Tabla " + table + "." + column);
        printRows(sample, ["ItemCode", "Value"]);
      }
    } catch (error) {
      // No bloquea la inspeccion.
    }
  }
}

const conn = hana.createConnection();

try {
  conn.connect({
    serverNode: process.env.HANA_SERVER_NODE,
    uid: process.env.HANA_USER,
    pwd: process.env.HANA_PASSWORD,
    encrypt: false,
    sslValidateCertificate: false,
  });

  log("info", "Conectado a SAP HANA", {
    schema,
    priceList,
    warehouse,
    itemCode,
  });

  inspectKnownOitmFields(conn);
  inspectOitmDescriptionCoverage(conn);
  inspectOitmUdfDefinitions(conn);
  sampleOitmCandidateColumns(conn);
  inspectItemRelatedTables(conn);
  const candidates = findCandidateColumns(conn);
  sampleCandidateTableValues(conn, candidates);

  console.log(
    "\nNota: si para el item puntual aparece un UDF con contenido descriptivo, ese es el campo que debemos mapear en src/sap.js para alimentar PrestaShop.",
  );
} catch (error) {
  log("error", "Fallo la inspeccion de descripciones SAP", {
    name: error.name,
    message: error.message,
    code: error.code || null,
  });
  process.exitCode = 1;
} finally {
  try {
    conn.disconnect();
  } catch {}
}
