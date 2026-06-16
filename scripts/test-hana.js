const { loadEnvFile } = require("../src/env");
const { log } = require("../src/logger");
const { readSapArticles } = require("../src/sap");

const envResult = loadEnvFile();
if (envResult.found) {
  log("info", ".env.local cargado");
}

try {
  readSapArticles(log);
} catch (error) {
  log("error", "Fallo la prueba SAP HANA", {
    name: error.name,
    message: error.message,
    code: error.code || null,
  });
  process.exitCode = 1;
}
