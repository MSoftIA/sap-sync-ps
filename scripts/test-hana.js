const hana = require("@sap/hana-client");
const fs = require("node:fs");
const path = require("node:path");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

function now() {
  return new Date().toISOString();
}

function log(level, message, data = {}) {
  console.log(JSON.stringify({ ts: now(), level, message, ...data }));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta variable de entorno: ${name}`);
  }
  return value;
}

function toIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Variable ${name} debe ser un entero positivo`);
  }
  return parsed;
}

function buildQuery({ schema, priceList, warehouse, itemCode, limit }) {
  const itemFilter = itemCode ? 'AND I."ItemCode" = ?' : "";

  return {
    sql: `
SELECT
  I."ItemCode",
  I."ItemName",
  I."QryGroup1",
  I."QryGroup2",
  I."QryGroup3",
  I."QryGroup4",
  P."AddPrice1" AS "Price",
  C."WhsCode",
  I."VATLiable",
  C."AvgPrice",
  C."OnHand" AS "Existencia",
  I."CodeBars",
  I."ItmsGrpCod",
  P."PriceList",
  I."SalUnitMsr",
  I."NumInSale",
  I."TaxCodeAP" AS "U_ITBIS",
  I."validFor" AS "Status",
  '' AS "U_LINEANEGOCIO",
  '' AS "MinLevel",
  '' AS "U_UBICACION"
FROM "${schema}"."OITM" I
INNER JOIN "${schema}"."ITM1" P ON P."ItemCode" = I."ItemCode"
INNER JOIN "${schema}"."OITW" C ON C."ItemCode" = I."ItemCode"
  AND I."frozenFor" = 'N'
WHERE
  P."PriceList" = ?
  AND C."WhsCode" = ?
  ${itemFilter}
LIMIT ${limit}
`.trim(),
    params: itemCode ? [priceList, warehouse, itemCode] : [priceList, warehouse],
  };
}

async function main() {
  const config = {
    serverNode: requiredEnv("HANA_SERVER_NODE"),
    uid: requiredEnv("HANA_USER"),
    pwd: requiredEnv("HANA_PASSWORD"),
  };

  const schema = process.env.HANA_SCHEMA || "BD_CARBALLO";
  const priceList = toIntEnv("SAP_PRICE_LIST", 14);
  const warehouse = process.env.SAP_WAREHOUSE || "AC01";
  const itemCode = process.env.SAP_ITEM_CODE || "";
  const limit = toIntEnv("SAP_LIMIT", 5);

  log("info", "Iniciando prueba de conexion SAP HANA", {
    serverNode: config.serverNode,
    user: config.uid,
    schema,
    priceList,
    warehouse,
    itemCode: itemCode || null,
    limit,
  });

  const conn = hana.createConnection();

  try {
    conn.connect(config);
    log("info", "Conexion SAP HANA exitosa");

    const { sql, params } = buildQuery({ schema, priceList, warehouse, itemCode, limit });
    log("info", "Ejecutando query de articulos", {
      params: params.map((value, index) => ({ index, value })),
    });

    const started = Date.now();
    const rows = conn.exec(sql, params);
    const elapsedMs = Date.now() - started;

    log("info", "Query ejecutada", {
      rows: rows.length,
      elapsedMs,
    });

    for (const row of rows) {
      log("data", "Articulo SAP", {
        itemCode: row.ItemCode,
        itemName: row.ItemName,
        price: row.Price,
        warehouse: row.WhsCode,
        stock: row.Existencia,
        barcode: row.CodeBars || null,
        status: row.Status,
      });
    }
  } finally {
    try {
      conn.disconnect();
      log("info", "Conexion cerrada");
    } catch (error) {
      log("warn", "No se pudo cerrar la conexion limpiamente", { error: error.message });
    }
  }
}

main().catch((error) => {
  log("error", "Fallo la prueba SAP HANA", {
    name: error.name,
    message: error.message,
    code: error.code || null,
  });
  process.exitCode = 1;
});
