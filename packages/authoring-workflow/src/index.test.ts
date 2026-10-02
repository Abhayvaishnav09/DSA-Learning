import { describe, expect, it } from 'vitest';
import { availableActions, decide, type Actor, type DraftRef } from './index';

const writer: Actor = { id: 'w', role: 'writer' };
const other: Actor = { id: 'w2', role: 'writer' };
const admin: Actor = { id: 'a', role: 'admin' };
const student: Actor = { id: 's', role: 'student' };
const draft = (status: DraftRef['status'], authorId = 'w'): DraftRef => ({ authorId, status });

describe('authoring workflow', () => {
  it('walks the happy path', () => {
    expect(decide('submit', draft('draft'), writer)).toEqual({ ok: true, next: 'in_review' });
    expect(decide('approve', draft('in_review'), admin)).toEqual({ ok: true, next: 'approved' });
    expect(decide('publish_succeeded', draft('approved'), null)).toEqual({
      ok: true,
      next: 'published',
    });
  });

  it('sends work back and lets the writer resubmit', () => {
    expect(decide('request_changes', draft('in_review'), admin)).toMatchObject({
      next: 'changes_requested',
    });
    expect(decide('publish_failed', draft('approved'), null)).toMatchObject({
      next: 'changes_requested',
    });
    expect(decide('edit', draft('changes_requested'), writer).ok).toBe(true);
    expect(decide('submit', draft('changes_requested'), writer).ok).toBe(true);
  });

  it('enforces who may act', () => {
    expect(decide('edit', draft('draft'), student)).toMatchObject({ reason: 'forbidden' });
    expect(decide('edit', draft('draft'), other)).toMatchObject({ reason: 'forbidden' });
    expect(decide('edit', draft('draft'), admin).ok).toBe(true);
    expect(decide('approve', draft('in_review'), writer)).toMatchObject({ reason: 'forbidden' });
    expect(decide('approve', draft('in_review', 'a'), admin)).toMatchObject({
      message: 'you cannot review your own work',
    });
    expect(decide('publish_succeeded', draft('approved'), admin)).toMatchObject({
      reason: 'forbidden',
    });
  });

  it('rejects actions in the wrong state', () => {
    expect(decide('edit', draft('in_review'), writer)).toMatchObject({ reason: 'invalid_state' });
    expect(decide('approve', draft('draft'), admin)).toMatchObject({
      message: 'cannot approve a draft that is draft',
    });
    expect(decide('delete', draft('published'), writer).ok).toBe(false);
  });

  it('lists what the UI can offer', () => {
    expect(availableActions(draft('draft'), writer)).toEqual(['edit', 'delete', 'submit']);
    expect(availableActions(draft('in_review'), writer)).toEqual(['withdraw']);
    expect(availableActions(draft('in_review'), admin)).toEqual([
      'withdraw',
      'approve',
      'request_changes',
    ]);
  });
});
