'use client';

import type { Lesson } from '@logicpath/content-schema';
import { Callout } from '@logicpath/ui';
import { viewPseudocode, type ViewFrame } from '@logicpath/visualizer/view';
import { Visualizer } from '@logicpath/visualizer/react';
import { useMemo } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { CodeBlock } from '@/shared/ui/CodeBlock';
import { ComplexityNotes } from '@/shared/ui/ComplexityNotes';
import { studioStrings } from '../strings';

/** How a lesson reads to a learner: the story, the words, the running program and the recap. */
export function LessonPreview({ lesson }: { lesson: Lesson }) {
  const t = useStrings(studioStrings).editor;
  const locale = useLocale();
  const say = (x: { en: string; 'hi-Latn': string }) => x[locale] || x.en;
  const code = lesson.see.code;
  // While the writer is typing the program may not parse: show it plainly with the reason.
  const run = useMemo((): { frames: ViewFrame[] } | { error: string } | null => {
    if (!code.trim()) return null;
    try {
      return { frames: viewPseudocode(code) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [code]);
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
      {run && 'frames' in run && (
        <Visualizer key={code} source={code} frames={run.frames} locale={locale} />
      )}
      {run && 'error' in run && (
        <>
          <CodeBlock code={code} />
          <Callout tone="warning">{t.programError(run.error)}</Callout>
        </>
      )}
      {lesson.see.complexity && (
        <ComplexityNotes complexity={lesson.see.complexity} locale={locale} title={t.complexity} />
      )}
      <ul className="list-disc space-y-1 pl-5">
        {lesson.recap.map((p, i) => (
          <li key={i}>{say(p)}</li>
        ))}
      </ul>
    </article>
  );
}
