const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(filename = ".env.local") {
  const file = path.join(process.cwd(), filename);
  if (!fs.existsSync(file)) {
    return { found: false, file };
  }

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) continue;

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

  return { found: true, file };
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function requiredEnv(name) {
  const value = env(name);
  if (!value) {
    throw new Error("Falta variable: " + name);
  }
  return value;
}

function numberEnv(name, fallback) {
  const value = Number(env(name, String(fallback)));
  if (!Number.isFinite(value)) {
    throw new Error("Variable numerica invalida: " + name);
  }
  return value;
}

module.exports = {
  env,
  loadEnvFile,
  numberEnv,
  requiredEnv,
};
