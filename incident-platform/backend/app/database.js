import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
}

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
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, supabaseOptions);

export async function initDb() {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) {
    logger.warn('db.init.warning', {
      message: 'Supabase is reachable but expected tables may not exist yet.',
      error: error.message,
    });
  }
}
