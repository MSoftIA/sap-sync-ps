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

  // 3. Muestra de valores de las columnas U_* (5 articulos)
  if (udfCols.length > 0) {
    const selectCols = udfCols
      .map((c) => '"' + c + '"')
      .join(", ");
    const sampleRows = conn.exec(
      'SELECT "ItemCode", ' +
        selectCols +
        ' FROM "' + schema + '"."OITM" ' +
        "WHERE \"frozenFor\" = 'N' LIMIT 5",
    );

    console.log("\n=== Muestra de valores UDF (5 articulos) ===\n");
    for (const row of sampleRows) {
      const vals = udfCols
        .map((c) => c + "=" + JSON.stringify(row[c] ?? null))
        .join("  ");
      console.log(row.ItemCode + "  ->  " + vals);
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
