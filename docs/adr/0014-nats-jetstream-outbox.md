# ADR-0014: NATS JetStream for events, with outbox and idempotent consumers

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
Services react to each other's changes (an answer updates mastery, reviews, XP, analytics) and must never lose or double-apply events.

## Decision
- One JetStream stream per event domain (`<PREFIX>_PRACTICE`, ...), subjects `<prefix>.<domain>.<event>`; 14-day retention for replay.
- Producers write events to a `kit_outbox` table in the same transaction as their state change; a relay publishes with the event id as the de-duplication id.
- Consumers are durable pull consumers; each handler runs inside a transaction guarded by a `kit_inbox` row, so redelivery is harmless. Failures retry with backoff; poison messages are terminated and logged.
- Large payloads use claim-check: the event names a version, the consumer fetches it.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Kafka | Huge throughput, long retention | JVM operations, overkill at our scale |
| RabbitMQ | Rich routing | More operational weight than NATS |
| Postgres LISTEN/NOTIFY only | No new infra | No durable cross-service replay |
