import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { itemMachine, type ItemInput } from './itemMachine';

const start = (input: Partial<ItemInput> = {}) =>
  createActor(itemMachine, {
    input: { mode: 'practice', hintCount: 3, hasExplain: true, ...input },
  }).start();

describe('itemMachine', () => {
  it('asks "why" after a right answer, then finishes', () => {
    const actor = start();
    actor.send({ type: 'SUBMIT', correct: true });
    expect(actor.getSnapshot().value).toBe('explaining');
    actor.send({ type: 'EXPLAIN', correct: false });
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context).toMatchObject({
      firstTryCorrect: true,
      explainedCorrectly: false,
    });
  });

  it('stays on the question after a wrong answer and remembers the first try', () => {
    const actor = start({ hasExplain: false });
    actor.send({ type: 'SUBMIT', correct: false });
    expect(actor.getSnapshot().value).toBe('answering');
    actor.send({ type: 'SUBMIT', correct: true });
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context).toMatchObject({ firstTryCorrect: false, wrongCount: 1 });
  });

  it('gives hints one level at a time, up to the number authored', () => {
    const actor = start({ hintCount: 2 });
    for (let i = 0; i < 5; i++) actor.send({ type: 'HINT' });
    expect(actor.getSnapshot().context.hintLevel).toBe(2);
  });

  it('unlocks the answer only after effort', () => {
    const actor = start();
    actor.send({ type: 'SHOW_SOLUTION' });
    expect(actor.getSnapshot().value).toBe('answering');

    actor.send({ type: 'SUBMIT', correct: false });
    actor.send({ type: 'SUBMIT', correct: false });
    actor.send({ type: 'SHOW_SOLUTION' });
    expect(actor.getSnapshot().value).toBe('answering');

    actor.send({ type: 'SUBMIT', correct: false });
    actor.send({ type: 'SHOW_SOLUTION' });
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context.solutionShown).toBe(true);
  });

  it('unlocks the answer after every hint and one wrong try', () => {
    const actor = start({ hintCount: 1 });
    actor.send({ type: 'HINT' });
    actor.send({ type: 'SUBMIT', correct: false });
    actor.send({ type: 'SHOW_SOLUTION' });
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('gives a prediction exactly one try and no hints', () => {
    const actor = start({ mode: 'predict' });
    actor.send({ type: 'HINT' });
    expect(actor.getSnapshot().context.hintLevel).toBe(0);
    actor.send({ type: 'SUBMIT', correct: false });
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context.firstTryCorrect).toBe(false);
  });
});
