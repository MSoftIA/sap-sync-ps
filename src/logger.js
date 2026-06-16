function log(level, message, data = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...data,
    }),
  );
}

module.exports = {
  log,
};
