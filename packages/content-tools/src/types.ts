import type { Graph, Item, Lesson, Misconception } from '@logicpath/content-schema';

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
