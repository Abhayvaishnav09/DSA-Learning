import {
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/** The image library: one row per uploaded picture, with the words that describe it. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filename: text('filename').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Size of the file that was uploaded. */
    bytes: integer('bytes').notNull(),
    alt: text('alt').notNull(),
    /** A tiny inline picture shown while the real one loads. */
    blurDataUrl: text('blur_data_url').notNull(),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assets_created').on(t.createdAt.desc(), t.id.desc()),
    index('assets_owner').on(t.uploadedBy),
  ],
);

/** The picture at each width the apps ask for (320, 640, 1280), already compressed. */
export const variants = pgTable(
  'variants',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    name: text('name', { enum: ['w320', 'w640', 'w1280'] }).notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    data: bytea('data').notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.name] })],
);
