import type { LocalHandler } from '@logicpath/api-client/local';
import type { ParamsOf, platform } from '@logicpath/contracts';
import { addDays } from '@logicpath/gamification-rules';
import type { ApiKeyRow, LocalDb } from '../db';
import { istDate } from '../demo';
import {
  audit,
  conflict,
  forbidden,
  iso,
  me,
  notFound,
  paginate,
  randomToken,
  sha256,
  uuid,
} from '../util';

const ADULT_AGE = 18;
const MAX_ACTIVE_KEYS = 5;
const QUOTAS = { free: 1_000, partner: 50_000 } as const;

export function developerHandlers(db: LocalDb): Record<string, LocalHandler> {
  const view = (row: ApiKeyRow, now: Date): platform.ApiKey => {
    const { secretHash: _s, usage, ...key } = row;
    return { ...key, usageToday: usage[istDate(now)] ?? 0 };
  };
  const mine = (userId: string, id: string) => {
    const row = db.t.apiKeys.find((k) => k.id === id && k.ownerId === userId);
    if (!row) throw notFound('API key');
    return row;
  };

  return {
    'developer.keys.list': (ctx) => ({
      items: db.t.apiKeys
        .filter((k) => k.ownerId === me(ctx).id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((k) => view(k, ctx.now)),
    }),

    'developer.keys.create': async (ctx, { body }) => {
      const user = me(ctx);
      const owner = db.t.users[user.id]!;
      // The API terms are a contract: only adults can accept them.
      if (ctx.now.getUTCFullYear() - owner.birthYear < ADULT_AGE) {
        throw forbidden('API keys are for people aged 18 or over');
      }
      if (
        db.t.apiKeys.filter((k) => k.ownerId === user.id && !k.revokedAt).length >= MAX_ACTIVE_KEYS
      ) {
        throw conflict(`You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
      }
      const input = body as platform.CreateApiKey;
      const secret = randomToken('lp_live_');
      const row: ApiKeyRow = {
        id: uuid(),
        name: input.name,
        prefix: secret.slice(0, 16),
        scopes: input.scopes,
        plan: 'free',
        dailyQuota: QUOTAS.free,
        ownerId: user.id,
        createdAt: iso(ctx.now),
        lastUsedAt: null,
        revokedAt: null,
        secretHash: await sha256(secret),
        usage: {},
      };
      db.t.apiKeys.push(row);
      audit(db, user, 'apikey.created', 'api_key', row.id, { name: row.name }, ctx.now);
      db.touch();
      return { ...view(row, ctx.now), secret };
    },

    'developer.keys.revoke': (ctx, { params }) => {
      const user = me(ctx);
      const row = mine(user.id, (params as ParamsOf<'developer.keys.revoke'>).id);
      row.revokedAt ??= iso(ctx.now);
      audit(db, user, 'apikey.revoked', 'api_key', row.id, {}, ctx.now);
      db.touch();
      return { ok: true };
    },

    'developer.keys.usage': (ctx, { params }) => {
      const row = mine(me(ctx).id, (params as ParamsOf<'developer.keys.usage'>).id);
      const today = istDate(ctx.now);
      return {
        days: Array.from({ length: 14 }, (_, i) => {
          const date = addDays(today, i - 13);
          return { date, requests: row.usage[date] ?? 0 };
        }),
      };
    },

    'admin.apiKeys.list': (ctx, { query }) => {
      const rows = [...db.t.apiKeys].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(rows, query);
      return { items: page.items.map((k) => view(k, ctx.now)), nextCursor: page.nextCursor };
    },

    'admin.apiKeys.update': (ctx, { params, body }) => {
      const { id } = params as ParamsOf<'admin.apiKeys.update'>;
      const row = db.t.apiKeys.find((k) => k.id === id);
      if (!row) throw notFound('API key');
      const change = body as platform.AdminApiKeyUpdate;
      if (change.plan) {
        row.plan = change.plan;
        // A plan change resets to that plan's quota unless the admin sets one too.
        row.dailyQuota = change.dailyQuota ?? QUOTAS[change.plan];
      } else if (change.dailyQuota !== undefined) row.dailyQuota = change.dailyQuota;
      audit(db, me(ctx), 'apikey.updated', 'api_key', id, change, ctx.now);
      db.touch();
      return view(row, ctx.now);
    },

    'admin.apiKeys.revoke': (ctx, { params }) => {
      const { id } = params as ParamsOf<'admin.apiKeys.revoke'>;
      const row = db.t.apiKeys.find((k) => k.id === id);
      if (!row) throw notFound('API key');
      row.revokedAt ??= iso(ctx.now);
      audit(db, me(ctx), 'apikey.revoked', 'api_key', id, { by: 'admin' }, ctx.now);
      db.touch();
      return { ok: true };
    },
  };
}
