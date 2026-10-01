import type { AnswerProps } from './types';

export function PredictAnswer({
  item,
  draft,
  onChange,
  disabled,
  t,
}: AnswerProps<'predict-output'>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-muted">{t.item.typeOutput}</span>
      <input
        type="text"
        name={item.id}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full rounded-xl border-2 border-border bg-surface px-3 py-2 font-mono text-lg focus:border-accent focus:outline-none sm:max-w-xs"
        value={draft.text}
        disabled={disabled}
        onChange={(e) => onChange({ type: 'predict-output', text: e.target.value })}
      />
    </label>
  );
}
