/**
 * Muestra los campos UDF (U_*) disponibles en OITM y una muestra de sus valores.
 * Util para entender como estan estructuradas las categorias reales en SAP.
 *
 * Uso:
 *   npm run sap:udf
 */

const { loadEnvFile, env } = require("../src/env");
const { log } = require("../src/logger");
const hana = require("@sap/hana-client");

const envResult = loadEnvFile();
if (envResult.found) {
  log("info", ".env.local cargado");
}

const schema = env("HANA_SCHEMA", "BD_CARBALLO");
const connection = {
  serverNode: process.env.HANA_SERVER_NODE,
  uid: process.env.HANA_USER,
  pwd: process.env.HANA_PASSWORD,
  encrypt: false,
  sslValidateCertificate: false,
};

function pct(value, total) {
  if (!total) return "0";
  return Math.round((Number(value || 0) / total) * 100);
}

const conn = hana.createConnection();

try {
  conn.connect(connection);
  log("info", "Conectado a SAP HANA");

  // 1. Definiciones de UDF en OITM via CUFD (columnas basicas)
  let cufdRows = [];
  try {
    cufdRows = conn.exec(
      'SELECT "AliasID", "Descr" ' +
        'FROM "' + schema + '"."CUFD" ' +
        'WHERE "TableID" = \'OITM\' ' +
        'ORDER BY "AliasID"',
    );
  } catch (e) {
    log("warn", "No se pudo consultar CUFD: " + e.message);
  }

  console.log("\n=== UDFs definidos en OITM (tabla CUFD) ===\n");
  if (cufdRows.length === 0) {
    console.log("  (ninguno encontrado en CUFD)");
  } else {
    console.log(
      String("ALIAS").padEnd(30) + "DESCRIPCION",
    );
    console.log("-".repeat(70));
    for (const r of cufdRows) {
      console.log(
        String(r.AliasID || "").padEnd(30) + String(r.Descr || ""),
      );
    }
  }

  // 2. Columnas U_* en OITM via SYS.TABLE_COLUMNS
  const colRows = conn.exec(
    'SELECT "COLUMN_NAME" FROM "SYS"."TABLE_COLUMNS" ' +
      'WHERE "SCHEMA_NAME" = ? AND "TABLE_NAME" = \'OITM\' AND "COLUMN_NAME" LIKE \'U_%\' ' +
      'ORDER BY "COLUMN_NAME"',
    [schema],
  );

  const udfCols = colRows.map((r) => r.COLUMN_NAME);
  console.log(
    "\n=== Columnas U_* encontradas en OITM (" + udfCols.length + ") ===\n",
  );
  if (udfCols.length === 0) {
    console.log("  (ninguna)");
  } else {
    console.log(udfCols.join("\n"));
  }

  // 3. Cobertura de U_Categoria y subcategorias (articulos activos con precio y almacen)
  const priceList = process.env.SAP_PRICE_LIST || "14";
  const warehouse = process.env.SAP_WAREHOUSE || "AC01";

  const coverageRows = conn.exec(
    'SELECT ' +
      'COUNT(*) AS "Total", ' +
      'SUM(CASE WHEN I."U_Categoria" IS NOT NULL AND I."U_Categoria" <> \'\' THEN 1 ELSE 0 END) AS "ConCategoria", ' +
      'SUM(CASE WHEN I."U_SubCategoria1" IS NOT NULL AND I."U_SubCategoria1" <> \'\' THEN 1 ELSE 0 END) AS "ConSub1", ' +
      'SUM(CASE WHEN I."U_SubCategoria2" IS NOT NULL AND I."U_SubCategoria2" <> \'\' THEN 1 ELSE 0 END) AS "ConSub2", ' +
      'SUM(CASE WHEN I."U_SubCategoria3" IS NOT NULL AND I."U_SubCategoria3" <> \'\' THEN 1 ELSE 0 END) AS "ConSub3" ' +
      'FROM "' + schema + '"."OITM" I ' +
      'INNER JOIN "' + schema + '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' + schema + '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      "WHERE I.\"frozenFor\" = 'N' " +
      'AND P."PriceList" = ? AND C."WhsCode" = ?',
    [Number(priceList), warehouse],
  );

  const cov = coverageRows[0] || {};
  const total = Number(cov.Total || 0);

  console.log("\n=== Cobertura de UDFs de categoria (articulos activos lista=" + priceList + " almacen=" + warehouse + ") ===\n");
  console.log("  Total articulos:          " + total);
  console.log("  Con U_Categoria:          " + cov.ConCategoria + "  (" + pct(cov.ConCategoria, total) + "%)");
  console.log("  Con U_SubCategoria1:      " + cov.ConSub1      + "  (" + pct(cov.ConSub1, total) + "%)");
  console.log("  Con U_SubCategoria2:      " + cov.ConSub2      + "  (" + pct(cov.ConSub2, total) + "%)");
  console.log("  Con U_SubCategoria3:      " + cov.ConSub3      + "  (" + pct(cov.ConSub3, total) + "%)");

  // 4. Muestra de articulos CON U_Categoria completado
  const filledRows = conn.exec(
    'SELECT I."ItemCode", I."ItemName", I."U_Categoria", I."U_SubCategoria1", I."U_SubCategoria2", I."U_SubCategoria3" ' +
      'FROM "' + schema + '"."OITM" I ' +
      'INNER JOIN "' + schema + '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' + schema + '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      "WHERE I.\"frozenFor\" = 'N' " +
      'AND P."PriceList" = ? AND C."WhsCode" = ? ' +
      'AND I."U_Categoria" IS NOT NULL AND I."U_Categoria" <> \'\' ' +
      'LIMIT 10',
    [Number(priceList), warehouse],
  );

  console.log("\n=== Muestra de articulos CON U_Categoria (hasta 10) ===\n");
  if (filledRows.length === 0) {
    console.log("  (ninguno tiene U_Categoria completado)");
  } else {
    console.log(
      String("ITEMCODE").padEnd(14) +
        String("U_CATEGORIA").padEnd(30) +
        String("SUB1").padEnd(25) +
        String("SUB2").padEnd(25) +
        "SUB3",
    );
    console.log("-".repeat(110));
    for (const r of filledRows) {
      console.log(
        String(r.ItemCode || "").padEnd(14) +
          String(r.U_Categoria || "").padEnd(30) +
          String(r.U_SubCategoria1 || "").padEnd(25) +
          String(r.U_SubCategoria2 || "").padEnd(25) +
          (r.U_SubCategoria3 || ""),
      );
    }
  }

  console.log("");
} catch (error) {
  log("error", "Fallo la inspeccion de UDFs", {
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
