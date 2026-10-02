import type { LocalHandler } from '@logicpath/api-client';
import type { ContentBundle } from '@logicpath/content-schema';
import { withVisuals } from '@logicpath/content-tools/browser';
import type { content, ParamsOf } from '@logicpath/contracts';
import type { LocalDb, VersionRow } from '../db';
import { audit, iso, me, notFound, paginate, uuid } from '../util';

/** Browsers have little storage: keep the newest versions (and always the live one). */
const KEEP_VERSIONS = 8;

export function liveVersion(db: LocalDb): VersionRow {
  const row = db.t.versions.find((v) => v.id === db.t.currentVersionId);
  if (!row) throw notFound('Published content');
  return row;
}

export function publishVersion(
  db: LocalDb,
  bundle: ContentBundle,
  meta: { note: string; submissionId: string | null; publishedBy: string | null },
  now: Date,
): VersionRow {
  const number = Math.max(0, ...db.t.versions.map((v) => v.number)) + 1;
  const row: VersionRow = { id: uuid(), number, bundle, publishedAt: iso(now), ...meta };
  db.t.versions.push(row);
  db.t.currentVersionId = row.id;
  db.t.versions = db.t.versions.filter(
    (v, i, all) => v.id === row.id || i >= all.length - KEEP_VERSIONS,
  );
  db.touch();
  return row;
}

/** First run: the bundled curriculum becomes version 1, like the content service's YAML seed. */
export function seedContent(db: LocalDb, seed: ContentBundle, now: Date) {
  if (db.t.versions.length > 0) return;
  publishVersion(
    db,
    withVisuals(seed),
    {
      note: 'Initial curriculum from the content repository',
      submissionId: null,
      publishedBy: null,
    },
    now,
  );
}

const toVersion = (row: VersionRow, currentId: string | null): content.Version => ({
  id: row.id,
  number: row.number,
  checksum: row.bundle.version,
  note: row.note,
  submissionId: row.submissionId,
  publishedBy: row.publishedBy,
  publishedAt: row.publishedAt,
  current: row.id === currentId,
});

export function contentHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'content.bundle': () => liveVersion(db).bundle,
    'content.manifest': () => {
      const live = liveVersion(db);
      return {
        versionId: live.id,
        number: live.number,
        checksum: live.bundle.version,
        publishedAt: live.publishedAt,
        concepts: live.bundle.concepts.filter((c) => c.published).length,
        items: Object.keys(live.bundle.items).length,
      };
    },
    'admin.content.versions': (_ctx, { query }) => {
      const rows = [...db.t.versions].sort((a, b) => b.number - a.number);
      const page = paginate(rows, query);
      return {
        items: page.items.map((r) => toVersion(r, db.t.currentVersionId)),
        nextCursor: page.nextCursor,
      };
    },
    'admin.content.rollback': (ctx, { params, body }) => {
      const admin = me(ctx);
      const { id } = params as ParamsOf<'admin.content.rollback'>;
      const source = db.t.versions.find((v) => v.id === id);
      if (!source) throw notFound('Version');
      const row = publishVersion(
        db,
        source.bundle,
        {
          note:
            (body as { note?: string } | undefined)?.note ?? `Restored version ${source.number}`,
          submissionId: null,
          publishedBy: admin.id,
        },
        ctx.now,
      );
      audit(
        db,
        admin,
        'content.rollback',
        'content-version',
        row.id,
        { restored: source.number, as: row.number },
        ctx.now,
      );
      return toVersion(row, row.id);
    },
  };
}
