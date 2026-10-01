# 05. Data

## 1. Stores

| Store | Holds | Consistency |
|---|---|---|
| PostgreSQL | Users, attempts, mastery, review cards, progress, outbox, content index | Strong (source of truth) |
| Redis | Cache, rate limits, BullMQ queues, sessions cache | Rebuildable |
| Object storage | Content bundles, media, data exports | Immutable objects |
| ClickHouse | Analytics events, item stats, experiment analysis | Append-only, derived |

## 2. Identifiers

- Public IDs are prefixed **ULIDs**: `usr_01J...`, `att_01J...`. Sortable by time, unguessable, safe in URLs.
- Content IDs are human slugs stable across versions: `concept:loops.counter`, `item:loops.counter.trace-1`.

## 3. Schema (core tables)

Each module owns a Postgres schema. Columns trimmed to the important ones.

```sql
-- identity
CREATE TABLE identity.users (
  id            text PRIMARY KEY,                -- usr_ULID
  email         citext UNIQUE,
  display_name  text,
  locale        text NOT NULL DEFAULT 'en',
  time_zone     text NOT NULL DEFAULT 'Asia/Kolkata',
  role          text NOT NULL DEFAULT 'learner', -- learner | author | admin
  status        text NOT NULL DEFAULT 'active',  -- active | pending_deletion
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.oauth_accounts (user_id text REFERENCES identity.users, provider text, subject text,
  PRIMARY KEY (provider, subject));
CREATE TABLE identity.sessions (id text PRIMARY KEY, user_id text NOT NULL, created_at timestamptz,
  expires_at timestamptz, ip inet, user_agent text, revoked_at timestamptz);

-- content (index of what is published; bodies live in bundles)
CREATE TABLE content.versions (id text PRIMARY KEY, git_sha text, bundle_url text,
  status text, published_at timestamptz);              -- one row status='active'
CREATE TABLE content.concepts (version_id text, id text, stage int, prerequisites text[],
  PRIMARY KEY (version_id, id));
CREATE TABLE content.items (version_id text, id text, concept_id text, type text, difficulty int,
  answer_key jsonb,                                    -- server-side grading data, never sent to clients
  PRIMARY KEY (version_id, id));

-- practice (largest table; partitioned)
CREATE TABLE practice.attempts (
  id               text NOT NULL,
  user_id          text NOT NULL,
  item_id          text NOT NULL,
  concept_id       text NOT NULL,
  content_version  text NOT NULL,
  answer           jsonb NOT NULL,
  correct          boolean NOT NULL,
  misconception_id text,
  hint_level       smallint NOT NULL DEFAULT 0,
  duration_ms      int,
  source           text NOT NULL,          -- lesson | review | drill | mock
  idempotency_key  text NOT NULL,
  created_at       timestamptz NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);         -- monthly partitions via pg_partman
CREATE UNIQUE INDEX ON practice.attempts (user_id, idempotency_key, created_at);
CREATE INDEX ON practice.attempts (user_id, created_at DESC);
CREATE INDEX ON practice.attempts (item_id, created_at DESC);

-- learning
CREATE TABLE learning.concept_mastery (
  user_id      text,
  concept_id   text,
  p_known      real NOT NULL,
  status       text NOT NULL,              -- locked | available | learning | mastered
  recall_ok_at timestamptz,                -- delayed recall passed
  updated_at   timestamptz NOT NULL,
  PRIMARY KEY (user_id, concept_id)
);

-- review (FSRS)
CREATE TABLE review.cards (
  user_id     text,
  item_id     text,
  stability   real, difficulty real,
  due_at      timestamptz NOT NULL,
  last_review timestamptz, reps int, lapses int,
  state       text,                        -- new | learning | review | relearning
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX ON review.cards (user_id, due_at);

-- progress
CREATE TABLE progress.streaks (user_id text PRIMARY KEY, current int, longest int,
  last_active_local_date date, freezes_left int);
CREATE TABLE progress.daily_activity (user_id text, local_date date, minutes int, attempts int,
  concepts_mastered int, PRIMARY KEY (user_id, local_date));

-- shared infra
CREATE TABLE infra.outbox (id bigserial PRIMARY KEY, event_id text UNIQUE, type text, payload jsonb,
  created_at timestamptz DEFAULT now(), published_at timestamptz);
CREATE INDEX ON infra.outbox (id) WHERE published_at IS NULL;
CREATE TABLE infra.idempotency (key text, user_id text, response jsonb, created_at timestamptz,
  PRIMARY KEY (user_id, key));
CREATE TABLE infra.processed_events (consumer text, event_id text, PRIMARY KEY (consumer, event_id));

-- ai-gateway (R3)
CREATE TABLE ai.interactions (id text PRIMARY KEY, user_id text, feature text, model text,
  input_tokens int, output_tokens int, cache_read_tokens int, cost_micros bigint,
  safety_flag text, rating smallint, created_at timestamptz);
```

## 4. Access patterns and indexes

| Query | Served by |
|---|---|
| Map for a user (all concepts + status) | `concept_mastery` PK scan by `user_id` (≈150 rows); cached in Redis |
| Due reviews | `review.cards (user_id, due_at)` with `due_at <= now() LIMIT cap` |
| Recent attempts for a user | `attempts (user_id, created_at DESC)` on recent partitions only |
| Item difficulty stats | ClickHouse, never Postgres |
| Idempotent replay | Unique `(user_id, idempotency_key, created_at)` |

## 5. Migrations

- Drizzle-generated SQL migrations, reviewed like code.
- **Expand → migrate → contract** for every breaking change: add new column, dual-write, backfill, switch reads, drop old in a later release. No downtime migrations.
- Migrations run as a separate pre-deploy job, never at app boot.
- `CREATE INDEX CONCURRENTLY` for large tables; lock timeout set in every migration.

## 6. Analytics pipeline

```
web (client events) ─┐
api (domain events) ─┼─► ingest endpoint / outbox ─► queue ─► ClickHouse (raw_events)
                     │                                          └─► materialized views:
                                                                     item_stats_daily, funnel_daily,
                                                                     retention_cohorts, experiment_results
```

- Event taxonomy documented in `packages/contracts/analytics` (name, properties, owner). Unknown events rejected.
- Product dashboards (Metabase or Grafana on ClickHouse) as code.
- No PII in analytics: `user_id` only (pseudonymous), no email, no IP after geo lookup.

## 7. Retention and deletion

| Data | Retention |
|---|---|
| Attempts | Life of account; partitions older than 24 months move to cold storage (Parquet in object storage) |
| Sessions | 90 days after expiry |
| AI interaction text (R3) | 30 days (for safety review and evals), then only metadata |
| Logs | 30 days hot, 1 year archived (no PII in logs) |
| Deleted accounts | Hard delete after 30-day grace; analytics rows keep only a random, unlinkable id |

## 8. Backup and recovery

- Point-in-time recovery enabled (7 to 35 days); daily snapshots copied to a second region.
- **RPO ≤ 5 min, RTO ≤ 1 h** for Postgres.
- Monthly restore drill into a scratch environment, verified by an automated check. A backup that hasn't been restored is not a backup.
