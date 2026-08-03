/**
 * Inspecciona SAP HANA para ubicar donde podrian estar definidas las imagenes.
 *
 * Uso:
 *   npm run sap:images
 *
 * Opcional:
 *   SAP_IMAGE_ITEM_CODE=72101020 npm run sap:images
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
const itemCode = env("SAP_IMAGE_ITEM_CODE", env("SAP_ITEM_CODE", "")).trim();

function quoteIdent(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function tableName(schemaName, table) {
  return quoteIdent(schemaName) + "." + quoteIdent(table);
}

function truncate(value, max = 180) {
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
    const line = columns
      .map((column) => column + "=" + truncate(row[column]))
      .join(" | ");
    console.log("  " + line);
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

function inspectKnownTable(conn, table) {
  if (!tableExists(conn, table)) {
    console.log("Tabla " + table + ": no existe en schema " + schema);
    return;
  }

  const columns = getColumns(conn, table);
  const columnNames = columns.map((column) => column.COLUMN_NAME);
  console.log("\n=== Tabla " + table + " ===");
  console.log("Columnas: " + columnNames.join(", "));

  try {
    const rows = conn.exec(
      "SELECT * FROM " + tableName(schema, table) + " LIMIT 5",
    );
    printRows(rows, columnNames.slice(0, 12));
  } catch (error) {
    console.log("  No se pudo leer muestra: " + error.message);
  }
}

function inspectOitmPictureNames(conn) {
  console.log("\n=== OITM.PicturName ===");

  if (itemCode) {
    const rows = conn.exec(
      'SELECT I."ItemCode", I."ItemName", I."PicturName" ' +
        "FROM " +
        tableName(schema, "OITM") +
        ' I WHERE I."ItemCode" = ? LIMIT 1',
      [itemCode],
    );
    console.log("Producto puntual: " + itemCode);
    printRows(rows, ["ItemCode", "ItemName", "PicturName"]);
  }

  const coverage = conn.exec(
    'SELECT COUNT(*) AS "Total", ' +
      'SUM(CASE WHEN I."PicturName" IS NOT NULL AND TRIM(I."PicturName") <> \'\' THEN 1 ELSE 0 END) AS "ConImagen" ' +
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
  const total = Number(coverage[0]?.Total || 0);
  const withImage = Number(coverage[0]?.ConImagen || 0);
  const pct = total ? Math.round((withImage / total) * 100) : 0;
  console.log(
    "Cobertura PicturName: " + withImage + "/" + total + " (" + pct + "%)",
  );

  const samples = conn.exec(
    'SELECT I."ItemCode", I."ItemName", I."PicturName" ' +
      "FROM " +
      tableName(schema, "OITM") +
      ' I WHERE I."PicturName" IS NOT NULL AND TRIM(I."PicturName") <> \'\' ' +
      'ORDER BY I."ItemCode" LIMIT 20',
  );
  console.log("Muestra de nombres de imagen:");
  printRows(samples, ["ItemCode", "ItemName", "PicturName"]);
}

function findCandidateColumns(conn) {
  console.log("\n=== Columnas candidatas en HANA ===");

  const rows = conn.exec(
    'SELECT "TABLE_NAME", "COLUMN_NAME", "DATA_TYPE_NAME" ' +
      'FROM "SYS"."TABLE_COLUMNS" ' +
      'WHERE "SCHEMA_NAME" = ? AND (' +
      "UPPER(\"COLUMN_NAME\") LIKE '%PICT%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%IMAGE%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%IMG%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%PHOTO%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%FILE%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%PATH%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%ATTACH%' OR " +
      "\"DATA_TYPE_NAME\" IN ('BLOB', 'CLOB', 'NCLOB')" +
      ") " +
      'ORDER BY "TABLE_NAME", "COLUMN_NAME" LIMIT 200',
    [schema],
  );

  if (rows.length === 0) {
    console.log("  (sin columnas candidatas)");
    return;
  }

  printRows(rows, ["TABLE_NAME", "COLUMN_NAME", "DATA_TYPE_NAME"]);
}

function sampleCandidateValues(conn) {
  console.log("\n=== Muestras con valores tipo archivo/ruta ===");

  const candidates = conn.exec(
    'SELECT "TABLE_NAME", "COLUMN_NAME", "DATA_TYPE_NAME" ' +
      'FROM "SYS"."TABLE_COLUMNS" ' +
      'WHERE "SCHEMA_NAME" = ? AND (' +
      "UPPER(\"COLUMN_NAME\") LIKE '%PICT%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%IMAGE%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%IMG%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%FILE%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%PATH%' OR " +
      "UPPER(\"COLUMN_NAME\") LIKE '%ATTACH%'" +
      ") " +
      'ORDER BY "TABLE_NAME", "COLUMN_NAME" LIMIT 80',
    [schema],
  );

  for (const candidate of candidates) {
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
          ") <> '' AND (" +
          "LOWER(" +
          expr +
          ") LIKE '%.jpg%' OR LOWER(" +
          expr +
          ") LIKE '%.jpeg%' OR LOWER(" +
          expr +
          ") LIKE '%.png%' OR LOWER(" +
          expr +
          ") LIKE '%.webp%' OR " +
          expr +
          " LIKE '%\\\\%' OR " +
          expr +
          " LIKE '%/%' OR " +
          expr +
          " LIKE '%:%'" +
          ") LIMIT 5",
      );

      if (rows.length > 0) {
        console.log("Tabla " + table + "." + column);
        printRows(rows, ["Value"]);
      }
    } catch (error) {
      // Algunas columnas/tipos no convierten bien a texto; no bloquean la inspeccion.
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

  inspectOitmPictureNames(conn);

  console.log("\n=== Tablas estandar utiles para rutas/adjuntos ===");
  for (const table of ["OADP", "OATC", "ATC1"]) {
    inspectKnownTable(conn, table);
  }

  findCandidateColumns(conn);
  sampleCandidateValues(conn);

  console.log(
    "\nNota: si OITM.PicturName solo muestra nombres de archivo, busca en OADP alguna ruta tipo BitmapPath/AttachPath/PicturePath. Esa carpeta suele estar en el servidor o share de SAP B1, no dentro de HANA.",
  );
} catch (error) {
  log("error", "Fallo la inspeccion de imagenes SAP", {
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
