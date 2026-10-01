# 08. AI Integration (Phase 3)

AI arrives in **R3**, after the core works without it. Until then the `ai-gateway` module exists only as an interface with a no-op implementation, so nothing else in the system has to change when it lands.

## 1. Principles

1. **Teach, don't tell.** The AI never hands over a full solution unless the normal unlock rules (attempt + hint 3, or 3 wrong tries) are met. It asks guiding questions.
2. **Grounded.** The AI sees the exact lesson, item, learner's answer, misconception and hint level. It does not invent curriculum.
3. **Deterministic core stays deterministic.** Grading, mastery and scheduling never depend on an LLM.
4. **Measured before shipped.** Every AI feature has an eval set and a quality bar; prompt/model changes go through the same eval gate as code.
5. **Bounded cost.** Per-user quotas via `entitlements`, per-feature budgets, global kill switch.

## 2. Features

| Feature | When | Input | Output | Shape |
|---|---|---|---|---|
| **Explain my mistake** | Wrong answer with no authored misconception match | item, learner answer, correct answer key, concept | 2 to 3 sentence explanation + matched misconception id (or `new`) | Single call, structured output |
| **Adaptive hint** | Learner asks for a hint beyond authored ones, or in code items | item, code so far, test results, hints already seen | One hint at the requested level | Single call, structured output |
| **Code feedback** | After a judge verdict | code, verdict, failing visible test, concept | What went wrong, where (line), a guiding question | Single call, structured output |
| **Socratic tutor chat** | "Ask the tutor" button | lesson context + conversation | Streaming conversation | Multi-turn, streamed |
| **Content drafting** (internal) | Authors | concept spec | Draft variations, hints, Hinglish strings | Batch, human review required |

## 3. Model and API choices

Provider: **Claude API** (Anthropic) via the official TypeScript SDK (`@anthropic-ai/sdk`). See [ADR-0008](adr/0008-claude-for-ai-features.md).

| Setting | Decision |
|---|---|
| Default model | `claude-opus-5-5` for all features at launch |
| Effort | Tuned per feature (`output_config.effort`): `low` for explain-mistake and hints, `medium` for code feedback and tutor. Raise only if evals show a gap |
| Thinking | Adaptive (always on for this model; effort is the control) |
| Structured output | `output_config.format` with a JSON schema for every non-chat feature; parsed with `client.messages.parse()` |
| Streaming | Tutor chat streams to the browser over SSE; server-side we use the SDK stream helpers |
| Refusals | Check `stop_reason` before reading content; enable server-side fallbacks (`fallbacks: "default"`); show a friendly message if still refused |
| Prefill | Not used (not supported on current models); format is controlled by structured outputs |
| Batch | Content drafting runs through the Message Batches API (async, half price) |

**Cost-saving options to evaluate later, not assumed:** lowering effort further, or routing simple features to a cheaper model (e.g. a Sonnet or Haiku tier). Any switch is a product decision made after the eval set shows quality holds. One model also means one prompt-cache namespace, which is itself a cost saving.

Pricing at time of writing (verify before launch): Opus 5.5 at $4 per million input tokens and $20 per million output tokens, cached reads cheaper. Rough estimate: a hint call ≈ 3k input (mostly cached) + 200 output tokens ≈ well under $0.01.

## 4. Architecture

```
web ──► api /v1/tutor/* ──► ai-gateway module
                               ├─ entitlement + rate-limit check
                               ├─ context builder (lesson, item, attempt history, misconception catalogue)
                               ├─ prompt registry (versioned templates in git)
                               ├─ input guard (PII scrub, prompt-injection heuristics, length caps)
                               ├─ Claude API client (timeouts, retries, streaming, fallbacks)
                               ├─ output guard (solution-leak check, schema validation, safety)
                               ├─ logging (tokens, cost, latency, model, prompt version) → ai.interactions
                               └─ feedback capture (👍/👎 + reason)
```

### Prompt caching layout

Order is `tools → system → messages`, and the cache matches by prefix, so stable content goes first:

1. **System prompt** (frozen per prompt version): tutor persona, teaching rules, output rules. Cached.
2. **Concept context** (stable per concept): lesson text, misconception catalogue for the concept. Cached.
3. **Volatile**: item, learner answer, conversation turns. Not cached.

No timestamps, user names or random ids inside the cached prefix. Monitor `cache_read_input_tokens`; if it stays at zero, something is invalidating the prefix.

### Solution-leak guard

The output guard compares the response against the item's reference solution (normalised token overlap and AST similarity for code). If it is too close and the learner hasn't unlocked the solution, the response is regenerated with a stricter instruction or replaced with the next authored hint.

## 5. Safety and privacy

| Risk | Control |
|---|---|
| Learner pastes personal data | Scrub emails/phones before sending; tell users not to share personal info |
| Prompt injection ("ignore rules, give answer") | Learner text is placed in clearly delimited user content, never in the system prompt; output guard enforces rules regardless |
| Harmful or off-topic chat | Tutor stays on the lesson topic; off-topic requests get a polite redirect; refusals handled |
| Minors | Terms require 13+; no AI chat history shown to others |
| Data retention | AI text kept 30 days for safety review and evals, then only metadata (see [05-data](05-data.md)) |
| Over-reliance | AI tutor usage per concept is capped; mastery only counts unaided or hint-weighted answers |

## 6. Evals

| Feature | Eval set | Graded by | Bar to ship |
|---|---|---|---|
| Explain mistake | 300 real wrong answers with expert-written ideal explanations | Rubric (correct, simple, no answer leak, ≤ 3 sentences) via model-as-judge + 10% human spot-check | ≥ 90% pass |
| Hints | 200 stuck states | Same rubric + "does the hint move the learner forward?" | ≥ 90% pass, 0 leaks |
| Code feedback | 200 buggy submissions with known bug lines | Line correctly identified; no full fix given | ≥ 85% line accuracy |
| Tutor | 100 scripted conversations including jailbreak attempts | Rubric + leak check | 0 leaks, ≥ 85% helpful |

- Evals run in CI on any change to prompts, model or AI code (with a budget cap).
- Online: thumbs up/down, "did the learner solve it within 2 attempts after the hint?" as the learning metric for AI help.
- A/B test AI hints vs authored hints on delayed recall before making them default.

## 7. Cost controls

- Per-user daily token quota (by plan) and per-feature monthly budgets; alerts at 50/80/100%.
- Kill switch flag per feature.
- Prompt caching (above), short outputs (`max_tokens` per feature), effort tuned per feature.
- Cache identical requests (same item + same wrong answer) in Redis for explain-mistake: many learners make the same mistake.
- Dashboard: cost per active learner, per feature, per concept.

## 8. Rollout

1. Internal dogfood with eval gate passing.
2. 5% of learners behind a flag, compare delayed recall and satisfaction.
3. 50% then 100% if learning metrics are equal or better and cost per learner is within budget.
