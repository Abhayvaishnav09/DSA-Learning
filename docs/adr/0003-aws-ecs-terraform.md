# ADR-0003: AWS (Mumbai) with ECS Fargate and Terraform

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Most learners are expected in India; we want managed services and low ops overhead.

## Decision
AWS `ap-south-1` as the primary region. ECS Fargate for web/api/worker, an isolated EC2-backed ECS cluster with gVisor for the judge, Aurora PostgreSQL, ElastiCache, S3 + CloudFront. All via Terraform.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Kubernetes (EKS) | Flexible scheduling | Heavy to operate for a small team |
| Vercel + Supabase + Fly | Very fast start | Harder to isolate the judge; vendor spread |
| GCP | Comparable | Team familiarity assumed lower |

## Consequences
Slightly more setup than a PaaS; in return, the judge isolation, networking and compliance story are in our hands.

## Revisit when
Scaling stage C, or if scheduling needs exceed what ECS offers.
