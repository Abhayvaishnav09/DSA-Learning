/** Browser-safe entry: everything except the file-system loader and the CLI. */
export { buildBundle, contentHash, lessonVisual, withVisuals } from './build';
export {
  applyChanges,
  applyToBundle,
  bundleToLoaded,
  contentPath,
  validateChanges,
} from './changes';
export type { ChangeKind, ContentChange } from './changes';
export { checkContent } from './check';
export type { Issue, LoadedContent, LoadedItem } from './types';
