import { describe, expect, it } from 'vitest';
import { pickTier } from './quality';

const base = { webgl2: true, memoryGb: 8, cores: 8, saveData: false, forceLite: false };

describe('3D quality tiers', () => {
  it('gives capable devices the full scene', () => {
    expect(pickTier(base, true)).toBe('high');
  });
  it('lowers detail on small devices', () => {
    expect(pickTier({ ...base, memoryGb: 2 }, true)).toBe('low');
    expect(pickTier({ ...base, cores: 4 }, true)).toBe('low');
  });
  it('falls back to 2D without WebGL2, on data saver, with reduced motion, or on request', () => {
    expect(pickTier({ ...base, webgl2: false }, true)).toBe('lite');
    expect(pickTier({ ...base, saveData: true }, true)).toBe('lite');
    expect(pickTier(base, false)).toBe('lite');
    expect(pickTier({ ...base, forceLite: true }, true)).toBe('lite');
  });
});
