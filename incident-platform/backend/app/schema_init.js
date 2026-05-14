import { Client } from 'pg';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                 uuid        PRIMARY KEY,
  email              text        NOT NULL UNIQUE,
  hashed_password    text        NOT NULL,
  refresh_token_hash text,
  role               text        NOT NULL,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id                   uuid        PRIMARY KEY,
  title                text        NOT NULL,
  service              text        NOT NULL,
  severity             text        NOT NULL DEFAULT 'unknown',
  status               text        NOT NULL DEFAULT 'open',
  category             text        NOT NULL DEFAULT 'infrastructure',
  source               text        NOT NULL,
  raw_payload          jsonb,
  hash_fingerprint     text        NOT NULL UNIQUE,
  assigned_to          uuid        REFERENCES users(id),
  parent_incident_id   uuid        REFERENCES incidents(id),
  escalation_level     integer     NOT NULL DEFAULT 0,
  duplicate_count      integer     NOT NULL DEFAULT 0,
  ai_summary           text,
  ai_root_cause        text,
  ai_suggested_action  text,
  business_impact      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz
);

CREATE TABLE IF NOT EXISTS incident_notes (
  id          uuid        PRIMARY KEY,
  incident_id uuid        NOT NULL REFERENCES incidents(id),
  user_id     uuid        REFERENCES users(id),
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_events (
  id           uuid        PRIMARY KEY,
  incident_id  uuid        NOT NULL REFERENCES incidents(id),
  from_level   integer     NOT NULL,
  to_level     integer     NOT NULL,
  reason       text        NOT NULL,
  triggered_by text,
  triggered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parallel_investigations (
  id           uuid        PRIMARY KEY,
  incident_id  uuid        NOT NULL REFERENCES incidents(id),
  type         text        NOT NULL,
  assigned_team text       NOT NULL,
  deadline     timestamptz NOT NULL,
  status       text        NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_rules (
  id                    uuid        PRIMARY KEY,
  severity              text,
  category              text,
  min_escalation_level  integer     NOT NULL DEFAULT 0,
  target_level          integer     NOT NULL,
  immediate             boolean     NOT NULL DEFAULT false,
  active                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dead_letter_messages (
  id         uuid        PRIMARY KEY,
  queue      text        NOT NULL,
  job_name   text        NOT NULL,
  payload    jsonb,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS refresh_token_hash text;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS parent_incident_id uuid REFERENCES incidents(id);
`;

const SEED_ESCALATION_RULES_SQL = `
INSERT INTO escalation_rules (id, severity, category, min_escalation_level, target_level, immediate, active)
VALUES
  ('f8f1bd35-5a1d-4c91-bc5a-fdab1665a5d0', 'critical', NULL, 0, 1, true,  true),
  ('4f4d684b-c59c-4eac-8b4a-516a931c0728', NULL,       NULL, 1, 2, false, true),
  ('1735cfdf-e224-4f5e-bf33-3d4f2754b51c', NULL,       NULL, 2, 3, false, true)
ON CONFLICT (id) DO NOTHING;
`;

export async function ensureSchema() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize database schema.');
  }

  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(BASE_SCHEMA_SQL);
    await client.query(MIGRATION_SQL);
    await client.query(SEED_ESCALATION_RULES_SQL);
    await client.query('COMMIT');
    logger.info('db.schema.initialized');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('db.schema.failed', { error: error.message });
    throw error;
  } finally {
    await client.end();
  }
}
