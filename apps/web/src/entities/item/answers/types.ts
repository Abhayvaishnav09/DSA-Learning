import type { ItemOf, ItemType, Locale } from '@logicpath/content-schema';
import type { Verdict } from '@logicpath/grader';
import type { Messages } from '@/shared/i18n/messages';
import type { DraftOf } from '../draft';

export interface AnswerProps<T extends ItemType> {
  item: ItemOf<T>;
  draft: DraftOf<T>;
  onChange: (draft: DraftOf<T>) => void;
  /** Per-part results to highlight after a wrong check; null hides them. */
  parts: Verdict['parts'];
  disabled: boolean;
  locale: Locale;
  t: Messages;
}

export const partTone = (ok: boolean | undefined) =>
  ok === undefined
    ? 'border-border'
    : ok
      ? 'border-success bg-success-soft'
      : 'border-danger bg-danger-soft';
