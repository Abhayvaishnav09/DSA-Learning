import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { lessonMachine, type LessonInput } from './lessonMachine';

const start = (input: LessonInput) => createActor(lessonMachine, { input }).start();

describe('lessonMachine', () => {
  it('walks story → see → predict → every practice item → recap', () => {
    const actor = start({ practiceCount: 2 });
    const visited = [actor.getSnapshot().value];
    for (const type of ['NEXT', 'NEXT', 'NEXT'] as const) {
      actor.send({ type });
      visited.push(actor.getSnapshot().value);
    }
    expect(visited).toEqual(['story', 'see', 'predict', 'practice']);
    actor.send({ type: 'ITEM_DONE' });
    expect(actor.getSnapshot().context.practiceIndex).toBe(1);
    actor.send({ type: 'ITEM_DONE' });
    expect(actor.getSnapshot().value).toBe('recap');
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('can go back from see and predict, but not out of practice', () => {
    const actor = start({ practiceCount: 1 });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('story');
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('practice');
  });

  it('resumes where the learner left off', () => {
    const actor = start({ practiceCount: 5, resume: { beat: 'practice', practiceIndex: 3 } });
    expect(actor.getSnapshot().value).toBe('practice');
    expect(actor.getSnapshot().context.practiceIndex).toBe(3);
  });

  it('starts over after a finished lesson and clamps a stale position', () => {
    expect(
      start({ practiceCount: 2, resume: { beat: 'recap', practiceIndex: 0 } }).getSnapshot().value,
    ).toBe('story');
    const stale = start({ practiceCount: 2, resume: { beat: 'practice', practiceIndex: 9 } });
    expect(stale.getSnapshot().context.practiceIndex).toBe(1);
  });
});
