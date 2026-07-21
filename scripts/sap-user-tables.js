/**
 * Lista las tablas de usuario (@) definidas en SAP B1 y muestra
 * una muestra de datos de las que podrian contener catalogos de categorias.
 *
 * Uso:
 *   npm run sap:utables
 */

const { loadEnvFile, env } = require("../src/env");
const { log } = require("../src/logger");
const hana = require("@sap/hana-client");

const envResult = loadEnvFile();
if (envResult.found) {
  log("info", ".env.local cargado");
}

const schema = env("HANA_SCHEMA", "BD_CARBALLO");
const conn = hana.createConnection();

try {
  conn.connect({
    serverNode: process.env.HANA_SERVER_NODE,
    uid: process.env.HANA_USER,
    pwd: process.env.HANA_PASSWORD,
    encrypt: false,
    sslValidateCertificate: false,
  });

  // 1. Todas las tablas de usuario definidas en OUTB
  const tables = conn.exec(
    'SELECT "TableName", "Descr", "Archivable" ' +
      'FROM "' + schema + '"."OUTB" ' +
      'ORDER BY "TableName"',
  );

  console.log("\n=== TABLAS DE USUARIO SAP (@) — total: " + tables.length + " ===\n");
  if (tables.length === 0) {
    console.log("  (ninguna tabla de usuario definida)");
  } else {
    console.log(String("TABLA").padEnd(30) + "DESCRIPCION");
    console.log("-".repeat(70));
    for (const t of tables) {
      console.log(
        String(t.TableName || "").padEnd(30) + String(t.Descr || ""),
      );
    }
  }

  // 2. Buscar tablas con nombre parecido a categoria/cat
  const catTables = tables.filter((t) => {
    const name = String(t.TableName || "").toLowerCase();
    const descr = String(t.Descr || "").toLowerCase();
    return (
      name.includes("cat") ||
      name.includes("sub") ||
      name.includes("grup") ||
      name.includes("tipo") ||
      descr.includes("cat") ||
      descr.includes("sub") ||
      descr.includes("grupo") ||
      descr.includes("tipo")
    );
  });

  if (catTables.length > 0) {
    console.log(
      "\n=== TABLAS RELACIONADAS CON CATEGORIAS (" + catTables.length + ") ===\n",
    );
    for (const t of catTables) {
      const fullName = "@" + t.TableName;
      console.log("Tabla: " + fullName + " — " + t.Descr);

      try {
        // Columnas de la tabla
        const cols = conn.exec(
          'SELECT "COLUMN_NAME" FROM "SYS"."TABLE_COLUMNS" ' +
            'WHERE "SCHEMA_NAME" = ? AND "TABLE_NAME" = ? ' +
            'ORDER BY "POSITION"',
          [schema, fullName],
        );
        console.log(
          "  Columnas: " + cols.map((c) => c.COLUMN_NAME).join(", "),
        );

        // Muestra de filas
        const rows = conn.exec(
          'SELECT * FROM "' + schema + '"."' + fullName + '" LIMIT 5',
        );
        if (rows.length === 0) {
          console.log("  (tabla vacia)");
        } else {
          for (const r of rows) {
            console.log("  " + JSON.stringify(r));
          }
        }
      } catch (e) {
        console.log("  Error leyendo tabla: " + e.message);
      }
      console.log("");
    }
  }

  // 3. Muestra de TODAS las tablas (primeras 3 filas cada una) si son pocas
  if (tables.length > 0 && tables.length <= 20 && catTables.length === 0) {
    console.log("\n=== MUESTRA DE DATOS DE CADA TABLA ===\n");
    for (const t of tables) {
      const fullName = "@" + t.TableName;
      console.log("Tabla: " + fullName + " — " + t.Descr);
      try {
        const rows = conn.exec(
          'SELECT * FROM "' + schema + '"."' + fullName + '" LIMIT 3',
        );
        if (rows.length === 0) {
          console.log("  (vacia)");
        } else {
          for (const r of rows) {
            console.log("  " + JSON.stringify(r));
          }
        }
      } catch (e) {
        console.log("  Error: " + e.message);
      }
      console.log("");
    }
  }
} catch (error) {
  log("error", "Fallo la inspeccion de tablas de usuario", {
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
