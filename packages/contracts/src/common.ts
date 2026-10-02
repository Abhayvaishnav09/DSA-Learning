import { z } from 'zod';

/** Shared building blocks of the public API (docs/api/README.md). */

export const Id = z.uuid();
export const IsoDateTime = z.iso.datetime({ offset: true });
export const LocalDate = z.iso.date();

export const Locale = z.enum(['en', 'hi-Latn']);
export type Locale = z.infer<typeof Locale>;

export const ROLES = ['student', 'writer', 'admin'] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

/** RFC 9457 problem details; every error response uses this shape. */
export const Problem = z
  .object({
    type: z
      .string()
      .describe('Stable error identifier, e.g. "https://logicpath.dev/problems/validation"'),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    traceId: z.string().optional(),
    errors: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .describe('Field-level problems for validation errors'),
  })
  .meta({ id: 'Problem' });
export type Problem = z.infer<typeof Problem>;

export const PageQuery = z.object({
  cursor: z.string().optional().describe('Opaque cursor from a previous page'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const Ok = z.object({ ok: z.literal(true) });
