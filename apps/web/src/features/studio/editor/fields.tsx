'use client';

import type { LocalizedText } from '@logicpath/content-schema';
import { Button, Field, Input, Textarea } from '@logicpath/ui';
import { Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useStrings } from '@/shared/i18n/useT';
import { studioStrings } from '../strings';

export interface Issue {
  path: string;
  message: string;
}

/** The first problem at (or under) a path such as "prompt.en", for showing next to its field. */
export function errorAt(issues: readonly Issue[], path: string): string | undefined {
  return issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
}

/** Text in both languages, side by side on wide screens and stacked on phones. */
export function LText({
  label,
  value,
  onChange,
  issues,
  path,
  multiline = false,
  testId,
}: {
  label: string;
  value: LocalizedText;
  onChange: (next: LocalizedText) => void;
  issues: readonly Issue[];
  path: string;
  multiline?: boolean;
  /** Prefix for test ids on the two inputs (`<id>-en`, `<id>-hi`). */
  testId?: string;
}) {
  const t = useStrings(studioStrings).editor;
  const Control = multiline ? Textarea : Input;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t.english} error={errorAt(issues, `${path}.en`)}>
          <Control
            value={value.en}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
            {...(testId ? { 'data-testid': `${testId}-en` } : {})}
          />
        </Field>
        <Field label={t.hinglish} error={errorAt(issues, `${path}.hi-Latn`)}>
          <Control
            value={value['hi-Latn']}
            onChange={(e) => onChange({ ...value, 'hi-Latn': e.target.value })}
            {...(testId ? { 'data-testid': `${testId}-hi` } : {})}
          />
        </Field>
      </div>
    </fieldset>
  );
}

export const blankText = (): LocalizedText => ({ en: '', 'hi-Latn': '' });

/** A list the writer can grow and shrink within limits. */
export function RowList<T>({
  label,
  rows,
  min = 0,
  max = 99,
  addLabel,
  onChange,
  blank,
  children,
}: {
  label: string;
  rows: readonly T[];
  min?: number;
  max?: number;
  addLabel: string;
  onChange: (rows: T[]) => void;
  blank: () => T;
  children: (row: T, index: number, set: (next: T) => void) => ReactNode;
}) {
  const t = useStrings(studioStrings).editor;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/40 p-3"
        >
          <div className="min-w-0 flex-1">
            {children(row, index, (next) => onChange(rows.map((r, i) => (i === index ? next : r))))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${t.remove} ${index + 1}`}
            disabled={rows.length <= min}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          disabled={rows.length >= max}
          onClick={() => onChange([...rows, blank()])}
        >
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}

/** Lines of text typed one per row, for programs and expected output. */
export function LinesField({
  label,
  help,
  value,
  onChange,
  error,
  rows = 5,
  mono = true,
}: {
  label: string;
  help?: string;
  value: string[];
  onChange: (lines: string[]) => void;
  error?: string | undefined;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <Field label={label} description={help} error={error}>
      <Textarea
        rows={rows}
        value={value.join('\n')}
        spellCheck={false}
        className={mono ? 'font-mono text-sm' : ''}
        onChange={(e) => onChange(e.target.value.split('\n'))}
      />
    </Field>
  );
}

/** Comma-separated words, kept as a list. */
export function CsvField({
  label,
  value,
  onChange,
  error,
  help,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  error?: string | undefined;
  help?: string;
}) {
  return (
    <Field label={label} description={help} error={error}>
      <Input
        value={value.join(', ')}
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()))}
      />
    </Field>
  );
}

export function ProblemList({ issues, title }: { issues: readonly Issue[]; title: string }) {
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger-soft/50 p-3 text-sm"
      data-testid="editor-problems"
    >
      <p className="mb-1 font-semibold text-danger">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {issues.slice(0, 8).map((issue, i) => (
          <li key={i}>
            <code className="font-mono text-xs">{issue.path || 'form'}</code> {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
