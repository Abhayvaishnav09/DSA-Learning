'use client';

import type { GraphConcept, Lesson, Misconception } from '@logicpath/content-schema';
import { Field, Input, Select, Textarea } from '@logicpath/ui';
import { bundle, text as pickText } from '@/shared/content/bundle';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { studioStrings } from '../strings';
import { blankText, errorAt, LText, RowList, type Issue } from './fields';

const asInt = (value: string, fallback: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

type Props<T> = { value: T; set: (next: T) => void; issues: readonly Issue[]; isNew: boolean };

export function LessonFields({ value, set, issues }: Props<Lesson>) {
  const t = useStrings(studioStrings).editor;
  const locale = useLocale();
  const items = Object.values(bundle.items).filter((i) => i.concept === value.concept);
  const sub = (prefix: string) =>
    issues
      .filter((i) => i.path.startsWith(prefix))
      .map((i) => ({ ...i, path: i.path.replace(prefix, 'x') }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.lessonFor}>
          <Input
            value={
              pickText(
                bundle.concepts.find((c) => c.id === value.concept)?.title ?? blankText(),
                locale,
              ) || value.concept
            }
            readOnly
          />
        </Field>
        <Field label={t.minutes} error={errorAt(issues, 'minutes')}>
          <Input
            type="number"
            min={1}
            max={15}
            value={value.minutes}
            onChange={(e) => set({ ...value, minutes: asInt(e.target.value, 7) })}
          />
        </Field>
      </div>

      <LText
        label={t.storyTitle}
        value={value.story.title}
        onChange={(title) => set({ ...value, story: { ...value.story, title } })}
        issues={sub('story.title')}
        path="x"
      />
      <RowList
        label={t.storyBody}
        rows={value.story.body}
        min={1}
        max={5}
        addLabel={t.addParagraph}
        onChange={(body) => set({ ...value, story: { ...value.story, body } })}
        blank={blankText}
      >
        {(paragraph, i, setParagraph) => (
          <LText
            label={`${i + 1}`}
            value={paragraph}
            onChange={setParagraph}
            issues={sub(`story.body.${i}`)}
            path={`x`}
            multiline
          />
        )}
      </RowList>
      <RowList
        label={t.terms}
        rows={value.story.terms}
        max={3}
        addLabel={t.addTerm}
        onChange={(terms) => set({ ...value, story: { ...value.story, terms } })}
        blank={() => ({ term: blankText(), meaning: blankText() })}
      >
        {(term, _i, setTerm) => (
          <div className="flex flex-col gap-3">
            <LText
              label={t.term}
              value={term.term}
              onChange={(x) => setTerm({ ...term, term: x })}
              issues={[]}
              path="x"
            />
            <LText
              label={t.meaning}
              value={term.meaning}
              onChange={(meaning) => setTerm({ ...term, meaning })}
              issues={[]}
              path="x"
            />
          </div>
        )}
      </RowList>

      <LText
        label={t.seeIntro}
        value={value.see.intro}
        onChange={(intro) => set({ ...value, see: { ...value.see, intro } })}
        issues={sub('see.intro')}
        path="x"
        multiline
      />
      <Field label={t.seeCode} error={errorAt(issues, 'see.code')}>
        <Textarea
          rows={7}
          spellCheck={false}
          className="font-mono text-sm"
          value={value.see.code}
          onChange={(e) => set({ ...value, see: { ...value.see, code: e.target.value } })}
        />
      </Field>

      <LText
        label={t.predictIntro}
        value={value.predict.intro}
        onChange={(intro) => set({ ...value, predict: { ...value.predict, intro } })}
        issues={sub('predict.intro')}
        path="x"
        multiline
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.pauseAt} error={errorAt(issues, 'predict.pauseAt')}>
          <Input
            type="number"
            min={0}
            value={value.predict.pauseAt}
            onChange={(e) =>
              set({ ...value, predict: { ...value.predict, pauseAt: asInt(e.target.value, 0) } })
            }
          />
        </Field>
        <Field label={t.predictItem} error={errorAt(issues, 'predict.item')}>
          <Select
            value={value.predict.item}
            onChange={(e) => set({ ...value, predict: { ...value.predict, item: e.target.value } })}
          >
            <option value="">{t.none}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <RowList
        label={t.practice}
        rows={value.practice}
        min={1}
        max={8}
        addLabel={t.addRow}
        onChange={(practice) => set({ ...value, practice })}
        blank={() => ''}
      >
        {(id, i, setId) => (
          <Field label={`${i + 1}`} error={errorAt(issues, `practice.${i}`)}>
            <Select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">{t.none}</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.id}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </RowList>

      <RowList
        label={t.recap}
        rows={value.recap}
        min={1}
        max={5}
        addLabel={t.addPoint}
        onChange={(recap) => set({ ...value, recap })}
        blank={blankText}
      >
        {(point, i, setPoint) => (
          <LText
            label={`${i + 1}`}
            value={point}
            onChange={setPoint}
            issues={sub(`recap.${i}`)}
            path="x"
          />
        )}
      </RowList>
    </div>
  );
}

export function ConceptFields({ value, set, issues, isNew }: Props<GraphConcept>) {
  const t = useStrings(studioStrings).editor;
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t.id}
          description={isNew ? t.idHelp : undefined}
          error={errorAt(issues, 'id')}
        >
          <Input
            value={value.id}
            readOnly={!isNew}
            className="font-mono"
            onChange={(e) => set({ ...value, id: e.target.value.trim() })}
          />
        </Field>
        <Field label={t.stage} error={errorAt(issues, 'stage')}>
          <Select
            value={String(value.stage)}
            onChange={(e) => set({ ...value, stage: asInt(e.target.value, 0) })}
          >
            {bundle.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}: {pickText(s.title, locale)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <LText
        label={t.conceptTitle}
        value={value.title}
        onChange={(title) => set({ ...value, title })}
        issues={issues}
        path="title"
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.prerequisites}</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {bundle.concepts
            .filter((c) => c.id !== value.id)
            .map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.prerequisites.includes(c.id)}
                  onChange={(e) =>
                    set({
                      ...value,
                      prerequisites: e.target.checked
                        ? [...value.prerequisites, c.id]
                        : value.prerequisites.filter((p) => p !== c.id),
                    })
                  }
                />
                {pickText(c.title, locale)}
              </label>
            ))}
        </div>
      </fieldset>
    </div>
  );
}

export function MisconceptionFields({ value, set, issues, isNew }: Props<Misconception>) {
  const t = useStrings(studioStrings).editor;
  return (
    <div className="flex flex-col gap-5">
      <Field
        label={t.id}
        description={isNew ? t.idHelp : undefined}
        error={errorAt(issues, 'id')}
        className="max-w-xl"
      >
        <Input
          value={value.id}
          readOnly={!isNew}
          className="font-mono"
          onChange={(e) => set({ ...value, id: e.target.value.trim() })}
        />
      </Field>
      <LText
        label={t.mistakeTitle}
        value={value.title}
        onChange={(title) => set({ ...value, title })}
        issues={issues}
        path="title"
      />
      <LText
        label={t.mistakeExplain}
        value={value.explanation}
        onChange={(explanation) => set({ ...value, explanation })}
        issues={issues}
        path="explanation"
        multiline
      />
    </div>
  );
}
