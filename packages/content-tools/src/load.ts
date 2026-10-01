import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Graph, Item, Lesson, Misconceptions, type Misconception } from '@logicpath/content-schema';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export interface Issue {
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface LoadedItem {
  file: string;
  dirConcept: string;
  item: Item;
}

export interface LoadedContent {
  root: string;
  graph: Graph;
  misconceptions: Misconception[];
  lessons: Map<string, { file: string; lesson: Lesson }>;
  items: LoadedItem[];
}

/**
 * Reads the content folder (docs/06-content-system.md §1):
 *   graph.yaml, misconceptions.yaml, concepts/<id>/lesson.yaml, concepts/<id>/items/*.yaml
 * Collects every problem instead of stopping at the first one, so authors fix them in one pass.
 */
export function loadContent(root: string): { content: LoadedContent | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const rel = (path: string) => relative(root, path);

  const read = <T extends z.ZodType>(path: string, schema: T): z.infer<T> | null => {
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(path, 'utf8'));
    } catch (error) {
      issues.push({
        file: rel(path),
        message: `cannot read YAML: ${(error as Error).message}`,
        severity: 'error',
      });
      return null;
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      issues.push({ file: rel(path), message: z.prettifyError(result.error), severity: 'error' });
      return null;
    }
    return result.data;
  };

  const graph = read(join(root, 'graph.yaml'), Graph);
  const misconceptions = read(join(root, 'misconceptions.yaml'), Misconceptions);

  const lessons = new Map<string, { file: string; lesson: Lesson }>();
  const items: LoadedItem[] = [];
  const conceptsDir = join(root, 'concepts');
  const conceptDirs = existsSync(conceptsDir)
    ? readdirSync(conceptsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  for (const conceptId of conceptDirs) {
    const dir = join(conceptsDir, conceptId);
    const lessonPath = join(dir, 'lesson.yaml');
    if (!existsSync(lessonPath)) {
      issues.push({ file: rel(dir), message: 'missing lesson.yaml', severity: 'error' });
    } else {
      const lesson = read(lessonPath, Lesson);
      if (lesson) lessons.set(conceptId, { file: rel(lessonPath), lesson });
    }
    const itemsDir = join(dir, 'items');
    if (!existsSync(itemsDir)) continue;
    for (const name of readdirSync(itemsDir)
      .filter((f) => f.endsWith('.yaml'))
      .sort()) {
      const path = join(itemsDir, name);
      const item = read(path, Item);
      if (item) items.push({ file: rel(path), dirConcept: conceptId, item });
    }
  }

  if (!graph || !misconceptions) return { content: null, issues };
  return {
    content: { root, graph, misconceptions: misconceptions.misconceptions, lessons, items },
    issues,
  };
}
