import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// Resolve optional ws transport for Node < 22
let wsTransport;
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 22) {
  try {
    const { WebSocket } = await import('ws');
    wsTransport = WebSocket;
  } catch {
    // ws not available — realtime features may be limited
  }
}

const supabaseOptions = wsTransport ? { realtime: { transport: wsTransport } } : {};

// Export null when config is missing so the process doesn't crash at import
// time — initDb() will catch the missing config and exit with a clear message.
export const supabase = (config.supabaseUrl && config.supabaseServiceRoleKey)
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, supabaseOptions)
  : null;

export async function initDb() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    logger.error('db.init.missing_config', {
      message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
    });
    process.exit(1);
  }

  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) {
    logger.warn('db.init.warning', {
      message: 'Supabase reachable but expected tables may not exist yet.',
      error: error.message,
    });
  }
}
