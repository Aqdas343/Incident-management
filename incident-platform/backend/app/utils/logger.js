export const logger = {
  info: (message, meta = {}) => console.log(JSON.stringify({ level: 'info', event: message, ...meta, timestamp: new Date().toISOString() })),
  warn: (message, meta = {}) => console.log(JSON.stringify({ level: 'warn', event: message, ...meta, timestamp: new Date().toISOString() })),
  error: (message, meta = {}) => console.error(JSON.stringify({ level: 'error', event: message, ...meta, timestamp: new Date().toISOString() })),
};
