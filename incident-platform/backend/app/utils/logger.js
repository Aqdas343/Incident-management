const formatLog = (level, event, meta) =>
  JSON.stringify({ level, event, ...meta, timestamp: new Date().toISOString() });

export const logger = {
  info:  (event, meta = {}) => console.log(formatLog('info', event, meta)),
  warn:  (event, meta = {}) => console.warn(formatLog('warn', event, meta)),
  error: (event, meta = {}) => console.error(formatLog('error', event, meta)),
};
