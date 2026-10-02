#!/bin/sh
# Database per service (ADR-0011): one database and one login per service, nothing shared.
set -e
for svc in identity profile consent content authoring practice progress review gamification notification analytics audit; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE $svc LOGIN PASSWORD '$svc';
CREATE DATABASE $svc OWNER $svc;
SQL
done
