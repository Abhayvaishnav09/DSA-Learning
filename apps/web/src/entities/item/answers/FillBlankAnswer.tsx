import { Fragment } from 'react';
import { partTone, type AnswerProps } from './types';

export function FillBlankAnswer({
  item,
  draft,
  onChange,
  parts,
  disabled,
  t,
}: AnswerProps<'fill-blank'>) {
  const blankParts = parts as boolean[] | null;
  const set = (index: number, value: string) =>
    onChange({ type: 'fill-blank', blanks: draft.blanks.map((b, i) => (i === index ? value : b)) });

  let blank = 0;
  const lines = item.code.replace(/\n$/, '').split('\n');
  return (
    <pre className="overflow-x-auto rounded-xl bg-code p-3 font-mono text-sm leading-9">
      <code>
        {lines.map((line, lineIndex) => {
          const pieces = line.split('___');
          return (
            <span key={lineIndex} className="flex gap-3">
              <span
                className="w-5 shrink-0 select-none text-right text-muted opacity-60"
                aria-hidden
              >
                {lineIndex + 1}
              </span>
              <span className="whitespace-pre">
                {pieces.map((piece, p) => {
                  if (p === pieces.length - 1) return <Fragment key={p}>{piece}</Fragment>;
                  const index = blank++;
                  const value = draft.blanks[index] ?? '';
                  return (
                    <Fragment key={p}>
                      {piece}
                      <input
                        type="text"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-label={t.item.blank(index + 1)}
                        className={`mx-0.5 rounded-md border-2 bg-surface px-1 text-center font-mono focus:border-accent focus:outline-none ${partTone(blankParts?.[index])}`}
                        style={{ width: `${Math.max(3, value.length + 1.5)}ch` }}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => set(index, e.target.value)}
                      />
                    </Fragment>
                  );
                })}
              </span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
