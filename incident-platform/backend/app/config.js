import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

export const config = {
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/incidents_db',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  redisUrl: process.env.REDIS_URL?.trim() || '',
  redisEnabled: Boolean(process.env.REDIS_URL?.trim()),
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  jwtAlgorithm: process.env.JWT_ALGORITHM || 'HS256',
  accessTokenExpireMinutes: Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 60),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || '',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqApiUrl: process.env.GROQ_API_URL || 'https://api.groq.ai/v1',
  groqModel: process.env.GROQ_MODEL || 'groq-1.1',
  datadogApiKey: process.env.DATADOG_API_KEY || '',
  datadogHost: process.env.DATADOG_HOST || '127.0.0.1',
  datadogPort: Number(process.env.DATADOG_PORT || 8125),
  datadogMetricPrefix: process.env.DATADOG_METRIC_PREFIX || 'incident_platform',
  serviceName: process.env.SERVICE_NAME || 'incident-management-backend',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '',
  smtpUrl: process.env.SMTP_URL || '',
  alertEmailTo: process.env.ALERT_EMAIL_TO || '',
  alertEmailFrom: process.env.ALERT_EMAIL_FROM || '',
};
