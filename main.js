const { run } = require("./src/app");
const { log } = require("./src/logger");

run().catch((err) => {
  log("error", "Fallo el script", {
    name: err.name,
    message: err.message,
    code: err.code || null,
  });
  process.exitCode = 1;
});
