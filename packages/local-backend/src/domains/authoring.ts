import type { LocalHandler, LocalUser } from '@logicpath/api-client';
import { decide, type DraftAction } from '@logicpath/authoring-workflow';
import { applyToBundle, validateChanges, withVisuals } from '@logicpath/content-tools/browser';
import type { authoring, content } from '@logicpath/contracts';
import type { DraftRow, LocalDb } from '../db';
import {
  audit,
  badRequest,
  conflict,
  forbidden,
  invalid,
  iso,
  me,
  notFound,
  paginate,
  uuid,
} from '../util';
import { liveVersion, publishVersion } from './content';

type Action = authoring.Activity['action'];

export function authoringHandlers(db: LocalDb): Record<string, LocalHandler> {
  const record = (
    draftId: string,
    actor: LocalUser | null,
    action: Action,
    comment: string | null,
    now: Date,
  ) => {
    db.t.activity.push({
      id: uuid(),
      draftId,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? 'LogicPath',
      action,
      comment,
      at: iso(now),
    });
  };

  const full = (row: DraftRow): authoring.Draft => ({
    ...row,
    changeCount: row.changes.length,
    activity: db.t.activity
      .filter((a) => a.draftId === row.id)
      .map(({ draftId: _draftId, ...a }) => a),
  });

  const summary = (row: DraftRow): authoring.DraftSummary => ({
    id: row.id,
    title: row.title,
    status: row.status,
    authorId: row.authorId,
    authorName: row.authorName,
    changeCount: row.changes.length,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    publishedVersion: row.publishedVersion,
  });

  const load = (params: unknown): DraftRow => {
    const row = db.t.drafts[(params as { id: string }).id];
    if (!row) throw notFound('Draft');
    return row;
  };

  const allow = (action: DraftAction, row: DraftRow, actor: LocalUser | null) => {
    const decision = decide(action, row, actor);
    if (!decision.ok)
      throw decision.reason === 'forbidden'
        ? forbidden(decision.message)
        : conflict(decision.message);
    return decision.next;
  };

  const list = (rows: DraftRow[], query: Record<string, unknown>) => {
    const status = query.status as DraftRow['status'] | undefined;
    const filtered = rows
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const page = paginate(filtered, query);
    return { items: page.items.map(summary), nextCursor: page.nextCursor };
  };

  /** The publish saga, run in one step: apply, check everything, publish or send back. */
  const publish = (row: DraftRow, reviewer: LocalUser, now: Date) => {
    const live = liveVersion(db);
    const errors = validateChanges(live.bundle, row.changes).filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      row.status = allow('publish_failed', row, null);
      row.issues = errors;
      record(row.id, null, 'publish_failed', `Publishing failed: ${errors[0]!.message}`, now);
      return;
    }
    const version = publishVersion(
      db,
      withVisuals(applyToBundle(live.bundle, row.changes)),
      { note: row.title, submissionId: row.id, publishedBy: reviewer.id },
      now,
    );
    row.status = allow('publish_succeeded', row, null);
    row.publishedVersion = version.number;
    row.issues = [];
    record(row.id, null, 'published', `Live as version ${version.number}`, now);
  };

  const ownOrAdmin = (row: DraftRow, user: LocalUser) => {
    if (user.role !== 'admin' && row.authorId !== user.id) throw notFound('Draft');
  };

  return {
    'studio.drafts.list': (ctx, { query }) =>
      list(
        Object.values(db.t.drafts).filter((d) => d.authorId === me(ctx).id),
        query,
      ),

    'studio.drafts.create': (ctx, { body }) => {
      const user = me(ctx);
      const input = body as { title: string; changes: content.ContentChange[] };
      const row: DraftRow = {
        id: uuid(),
        title: input.title,
        status: 'draft',
        authorId: user.id,
        authorName: user.name,
        changes: input.changes,
        issues: [],
        baseVersion: null,
        submittedAt: null,
        publishedVersion: null,
        createdAt: iso(ctx.now),
        updatedAt: iso(ctx.now),
      };
      db.t.drafts[row.id] = row;
      record(row.id, user, 'created', null, ctx.now);
      db.touch();
      return full(row);
    },

    'studio.drafts.get': (ctx, { params }) => {
      const row = load(params);
      ownOrAdmin(row, me(ctx));
      return full(row);
    },

    'studio.drafts.update': (ctx, { params, body }) => {
      const user = me(ctx);
      const row = load(params);
      allow('edit', row, user);
      Object.assign(row, body as Partial<DraftRow>, { updatedAt: iso(ctx.now) });
      record(row.id, user, 'edited', null, ctx.now);
      db.touch();
      return full(row);
    },

    'studio.drafts.delete': (ctx, { params }) => {
      const row = load(params);
      allow('delete', row, me(ctx));
      delete db.t.drafts[row.id];
      db.t.activity = db.t.activity.filter((a) => a.draftId !== row.id);
      db.touch();
      return { ok: true };
    },

    'studio.drafts.validate': (ctx, { params }) => {
      const row = load(params);
      ownOrAdmin(row, me(ctx));
      const live = liveVersion(db);
      row.issues = validateChanges(live.bundle, row.changes);
      row.baseVersion = live.bundle.version;
      db.touch();
      return {
        ok: !row.issues.some((i) => i.severity === 'error'),
        baseVersion: live.bundle.version,
        issues: row.issues,
      };
    },

    'studio.drafts.submit': (ctx, { params }) => {
      const user = me(ctx);
      const row = load(params);
      const next = allow('submit', row, user);
      if (row.changes.length === 0) throw badRequest('The draft has no changes yet');
      const live = liveVersion(db);
      const issues = validateChanges(live.bundle, row.changes);
      const blocking = issues.filter((i) => i.severity === 'error');
      if (blocking.length > 0) {
        throw invalid(
          'Fix the errors before submitting',
          blocking.map((i) => ({ path: i.file, message: i.message })),
        );
      }
      Object.assign(row, {
        status: next,
        issues,
        baseVersion: live.bundle.version,
        submittedAt: iso(ctx.now),
        updatedAt: iso(ctx.now),
      });
      record(row.id, user, 'submitted', null, ctx.now);
      db.touch();
      return full(row);
    },

    'studio.drafts.withdraw': (ctx, { params }) => {
      const user = me(ctx);
      const row = load(params);
      row.status = allow('withdraw', row, user);
      row.updatedAt = iso(ctx.now);
      record(row.id, user, 'withdrawn', null, ctx.now);
      db.touch();
      return full(row);
    },

    'admin.review.list': (_ctx, { query }) =>
      list(
        Object.values(db.t.drafts).filter((d) => (query.status ? true : d.status === 'in_review')),
        query,
      ),

    'admin.review.get': (_ctx, { params }) => full(load(params)),

    'admin.review.approve': (ctx, { params, body }) => {
      const admin = me(ctx);
      const row = load(params);
      row.status = allow('approve', row, admin);
      row.updatedAt = iso(ctx.now);
      record(
        row.id,
        admin,
        'approved',
        (body as { comment?: string } | undefined)?.comment ?? null,
        ctx.now,
      );
      audit(db, admin, 'submission.approved', 'submission', row.id, { title: row.title }, ctx.now);
      publish(row, admin, ctx.now);
      db.touch();
      return full(row);
    },

    'admin.review.requestChanges': (ctx, { params, body }) => {
      const admin = me(ctx);
      const row = load(params);
      row.status = allow('request_changes', row, admin);
      row.updatedAt = iso(ctx.now);
      record(row.id, admin, 'changes_requested', (body as { comment: string }).comment, ctx.now);
      audit(
        db,
        admin,
        'submission.changes_requested',
        'submission',
        row.id,
        { title: row.title },
        ctx.now,
      );
      db.touch();
      return full(row);
    },
  };
}
