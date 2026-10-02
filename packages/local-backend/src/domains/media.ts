import { fail, type LocalHandler } from '@logicpath/api-client/local';
import type { ParamsOf, platform } from '@logicpath/contracts';
import type { LocalDb, MediaRow } from '../db';
import { audit, badRequest, forbidden, iso, me, notFound, paginate, uuid } from '../util';

/**
 * The image library. The real service resizes with sharp into three widths and serves them from
 * disk or object storage. Here the browser shrinks the picture once and keeps it in the page.
 */

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;
const STORED_WIDTH = 800;
/** A one-pixel grey picture: shown when the browser cannot make a real placeholder. */
const GREY_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function shrink(
  file: File,
): Promise<{ dataUrl: string; blur: string; width: number; height: number }> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return { dataUrl: await toDataUrl(file), blur: GREY_PIXEL, width: 1, height: 1 };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, STORED_WIDTH / bitmap.width);
    const draw = async (w: number, h: number, quality: number) => {
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return toDataUrl(await canvas.convertToBlob({ type: 'image/webp', quality }));
    };
    const result = {
      dataUrl: await draw(bitmap.width * scale, bitmap.height * scale, 0.82),
      blur: await draw(16, (16 * bitmap.height) / bitmap.width, 0.3),
      width: bitmap.width,
      height: bitmap.height,
    };
    bitmap.close();
    return result;
  } catch {
    throw badRequest('That file could not be read as a picture');
  }
}

export function mediaHandlers(db: LocalDb): Record<string, LocalHandler> {
  const view = ({ dataUrl, ...asset }: MediaRow): platform.MediaAsset => ({
    ...asset,
    urls: { w320: dataUrl, w640: dataUrl, w1280: dataUrl },
  });

  return {
    'studio.media.upload': async (ctx, { body }) => {
      const user = me(ctx);
      const form = body as FormData;
      const file = form.get('file');
      if (!(file instanceof Blob)) throw badRequest('Choose a picture to upload');
      if (!TYPES.has(file.type))
        throw fail(415, 'Unsupported file', 'Use a PNG, JPEG, WebP or GIF picture', 'media-type');
      if (file.size > MAX_BYTES)
        throw fail(413, 'File too large', 'Pictures can be up to 5 MB', 'media-size');
      const alt = String(form.get('alt') ?? '').trim();
      if (alt.length < 3) throw badRequest('Describe the picture in a few words (alt text)');
      const { dataUrl, blur, width, height } = await shrink(file);
      const row: MediaRow = {
        id: uuid(),
        filename: (file).name || 'picture',
        width,
        height,
        bytes: file.size,
        alt,
        blurDataUrl: blur,
        urls: { w320: dataUrl, w640: dataUrl, w1280: dataUrl },
        uploadedBy: user.id,
        createdAt: iso(ctx.now),
        dataUrl,
      };
      db.t.media.unshift(row);
      db.t.media = db.t.media.slice(0, 40); // browser storage is small
      audit(db, user, 'media.uploaded', 'media', row.id, { filename: row.filename }, ctx.now);
      db.touch();
      return view(row);
    },

    'studio.media.list': (_ctx, { query }) => {
      const page = paginate(db.t.media, query);
      return { items: page.items.map(view), nextCursor: page.nextCursor };
    },

    'studio.media.delete': (ctx, { params }) => {
      const user = me(ctx);
      const { id } = params as ParamsOf<'studio.media.delete'>;
      const row = db.t.media.find((m) => m.id === id);
      if (!row) throw notFound('Picture');
      if (row.uploadedBy !== user.id && user.role !== 'admin') {
        throw forbidden('Only the person who uploaded a picture, or an admin, can delete it');
      }
      db.t.media = db.t.media.filter((m) => m.id !== id);
      audit(db, user, 'media.deleted', 'media', id, {}, ctx.now);
      db.touch();
      return { ok: true };
    },
  };
}
