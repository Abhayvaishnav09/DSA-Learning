import { isGiven } from '../draft';
import { partTone, type AnswerProps } from './types';

export function TraceTableAnswer({
  item,
  draft,
  onChange,
  parts,
  disabled,
  t,
}: AnswerProps<'trace-table'>) {
  const cellParts = parts as boolean[][] | null;
  const numeric = item.rows.every((row) => row.every((cell) => /^-?\d+$/.test(cell)));
  const set = (r: number, c: number, value: string) =>
    onChange({
      type: 'trace-table',
      rows: draft.rows.map((row, i) =>
        i === r ? row.map((cell, j) => (j === c ? value : cell)) : row,
      ),
    });

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1.5 font-mono">
        <thead>
          <tr>
            <th scope="col" className="px-2 text-left text-xs font-medium text-muted">
              {t.item.row}
            </th>
            {item.columns.map((column) => (
              <th key={column} scope="col" className="px-2 text-center text-sm font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.rows.map((row, r) => (
            <tr key={r}>
              <th scope="row" className="px-2 text-left text-xs font-medium text-muted">
                {r + 1}
              </th>
              {row.map((cell, c) => {
                const column = item.columns[c]!;
                if (isGiven(item, r, c)) {
                  return (
                    <td
                      key={c}
                      className="rounded-lg bg-code px-3 py-1.5 text-center"
                      title={t.item.given}
                    >
                      {cell}
                    </td>
                  );
                }
                return (
                  <td key={c}>
                    <input
                      type="text"
                      inputMode={numeric ? 'numeric' : 'text'}
                      autoComplete="off"
                      aria-label={t.item.cell(r + 1, column)}
                      className={`w-16 rounded-lg border-2 bg-surface px-2 py-1 text-center focus:border-accent focus:outline-none ${partTone(cellParts?.[r]?.[c])}`}
                      value={cell}
                      disabled={disabled}
                      onChange={(e) => set(r, c, e.target.value)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
