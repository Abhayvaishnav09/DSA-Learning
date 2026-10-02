import { ENDPOINTS, type Endpoint } from '@logicpath/contracts';
import { describe, expect, it } from 'vitest';
import { ownerOf } from './routes';

describe('gateway routes', () => {
  it('sends every endpoint in the contract to the service that owns it', () => {
    for (const [id, endpoint] of Object.entries(ENDPOINTS as Record<string, Endpoint>)) {
      if (endpoint.service === 'gateway') continue;
      expect(ownerOf(endpoint.path), id).toBe(endpoint.service);
    }
  });

  it('prefers the longest prefix on a segment boundary', () => {
    expect(ownerOf('/v1/studio/media/123')).toBe('media');
    expect(ownerOf('/v1/studio/drafts')).toBe('authoring');
    expect(ownerOf('/v1/studio-x')).toBeNull();
    expect(ownerOf('/v1/unknown')).toBeNull();
  });
});
