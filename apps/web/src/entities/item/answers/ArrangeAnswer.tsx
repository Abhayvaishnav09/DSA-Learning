import { arrangeCount, displayOrder } from '@logicpath/grader';
import { partTone, type AnswerProps } from './types';

/**
 * Tap-to-place ordering: works the same with touch, mouse and keyboard, with no drag gestures
 * to learn (docs/03-frontend.md §7). Program lines are shown as code; plain-language steps
 * (Stage 0) as sentences. Subgoal labels head the answer slots they belong to.
 */
export function ArrangeAnswer({
  item,
  draft,
  onChange,
  parts,
  disabled,
  locale,
  t,
}: AnswerProps<'arrange-steps'>) {
  const count = arrangeCount(item);
  const isCode = !!item.lines;
  const text = (i: number) => (isCode ? item.lines![i]! : item.steps![i]![locale]);
  const placed = new Set(draft.order);
  const pool = displayOrder(item.id, count).filter((i) => !placed.has(i));
  const slotParts = parts as boolean[] | null;
  const font = isCode ? 'font-mono text-sm whitespace-pre' : 'text-base';
  const subgoal = (slot: number) => item.subgoals.find((s) => s.before === slot)?.label[locale];

  const place = (line: number) =>
    onChange({ type: 'arrange-steps', order: [...draft.order, line] });
  const remove = (slot: number) =>
    onChange({ type: 'arrange-steps', order: draft.order.filter((_, i) => i !== slot) });

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">
          {isCode ? t.item.arrangePool : t.item.stepsPool}
        </h3>
        <ul className="flex flex-col gap-2" data-testid="arrange-pool">
          {pool.map((line) => (
            <li key={line}>
              <button
                type="button"
                className={`w-full rounded-xl border-2 border-dashed border-border bg-surface px-3 py-2 text-left hover:border-accent disabled:opacity-50 ${font}`}
                onClick={() => place(line)}
                disabled={disabled}
                aria-label={t.item.addLine(text(line))}
              >
                {text(line)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">
          {isCode ? t.item.arrangeAnswer : t.item.stepsAnswer}
        </h3>
        {draft.order.length === 0 && item.subgoals.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-border p-3 text-sm text-muted">
            {t.item.arrangeEmpty}
          </p>
        ) : (
          <ol className="flex flex-col gap-2 rounded-xl bg-code p-2" data-testid="arrange-answer">
            {Array.from(
              { length: Math.max(draft.order.length, item.subgoals.length ? count : 0) },
              (_, slot) => {
                const line = draft.order[slot];
                const label = subgoal(slot);
                return (
                  <li key={slot} className="flex flex-col gap-1">
                    {label && (
                      <span className="px-1 text-xs font-semibold uppercase tracking-wide text-accent">
                        {label}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right font-mono text-xs text-muted" aria-hidden>
                        {slot + 1}
                      </span>
                      {line === undefined ? (
                        <span className="flex-1 rounded-lg border-2 border-dashed border-border px-3 py-1.5 text-sm text-muted">
                          {slot === draft.order.length ? t.item.arrangeEmpty : ' '}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`flex-1 rounded-lg border-2 bg-surface px-3 py-1.5 text-left ${font} ${partTone(slotParts?.[slot])}`}
                          onClick={() => remove(slot)}
                          disabled={disabled}
                          aria-label={t.item.removeLine(slot + 1, text(line))}
                        >
                          {text(line)}
                        </button>
                      )}
                    </div>
                  </li>
                );
              },
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
