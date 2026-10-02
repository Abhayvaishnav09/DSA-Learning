import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLAGS,
  bucket,
  compareVersions,
  evaluateAll,
  hash32,
  isOn,
  type FlagDef,
} from './index';

const flag = (patch: Partial<FlagDef> = {}): FlagDef => ({
  key: 'new-map',
  enabled: true,
  rolloutPercent: 100,
  roles: [],
  platforms: [],
  minAppVersion: null,
  value: { theme: 'dark' },
  ...patch,
});
const me = {
  userId: 'user-1',
  role: 'student' as const,
  platform: 'web' as const,
  appVersion: null,
};

describe('hash and buckets', () => {
  it('matches the published test vectors (the Dart port must too)', () => {
    expect(hash32('')).toBe(0x811c9dc5);
    expect(hash32('a')).toBe(0xe40c292c);
    expect(hash32('foobar')).toBe(0xbf9cf968);
  });
  it('is stable, in range and different per flag', () => {
    expect(bucket('new-map', 'user-1')).toBe(bucket('new-map', 'user-1'));
    const buckets = Array.from({ length: 200 }, (_, i) => bucket('new-map', `user-${i}`));
    expect(Math.min(...buckets)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...buckets)).toBeLessThan(100);
    expect(bucket('a', 'user-1') === bucket('b', 'user-1')).toBe(false);
  });
  it('spreads people evenly enough for a rollout', () => {
    const on = Array.from({ length: 2000 }, (_, i) => bucket('rollout', `u${i}`) < 30).filter(
      Boolean,
    );
    expect(on.length).toBeGreaterThan(500);
    expect(on.length).toBeLessThan(700);
  });
});

describe('versions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
  });
});

describe('isOn', () => {
  it('is off when disabled', () => expect(isOn(flag({ enabled: false }), me)).toBe(false));
  it('filters by role, and signed-out visitors have none', () => {
    expect(isOn(flag({ roles: ['admin'] }), me)).toBe(false);
    expect(isOn(flag({ roles: ['student', 'admin'] }), me)).toBe(true);
    expect(isOn(flag({ roles: ['admin'] }), { ...me, userId: null, role: null })).toBe(false);
  });
  it('filters by platform', () => {
    expect(isOn(flag({ platforms: ['android'] }), me)).toBe(false);
    expect(isOn(flag({ platforms: ['web'] }), me)).toBe(true);
  });
  it('needs a new enough app', () => {
    const f = flag({ minAppVersion: '1.4.0' });
    expect(isOn(f, me)).toBe(false);
    expect(isOn(f, { ...me, appVersion: '1.3.9' })).toBe(false);
    expect(isOn(f, { ...me, appVersion: '1.4.0' })).toBe(true);
  });
  it('rolls out to a share of people, and to nobody anonymous unless it is 100%', () => {
    expect(isOn(flag({ rolloutPercent: 0 }), me)).toBe(false);
    expect(isOn(flag({ rolloutPercent: 100 }), { ...me, userId: null })).toBe(true);
    expect(isOn(flag({ rolloutPercent: 50 }), { ...me, userId: null })).toBe(false);
    const half = flag({ rolloutPercent: 50 });
    expect(isOn(half, me)).toBe(bucket('new-map', 'user-1') < 50);
  });
});

describe('evaluateAll', () => {
  it('shows the value only when the flag is on', () => {
    const result = evaluateAll([flag(), flag({ key: 'off', enabled: false })], me);
    expect(result['new-map']).toEqual({ on: true, value: { theme: 'dark' } });
    expect(result['off']).toEqual({ on: false, value: null });
  });
});

describe('the flags a new installation starts with', () => {
  it('have unique, well-formed keys and sensible rollouts', () => {
    const keys = DEFAULT_FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of DEFAULT_FLAGS) {
      expect(f.key).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/);
      expect(f.description.length).toBeGreaterThan(10);
      expect(f.rolloutPercent).toBeGreaterThanOrEqual(0);
      expect(f.rolloutPercent).toBeLessThanOrEqual(100);
    }
  });

  it('hide the studio flag from students and show it to writers', () => {
    const ask = (role: 'student' | 'writer') =>
      evaluateAll(DEFAULT_FLAGS, { userId: 'u1', role, platform: 'web', appVersion: null });
    expect(ask('student')['studio.media']!.on).toBe(false);
    expect(ask('writer')['studio.media']!.on).toBe(true);
    expect(ask('student')['config.daily-goal-options']!.value).toEqual([5, 10, 20, 30]);
  });
});
