import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const DEFAULT_JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
if (jwtSecret === DEFAULT_JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('[config] WARNING: JWT_SECRET is using the default insecure value. Set a strong JWT_SECRET in your .env before production use.');
}

const redisUrl = process.env.REDIS_URL?.trim() || '';

export const config = {
  port: Number(process.env.PORT || 8000),

  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/incidents_db',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  redisUrl,
  redisEnabled: Boolean(redisUrl),

  
  jwtSecret,
  jwtAlgorithm: process.env.JWT_ALGORITHM || 'HS256',
  accessTokenExpireMinutes: Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 60),

  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || '',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || '',

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqApiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '',
  smtpUrl: process.env.SMTP_URL || '',
  alertEmailTo: process.env.ALERT_EMAIL_TO || '',
  alertEmailFrom: process.env.ALERT_EMAIL_FROM || '',

  datadogApiKey: process.env.DATADOG_API_KEY || '',
  datadogHost: process.env.DATADOG_HOST || '127.0.0.1',
  datadogPort: Number(process.env.DATADOG_PORT || 8125),
  datadogMetricPrefix: process.env.DATADOG_METRIC_PREFIX || 'incident_platform',
  serviceName: process.env.SERVICE_NAME || 'incident-management-backend',
};
