import {
  LOCALES,
  type ContentBundle,
  type Lesson,
  type LessonVisual,
} from '@logicpath/content-schema';
import { caption, run } from '@logicpath/visualizer/engine';
import type { LoadedContent } from './load';

/**
 * Compiles checked content into one bundle. The version is a hash of the content, so the same
 * content always produces the same version and a new version means something changed.
 * Browser-safe: no Node APIs, so the studio preview and the local demo backend can use it.
 */
export function buildBundle(content: LoadedContent): ContentBundle {
  const body: Omit<ContentBundle, 'version'> = {
    stages: [...content.graph.stages].sort((a, b) => a.id - b.id),
    concepts: content.graph.concepts.map((c) => ({ ...c, published: content.lessons.has(c.id) })),
    misconceptions: Object.fromEntries(content.misconceptions.map((m) => [m.id, m])),
    lessons: Object.fromEntries([...content.lessons].map(([id, { lesson }]) => [id, lesson])),
    items: Object.fromEntries(content.items.map(({ item }) => [item.id, item])),
  };
  return { version: contentHash(body), ...body };
}

/** 48-bit hash as 12 hex characters (two 32-bit FNV-1a lanes with different seeds). */
export function contentHash(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
    b = (b ^ (b >>> 15)) >>> 0;
  }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).slice(0, 12);
}

/** Frames and narration for a lesson's "see" beat, author captions taking priority. */
export function lessonVisual(lesson: Lesson): LessonVisual {
  const frames = run(lesson.see.code);
  const captions = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      frames.map(
        (frame) => lesson.see.captions[String(frame.index)]?.[locale] ?? caption(frame, locale),
      ),
    ]),
  ) as LessonVisual['captions'];
  return { frames: JSON.parse(JSON.stringify(frames)) as unknown[], captions };
}

/** Adds precomputed visuals for every lesson (for clients without the interpreter). */
export function withVisuals(bundle: ContentBundle): ContentBundle {
  return {
    ...bundle,
    visuals: Object.fromEntries(
      Object.entries(bundle.lessons).map(([id, lesson]) => [id, lessonVisual(lesson)]),
    ),
  };
}
