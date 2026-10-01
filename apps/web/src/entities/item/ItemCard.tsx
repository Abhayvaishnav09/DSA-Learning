'use client';

import type { Item, Locale } from '@logicpath/content-schema';
import { correctAnswer, displayOrder, grade, gradeExplain, type Verdict } from '@logicpath/grader';
import type { HintLevel, ReviewCard } from '@logicpath/learning-engine';
import { useMachine } from '@xstate/react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { track } from '@/shared/analytics/track';
import { bundle, text } from '@/shared/content/bundle';
import { useLocale, useT } from '@/shared/i18n/useT';
import type { Messages } from '@/shared/i18n/messages';
import { CodeBlock } from '@/shared/ui/CodeBlock';
import { useProgress, type AttemptInput, type AttemptSource } from '../progress/store';
import { ArrangeAnswer } from './answers/ArrangeAnswer';
import { FillBlankAnswer } from './answers/FillBlankAnswer';
import { McqAnswer } from './answers/McqAnswer';
import { PredictAnswer } from './answers/PredictAnswer';
import { TraceTableAnswer } from './answers/TraceTableAnswer';
import { draftFromAnswer, emptyDraft, isGiven, toAnswer, type Draft, type DraftOf } from './draft';
import { canShowSolution, itemMachine, type ItemMode } from './itemMachine';

export interface ItemResult {
  itemId: string;
  firstTryCorrect: boolean;
  solutionShown: boolean;
  /** Updated review schedule (practice mode only). */
  card: ReviewCard | null;
}

interface ItemCardProps {
  item: Item;
  mode: ItemMode;
  source: AttemptSource;
  heading?: string;
  /** Called when the learner presses Next (practice) or as soon as a prediction is checked. */
  onDone: (result: ItemResult) => void;
}

/** Only called from event handlers, never during render. */
const msSince = (start: number) => Math.round(performance.now() - start);

const SHOWS_CODE = new Set<Item['type']>(['mcq', 'predict-output', 'trace-table']);

export function ItemCard({ item, mode, source, heading, onDone }: ItemCardProps) {
  const locale = useLocale();
  const t = useT();
  const recordAttempt = useProgress((s) => s.recordAttempt);
  const completeItem = useProgress((s) => s.completeItem);

  const [snapshot, send] = useMachine(itemMachine, {
    input: {
      mode,
      hintCount: item.hints.length,
      hasExplain: mode === 'practice' && !!item.explainWhy,
    },
  });
  const ctx = snapshot.context;
  const done = snapshot.status === 'done';
  const explaining = snapshot.matches('explaining');
  const locked = done || explaining;

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(item));
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [dirty, setDirty] = useState(false);
  const [explainChoice, setExplainChoice] = useState<number | null>(null);

  const startedAt = useRef(0);
  const solvedMs = useRef<number | null>(null);
  const pendingCorrect = useRef<AttemptInput | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (done && mode === 'practice') nextButton.current?.focus();
  }, [done, mode]);

  const answer = toAnswer(item, draft);
  const hintLevel = Math.min(3, ctx.hintLevel) as HintLevel;

  const check = (event: FormEvent) => {
    event.preventDefault();
    if (!answer || locked) return;
    const result = grade(item, answer as never);
    setVerdict(result);
    setDirty(false);
    if (result.correct && solvedMs.current === null) solvedMs.current = msSince(startedAt.current);

    const attempt: AttemptInput = {
      itemId: item.id,
      conceptId: item.concept,
      correct: result.correct,
      hintLevel,
      guessProbability: result.guessProbability,
      misconception: result.misconception,
      durationMs: msSince(startedAt.current),
      source: mode === 'predict' ? 'predict' : source,
    };
    // A right answer is recorded once the "why" check tells us whether it was understood.
    if (result.correct && mode === 'practice' && item.explainWhy) pendingCorrect.current = attempt;
    else recordAttempt(attempt);
    track({
      name: 'item_attempted',
      itemId: item.id,
      correct: result.correct,
      hintLevel,
      misconception: result.misconception,
      source: attempt.source,
    });

    send({ type: 'SUBMIT', correct: result.correct });
    if (mode === 'predict')
      onDone({
        itemId: item.id,
        firstTryCorrect: result.correct,
        solutionShown: false,
        card: null,
      });
  };

  const explain = (option: number) => {
    const correct = gradeExplain(item, option);
    if (pendingCorrect.current)
      recordAttempt({ ...pendingCorrect.current, explainedCorrectly: correct });
    pendingCorrect.current = null;
    setExplainChoice(option);
    send({ type: 'EXPLAIN', correct });
  };

  const hint = () => {
    track({ name: 'hint_shown', itemId: item.id, level: ctx.hintLevel + 1 });
    send({ type: 'HINT' });
  };

  const showSolution = () => {
    setDraft(draftFromAnswer(correctAnswer(item)));
    setVerdict(null);
    track({ name: 'solution_shown', itemId: item.id });
    send({ type: 'SHOW_SOLUTION' });
  };

  const next = () => {
    const card = completeItem({
      cardId: item.variationOf ?? item.id,
      firstTryCorrect: ctx.firstTryCorrect === true,
      hintLevel: ctx.hintLevel,
      durationMs: solvedMs.current ?? msSince(startedAt.current),
      expectedMs: item.estSeconds * 1000,
      solutionShown: ctx.solutionShown,
    });
    onDone({
      itemId: item.id,
      firstTryCorrect: ctx.firstTryCorrect === true,
      solutionShown: ctx.solutionShown,
      card,
    });
  };

  const parts = verdict && !verdict.correct && !dirty ? verdict.parts : null;
  const onChange = (next: Draft) => {
    setDraft(next);
    setDirty(true);
  };

  return (
    <article className="flex flex-col gap-4" data-testid="item-card" data-item={item.id}>
      <header className="flex flex-col gap-1">
        {heading && <p className="text-sm font-medium text-muted">{heading}</p>}
        <h2 className="text-lg font-semibold leading-snug sm:text-xl">
          {text(item.prompt, locale)}
        </h2>
      </header>

      {item.code && SHOWS_CODE.has(item.type) && <CodeBlock code={item.code} />}

      <form onSubmit={check} className="flex flex-col gap-4">
        <AnswerInput
          item={item}
          draft={draft}
          onChange={onChange}
          parts={parts}
          disabled={locked}
          locale={locale}
          t={t}
        />

        {!locked && (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="lp-btn" disabled={!answer}>
              {t.item.check}
            </button>
            {mode === 'practice' && ctx.hintLevel < item.hints.length && (
              <button type="button" className="lp-btn-secondary" onClick={hint}>
                {t.item.getHint}
              </button>
            )}
            {canShowSolution(ctx) && (
              <button type="button" className="lp-btn-ghost" onClick={showSolution}>
                {t.item.showSolution}
              </button>
            )}
          </div>
        )}
      </form>

      {ctx.hintLevel > 0 && (
        <ol className="flex flex-col gap-2" aria-label={t.item.getHint}>
          {item.hints.slice(0, ctx.hintLevel).map((h, i) => (
            <li key={i} className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
              <span className="font-semibold">{t.item.hint(i + 1, item.hints.length)}: </span>
              {text(h, locale)}
            </li>
          ))}
        </ol>
      )}

      <div role="status" aria-live="polite" data-testid="feedback">
        <Feedback
          item={item}
          mode={mode}
          verdict={verdict}
          solutionShown={ctx.solutionShown}
          done={done}
          explainChoice={explainChoice}
        />
      </div>

      {explaining && item.explainWhy && (
        <fieldset className="flex flex-col gap-2 rounded-2xl border-2 border-accent/40 p-4">
          <legend className="px-1 font-semibold">{t.item.explainTitle}</legend>
          <p>{text(item.explainWhy.question, locale)}</p>
          {displayOrder(`${item.id}:why`, item.explainWhy.options.length).map((index) => (
            <button
              key={index}
              type="button"
              className="rounded-xl border-2 border-border p-3 text-left hover:border-accent"
              onClick={() => explain(index)}
            >
              {text(item.explainWhy!.options[index]!.text, locale)}
            </button>
          ))}
        </fieldset>
      )}

      {done && mode === 'practice' && (
        <div>
          <button ref={nextButton} type="button" className="lp-btn" onClick={next}>
            {t.item.next}
          </button>
        </div>
      )}
    </article>
  );
}

interface AnswerInputProps {
  item: Item;
  draft: Draft;
  onChange: (draft: Draft) => void;
  parts: Verdict['parts'];
  disabled: boolean;
  locale: Locale;
  t: Messages;
}

/** One input per item type (docs/03-frontend.md §7). */
function AnswerInput({ item, draft, ...rest }: AnswerInputProps) {
  switch (item.type) {
    case 'mcq':
      return <McqAnswer item={item} draft={draft as DraftOf<'mcq'>} {...rest} />;
    case 'predict-output':
      return <PredictAnswer item={item} draft={draft as DraftOf<'predict-output'>} {...rest} />;
    case 'arrange-steps':
      return <ArrangeAnswer item={item} draft={draft as DraftOf<'arrange-steps'>} {...rest} />;
    case 'fill-blank':
      return <FillBlankAnswer item={item} draft={draft as DraftOf<'fill-blank'>} {...rest} />;
    case 'trace-table':
      return <TraceTableAnswer item={item} draft={draft as DraftOf<'trace-table'>} {...rest} />;
  }
}

interface FeedbackProps {
  item: Item;
  mode: ItemMode;
  verdict: Verdict | null;
  solutionShown: boolean;
  done: boolean;
  explainChoice: number | null;
}

function Feedback({ item, mode, verdict, solutionShown, done, explainChoice }: FeedbackProps) {
  const locale = useLocale();
  const t = useT();
  const explanation = <p>{text(item.explanation, locale)}</p>;

  if (solutionShown) {
    return (
      <Panel tone="info" title={t.item.solutionTitle}>
        {explanation}
      </Panel>
    );
  }
  if (!verdict) return null;

  const misconception = verdict.misconception
    ? bundle.misconceptions[verdict.misconception]
    : undefined;
  const misconceptionText = misconception && (
    <p>
      <strong>{text(misconception.title, locale)}. </strong>
      {text(misconception.explanation, locale)}
    </p>
  );

  if (mode === 'predict') {
    return verdict.correct ? (
      <Panel tone="success" title={t.item.predictRight}>
        {explanation}
      </Panel>
    ) : (
      <Panel tone="danger" title={t.item.predictWrong}>
        {misconceptionText}
      </Panel>
    );
  }

  if (verdict.correct) {
    const explainOk =
      explainChoice === null ? null : item.explainWhy?.options[explainChoice]?.correct;
    return (
      <Panel tone="success" title={t.item.correct}>
        {done && explainOk === true && <p className="font-medium">{t.item.explainRight}</p>}
        {done && explainOk === false && <p className="font-medium">{t.item.explainWrong}</p>}
        {done && explanation}
      </Panel>
    );
  }

  // Count only what the learner filled in; given trace-table cells aren't theirs.
  const flat =
    item.type === 'trace-table' && verdict.parts
      ? (verdict.parts as boolean[][]).flatMap((row, r) =>
          row.filter((_, c) => !isGiven(item, r, c)),
        )
      : Array.isArray(verdict.parts)
        ? (verdict.parts.flat() as boolean[])
        : [];
  return (
    <Panel tone="danger" title={t.item.wrong}>
      {misconceptionText ?? <p>{t.item.wrongGeneric}</p>}
      {flat.length > 1 && (
        <p className="text-sm">{t.item.partsRight(flat.filter(Boolean).length, flat.length)}</p>
      )}
    </Panel>
  );
}

function Panel({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'danger' | 'info';
  title: string;
  children?: ReactNode;
}) {
  const styles = {
    success: 'border-success/40 bg-success-soft',
    danger: 'border-danger/40 bg-danger-soft',
    info: 'border-accent/40 bg-accent-soft',
  }[tone];
  const icon = { success: '✓', danger: '✗', info: 'ℹ' }[tone];
  return (
    <div className={`flex flex-col gap-1 rounded-xl border-2 p-3 ${styles}`}>
      <p className="font-semibold">
        <span aria-hidden className="mr-1">
          {icon}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}
