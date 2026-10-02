# ADR-0016: Flutter for the Android app

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
The owner chose Flutter for the mobile app. The web app's grading and visualizer logic is TypeScript.

## Decision
Flutter 3.47 (Dart 3.13), structured per Flutter's official architecture guide (MVVM: views, view models, repositories, services), Riverpod, go_router, dio, an API client generated from our OpenAPI. Grading, the pseudocode interpreter, shuffling and the mastery update are ported to a Dart package and verified against JSON fixtures exported from the TypeScript implementation (cross-language conformance tests), so both apps grade identically. Visualizer frames come precomputed in the content bundle. The APK is built in GitHub Actions; iOS later needs a Mac runner and an Apple developer account.

## Consequences
Two implementations of the grader; the conformance suite is what keeps them honest and runs in CI.
