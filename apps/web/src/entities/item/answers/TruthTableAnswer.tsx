import type { TruthCell } from '../draft';
import { partTone, type AnswerProps } from './types';

const NEXT: Record<TruthCell, TruthCell> = { '': 'true', true: 'false', false: 'true' };

/** Every true/false combination of the inputs; the learner taps each output cell to set it. */
export function TruthTableAnswer({
  item,
  draft,
  onChange,
  parts,
  disabled,
  t,
}: AnswerProps<'truth-table'>) {
  const cellParts = parts as boolean[][] | null;
  const inputs = item.inputs.length;
  const word = (v: TruthCell) =>
    v === 'true' ? t.item.trueWord : v === 'false' ? t.item.falseWord : '';
  const toggle = (r: number, c: number) =>
    onChange({
      type: 'truth-table',
      rows: draft.rows.map((row, i) =>
        i === r ? row.map((cell, j) => (j === c ? NEXT[cell] : cell)) : row,
      ),
    });

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">{t.item.truthTableHint}</p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1.5 font-mono">
          <thead>
            <tr>
              {item.inputs.map((name) => (
                <th
                  key={name}
                  scope="col"
                  className="px-2 text-center text-sm font-semibold text-muted"
                >
                  {name}
                </th>
              ))}
              {item.outputs.map((o) => (
                <th key={o.label} scope="col" className="px-2 text-center text-sm font-semibold">
                  {o.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: inputs }, (_, i) => {
                  const value = ((r >> (inputs - 1 - i)) & 1) === 1;
                  return (
                    <td key={i} className="rounded-lg bg-code px-3 py-1.5 text-center text-muted">
                      {value ? t.item.trueWord : t.item.falseWord}
                    </td>
                  );
                })}
                {row.map((cell, c) => (
                  <td key={c}>
                    <button
                      type="button"
                      aria-label={t.item.truthCell(r + 1, item.outputs[c]!.label, word(cell))}
                      className={`min-w-20 rounded-lg border-2 bg-surface px-2 py-1.5 text-center font-bold ${
                        cell === 'true'
                          ? 'text-success'
                          : cell === 'false'
                            ? 'text-danger'
                            : 'text-muted'
                      } ${partTone(cellParts?.[r]?.[c])}`}
                      disabled={disabled}
                      onClick={() => toggle(r, c)}
                    >
                      {word(cell) || '?'}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
