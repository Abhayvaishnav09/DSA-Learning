import { describe, expect, it } from 'vitest';
import { DOMAINS, EVENTS, domainOf, makeEvent, parseEvent } from './events';

describe('event catalog', () => {
  it('maps every event type to a known stream domain', () => {
    for (const type of Object.keys(EVENTS) as (keyof typeof EVENTS)[]) {
      expect(DOMAINS).toContain(domainOf(type));
    }
  });

  it('builds envelopes that parse back, and validates payloads both ways', () => {
    const event = makeEvent(
      'progress.lesson.completed',
      {
        userId: crypto.randomUUID(),
        conceptId: 'loops.counter',
        xp: [{ amount: 20, reason: 'lesson' }],
        at: new Date().toISOString(),
      },
      'progress',
    );
    expect(event).toMatchObject({
      type: 'progress.lesson.completed',
      version: 1,
      source: 'progress',
    });
    expect(parseEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
    expect(() =>
      makeEvent('progress.lesson.completed', { userId: 'nope' } as never, 'x'),
    ).toThrow();
    expect(() => parseEvent({ ...event, type: 'made.up.event' })).toThrow(/unknown event type/);
    expect(() => parseEvent({ ...event, data: { userId: 'not-a-uuid' } })).toThrow();
  });
});
