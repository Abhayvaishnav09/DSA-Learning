'use client';

import { ApiError } from '@logicpath/api-client';
import type { identity, Role } from '@logicpath/contracts';
import { create } from 'zustand';
import { API_MODE, getApiClient, onSessionExpired } from '@/shared/api/client';

/**
 * Who is signed in. `unknown` until the first check finishes, so guards don't flash the
 * sign-in page at people who are signed in.
 *
 * A non-secret hint cookie (lp_role) lets the server-side proxy redirect signed-out visitors
 * before the page loads; the API is the real check.
 */
type Status = 'unknown' | 'signedOut' | 'signedIn';

interface SessionState {
  status: Status;
  user: identity.User | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<identity.User>;
  /** After sign-up when the account is active straight away. */
  adopt: (user: identity.User) => void;
  signOut: () => Promise<void>;
}

const RANK: Record<Role, number> = { student: 1, writer: 2, admin: 3 };
export const hasRole = (user: identity.User | null, minimum: Role) =>
  !!user && RANK[user.role] >= RANK[minimum];

function setHint(role: Role | null) {
  if (typeof document === 'undefined') return;
  document.cookie = role
    ? `lp_role=${role}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
    : 'lp_role=; Path=/; Max-Age=0; SameSite=Lax';
}

export const useSession = create<SessionState>()((set) => ({
  status: 'unknown',
  user: null,

  restore: async () => {
    const api = getApiClient();
    try {
      // Web over http: the refresh cookie turns into an access token first.
      if (API_MODE === 'http') await api.call('auth.refresh', {});
      const user = await api.call('auth.me');
      setHint(user.role);
      set({ status: 'signedIn', user });
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401 && error.status !== 0) throw error;
      setHint(null);
      set({ status: 'signedOut', user: null });
    }
  },

  signIn: async (email, password) => {
    const { user } = await getApiClient().call('auth.login', { body: { email, password } });
    setHint(user.role);
    set({ status: 'signedIn', user });
    return user;
  },

  adopt: (user) => {
    setHint(user.role);
    set({ status: 'signedIn', user });
  },

  signOut: async () => {
    await getApiClient()
      .call('auth.logout', { body: {} })
      .catch(() => {});
    setHint(null);
    set({ status: 'signedOut', user: null });
  },
}));

onSessionExpired(() => {
  setHint(null);
  useSession.setState({ status: 'signedOut', user: null });
});
