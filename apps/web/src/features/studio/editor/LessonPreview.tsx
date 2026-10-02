'use client';

import type { Lesson } from '@logicpath/content-schema';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { CodeBlock } from '@/shared/ui/CodeBlock';
import { studioStrings } from '../strings';

/** How a lesson reads to a learner: the story, the words, the program and the recap. */
export function LessonPreview({ lesson }: { lesson: Lesson }) {
  const t = useStrings(studioStrings).editor;
  const locale = useLocale();
  const say = (x: { en: string; 'hi-Latn': string }) => x[locale] || x.en;
  return (
    <article className="flex flex-col gap-4 text-sm" aria-label={t.lessonPreviewTitle}>
      <h3 className="text-lg font-bold">{say(lesson.story.title) || '…'}</h3>
      {lesson.story.body.map((p, i) => (
        <p key={i} className="leading-relaxed">
          {say(p)}
        </p>
      ))}
      {lesson.story.terms.length > 0 && (
        <dl className="grid gap-2 rounded-xl border border-border bg-surface-2/50 p-3">
          {lesson.story.terms.map((term, i) => (
            <div key={i} className="grid gap-0.5">
              <dt className="font-mono font-semibold text-accent">{say(term.term)}</dt>
              <dd>{say(term.meaning)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="font-medium">{say(lesson.see.intro)}</p>
      {lesson.see.code && <CodeBlock code={lesson.see.code} />}
      <ul className="list-disc space-y-1 pl-5">
        {lesson.recap.map((p, i) => (
          <li key={i}>{say(p)}</li>
        ))}
      </ul>
    </article>
  );
}
