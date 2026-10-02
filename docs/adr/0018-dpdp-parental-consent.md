# ADR-0018: Parental consent for learners under 18 (DPDP Rules 2025)

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
India's DPDP Rules 2025 require verifiable parental consent before processing personal data of anyone under 18 and forbid tracking or targeted advertising aimed at children. Doc 10 previously said "13+".

## Decision
Sign-up asks for birth year. Under 18: a parent email is required, the account is created `pending_consent`, the consent service emails the parent a signed link, and only approval activates the account; denial deletes it. Guest mode (progress stored only on the device) needs no account. Minors get no marketing email and no public leaderboards. Consent decisions are kept in the audit log. Stronger verification (DigiLocker) can replace email verification later.

## Consequences
Extra steps for young learners; their parents get a clear email in English or Hinglish.
