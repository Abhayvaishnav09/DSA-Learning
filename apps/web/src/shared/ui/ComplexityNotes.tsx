import type { Lesson, Locale } from '@logicpath/content-schema';

type Complexity = NonNullable<Lesson['see']['complexity']>;

interface ComplexityNotesProps {
  complexity: Complexity;
  locale: Locale;
  title: string;
}

/** The author's "how the work grows" note under a program: the O( ) badge and up to three cards. */
export function ComplexityNotes({ complexity, locale, title }: ComplexityNotesProps) {
  const say = (x: { en: string; 'hi-Latn': string }) => x[locale] || x.en;
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
      aria-label={title}
      data-testid="complexity"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-lg border-2 border-accent px-3 py-1 font-mono text-lg font-bold text-accent"
          title={title}
        >
          {complexity.bigO}
        </span>
        <p className="min-w-0 flex-1">
          <span className="sr-only">{title}: </span>
          {say(complexity.summary)}
        </p>
      </div>
      {complexity.cases.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {complexity.cases.map((c, i) => (
            <li key={i} className="rounded-xl border border-border bg-bg p-3">
              <strong className="block font-mono">{say(c.title)}</strong>
              <span className="text-sm text-muted">{say(c.body)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
