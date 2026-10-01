import { displayOrder } from '@logicpath/grader';
import { text } from '@/shared/content/bundle';
import type { AnswerProps } from './types';

export function McqAnswer({ item, draft, onChange, disabled, locale }: AnswerProps<'mcq'>) {
  const order = displayOrder(item.id, item.options.length);
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">{text(item.prompt, locale)}</legend>
      {order.map((index) => {
        const option = item.options[index]!;
        const selected = draft.option === index;
        return (
          <label
            key={index}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              selected ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/60'
            } ${disabled ? 'cursor-default' : ''}`}
          >
            <input
              type="radio"
              name={item.id}
              className="mt-1 size-4 accent-[var(--accent)]"
              checked={selected}
              onChange={() => onChange({ type: 'mcq', option: index })}
            />
            <span>{text(option.text, locale)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
