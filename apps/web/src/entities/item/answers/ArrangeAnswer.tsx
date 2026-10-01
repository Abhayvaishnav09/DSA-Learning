import { displayOrder } from '@logicpath/grader';
import { partTone, type AnswerProps } from './types';

/**
 * Tap-to-place ordering: works the same with touch, mouse and keyboard, with no drag gestures
 * to learn (docs/03-frontend.md §7).
 */
export function ArrangeAnswer({
  item,
  draft,
  onChange,
  parts,
  disabled,
  t,
}: AnswerProps<'arrange-steps'>) {
  const placed = new Set(draft.order);
  const pool = displayOrder(item.id, item.lines.length).filter((i) => !placed.has(i));
  const slotParts = parts as boolean[] | null;

  const place = (line: number) =>
    onChange({ type: 'arrange-steps', order: [...draft.order, line] });
  const remove = (slot: number) =>
    onChange({ type: 'arrange-steps', order: draft.order.filter((_, i) => i !== slot) });

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">{t.item.arrangePool}</h3>
        <ul className="flex flex-col gap-2" data-testid="arrange-pool">
          {pool.map((line) => (
            <li key={line}>
              <button
                type="button"
                className="w-full rounded-xl border-2 border-dashed border-border bg-surface px-3 py-2 text-left font-mono text-sm whitespace-pre hover:border-accent disabled:opacity-50"
                onClick={() => place(line)}
                disabled={disabled}
                aria-label={t.item.addLine(item.lines[line]!)}
              >
                {item.lines[line]}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">{t.item.arrangeAnswer}</h3>
        {draft.order.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-border p-3 text-sm text-muted">
            {t.item.arrangeEmpty}
          </p>
        ) : (
          <ol className="flex flex-col gap-2 rounded-xl bg-code p-2" data-testid="arrange-answer">
            {draft.order.map((line, slot) => (
              <li key={line} className="flex items-center gap-2">
                <span className="w-5 text-right font-mono text-xs text-muted" aria-hidden>
                  {slot + 1}
                </span>
                <button
                  type="button"
                  className={`flex-1 rounded-lg border-2 bg-surface px-3 py-1.5 text-left font-mono text-sm whitespace-pre ${partTone(slotParts?.[slot])}`}
                  onClick={() => remove(slot)}
                  disabled={disabled}
                  aria-label={t.item.removeLine(slot + 1, item.lines[line]!)}
                >
                  {item.lines[line]}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
