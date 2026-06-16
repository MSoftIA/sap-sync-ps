const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  data: 3,
};

function getLogLevel() {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[raw] === undefined ? LEVELS.info : LEVELS[raw];
}

function shouldLog(level) {
  const currentLevel = getLogLevel();
  const messageLevel =
    LEVELS[level] === undefined ? LEVELS.info : LEVELS[level];
  return messageLevel <= currentLevel;
}

function log(level, message, data = {}) {
  if (!shouldLog(level)) {
    return;
  }

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
