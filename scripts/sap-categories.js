/**
 * Muestra las categorias que el programa leria desde SAP para sincronizar con PrestaShop.
 *
 * La categoria propuesta para cada producto viene de OITB.ItmsGrpNam (grupo de articulos SAP).
 * Este script muestra los grupos distintos con su conteo de productos, para entender
 * exactamente que categorias generaria una sincronizacion.
 *
 * Uso:
 *   npm run sap:categories
 */

const { loadEnvFile } = require("../src/env");
const { log } = require("../src/logger");
const { readSapCategoryGroups } = require("../src/sap");

const envResult = loadEnvFile();
if (envResult.found) {
  log("info", ".env.local cargado");
}

try {
  const groups = readSapCategoryGroups(log);
  const total = groups.reduce((sum, g) => sum + g.productCount, 0);

  console.log("\n=== CATEGORIAS SAP (grupos de articulos -> PrestaShop) ===\n");
  console.log(
    "  Esquema:   " + (process.env.HANA_SCHEMA || "BD_CARBALLO"),
  );
  console.log("  Lista:     " + (process.env.SAP_PRICE_LIST || "14"));
  console.log("  Almacen:   " + (process.env.SAP_WAREHOUSE || "AC01"));
  console.log("");
  console.log(
    String("COD").padEnd(6) +
      String("NOMBRE_GRUPO").padEnd(40) +
      "PRODUCTOS",
  );
  console.log("-".repeat(55));

  for (const g of groups) {
    console.log(
      String(g.groupCode).padEnd(6) +
        String(g.groupName).slice(0, 39).padEnd(40) +
        g.productCount,
    );
  }

  console.log("-".repeat(55));
  console.log(
    String("").padEnd(6) +
      String("TOTAL").padEnd(40) +
      total,
  );
  console.log("\n" + groups.length + " categoria(s) distintas.\n");
} catch (error) {
  log("error", "Fallo la lectura de categorias SAP", {
    name: error.name,
    message: error.message,
    code: error.code || null,
  });
  process.exitCode = 1;
}
