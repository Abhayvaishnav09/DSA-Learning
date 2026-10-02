# ADR-0017: Three roles, an authoring workflow, and the database as the content source of truth

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
Writers create lessons; admins approve and publish; students learn. Content was YAML in git only.

## Decision
- Roles: student, writer, admin.
- The authoring service stores drafts and submissions: draft → in review → changes requested / approved → published. Validation reuses the content checker (every program runs, every answer key is checked).
- Approval triggers the publish saga: content builds a new immutable version (with precomputed visualizer frames and captions), or reports `publish.failed` with the issues. Admins can roll back to any version.
- The YAML in git is the seed: imported as version 1 on first start; an export script writes published versions back to YAML for review and backup.

## Consequences
Content changes no longer need a code deploy; quality gates are the same as before.
