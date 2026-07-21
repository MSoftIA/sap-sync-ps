/**
 * Muestra el arbol de categorias SAP desde los UDFs de OITM.
 * Lista todas las combinaciones distintas de U_Categoria / U_SubCategoria1 / U_SubCategoria2
 * con conteo de articulos por nodo.
 *
 * Uso:
 *   npm run sap:tree
 */

const { loadEnvFile, env } = require("../src/env");
const { log } = require("../src/logger");
const hana = require("@sap/hana-client");

const envResult = loadEnvFile();
if (envResult.found) {
  log("info", ".env.local cargado");
}

const schema = env("HANA_SCHEMA", "BD_CARBALLO");
const priceList = Number(process.env.SAP_PRICE_LIST || 14);
const warehouse = process.env.SAP_WAREHOUSE || "AC01";
const conn = hana.createConnection();

try {
  conn.connect({
    serverNode: process.env.HANA_SERVER_NODE,
    uid: process.env.HANA_USER,
    pwd: process.env.HANA_PASSWORD,
    encrypt: false,
    sslValidateCertificate: false,
  });

  // Combinaciones distintas con conteo, resolviendo codigos a nombres via JOIN
  const rows = conn.exec(
    "SELECT " +
      'COALESCE(CAT."Name", I."U_Categoria") AS "CatName", ' +
      'COALESCE(SC1."Name", I."U_SubCategoria1") AS "Sub1Name", ' +
      'COALESCE(SC2."Name", I."U_SubCategoria2") AS "Sub2Name", ' +
      'COALESCE(SC3."Name", I."U_SubCategoria3") AS "Sub3Name", ' +
      'COUNT(*) AS "Total" ' +
      'FROM "' + schema + '"."OITM" I ' +
      'INNER JOIN "' + schema + '"."ITM1" P ON P."ItemCode" = I."ItemCode" ' +
      'INNER JOIN "' + schema + '"."OITW" C ON C."ItemCode" = I."ItemCode" ' +
      'LEFT JOIN "' + schema + '"."@CATEGORIA" CAT ON CAT."Code" = I."U_Categoria" ' +
      'LEFT JOIN "' + schema + '"."@SUBCAT_1" SC1 ON SC1."Code" = I."U_SubCategoria1" ' +
      'LEFT JOIN "' + schema + '"."@SUBCAT_2" SC2 ON SC2."Code" = I."U_SubCategoria2" ' +
      'LEFT JOIN "' + schema + '"."@SUBCAT_3" SC3 ON SC3."Code" = I."U_SubCategoria3" ' +
      "WHERE I.\"frozenFor\" = 'N' " +
      "AND P.\"PriceList\" = ? AND C.\"WhsCode\" = ? " +
      'GROUP BY CAT."Name", I."U_Categoria", SC1."Name", I."U_SubCategoria1", SC2."Name", I."U_SubCategoria2", SC3."Name", I."U_SubCategoria3" ' +
      'ORDER BY CAT."Name", SC1."Name", SC2."Name", SC3."Name"',
    [priceList, warehouse],
  );

  const totalArticulos = rows.reduce((s, r) => s + Number(r.Total), 0);
  const sinCategoria = rows
    .filter((r) => !r.U_Categoria || String(r.U_Categoria).trim() === "")
    .reduce((s, r) => s + Number(r.Total), 0);
  const conCategoria = totalArticulos - sinCategoria;

  console.log("\n=== ARBOL DE CATEGORIAS SAP (UDFs) ===\n");
  console.log("  Schema:    " + schema);
  console.log("  Lista:     " + priceList);
  console.log("  Almacen:   " + warehouse);
  console.log("  Total articulos:     " + totalArticulos);
  console.log("  Con U_Categoria:     " + conCategoria);
  console.log("  Sin U_Categoria:     " + sinCategoria + "  → iran a categoria default");
  console.log("");

  // Agrupar en arbol
  const catMap = new Map();

  for (const r of rows) {
    const cat = String(r.CatName || "").trim() || "(sin categoria)";
    const sub1 = String(r.Sub1Name || "").trim() || null;
    const sub2 = String(r.Sub2Name || "").trim() || null;
    const sub3 = String(r.Sub3Name || "").trim() || null;
    const count = Number(r.Total);

    if (!catMap.has(cat)) {
      catMap.set(cat, { total: 0, sub1Map: new Map() });
    }
    const catNode = catMap.get(cat);
    catNode.total += count;

    if (sub1) {
      if (!catNode.sub1Map.has(sub1)) {
        catNode.sub1Map.set(sub1, { total: 0, sub2Map: new Map() });
      }
      const sub1Node = catNode.sub1Map.get(sub1);
      sub1Node.total += count;

      if (sub2) {
        if (!sub1Node.sub2Map.has(sub2)) {
          sub1Node.sub2Map.set(sub2, { total: 0, sub3s: [] });
        }
        const sub2Node = sub1Node.sub2Map.get(sub2);
        sub2Node.total += count;

        if (sub3) {
          sub2Node.sub3s.push({ name: sub3, count });
        }
      }
    }
  }

  // Imprimir arbol
  for (const [catName, catNode] of catMap.entries()) {
    console.log("[" + catName + "]  (" + catNode.total + " articulos)");

    for (const [sub1Name, sub1Node] of catNode.sub1Map.entries()) {
      console.log("  └── " + sub1Name + "  (" + sub1Node.total + ")");

      for (const [sub2Name, sub2Node] of sub1Node.sub2Map.entries()) {
        console.log("        └── " + sub2Name + "  (" + sub2Node.total + ")");

        for (const sub3 of sub2Node.sub3s) {
          console.log("              └── " + sub3.name + "  (" + sub3.count + ")");
        }
      }
    }
  }

  console.log("");
} catch (error) {
  log("error", "Fallo la lectura del arbol de categorias", {
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
