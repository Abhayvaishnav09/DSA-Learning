'use client';

import type { Item, ItemOf, LocalizedText } from '@logicpath/content-schema';
import { Button, Field, Input, Segmented, Select, Switch, Textarea } from '@logicpath/ui';
import { bundle, text as pickText } from '@/shared/content/bundle';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { studioStrings } from '../strings';
import { blankText, CsvField, errorAt, LinesField, LText, RowList, type Issue } from './fields';
import { truthRows } from './blank';

type Props<T extends Item> = { item: T; set: (next: T) => void; issues: readonly Issue[] };

const asInt = (value: string, fallback: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

function MisconceptionSelect({
  value,
  onChange,
  label,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  label: string;
}) {
  const t = useStrings(studioStrings).editor;
  const locale = useLocale();
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t.none}</option>
        {Object.values(bundle.misconceptions).map((m) => (
          <option key={m.id} value={m.id}>
            {pickText(m.title, locale)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Wrong answers that point at a known mistake: what was typed, and which mistake it shows. */
function WrongAnswers<M>({
  rows,
  onChange,
  renderMatch,
  blank,
}: {
  rows: { match: M; misconception: string }[];
  onChange: (rows: { match: M; misconception: string }[]) => void;
  renderMatch: (match: M, set: (next: M) => void) => React.ReactNode;
  blank: M;
}) {
  const t = useStrings(studioStrings).editor;
  return (
    <RowList
      label={t.wrongAnswers}
      rows={rows}
      addLabel={t.addWrong}
      onChange={onChange}
      blank={() => ({ match: blank, misconception: Object.keys(bundle.misconceptions)[0] ?? '' })}
    >
      {(row, _i, set) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {renderMatch(row.match, (match) => set({ ...row, match }))}
          <MisconceptionSelect
            label={t.misconception}
            value={row.misconception}
            onChange={(id) => set({ ...row, misconception: id ?? '' })}
          />
        </div>
      )}
    </RowList>
  );
}

/** Everything every question has: id, concept, level, words, hints and explanation. */
export function BaseFields({ item, set, issues, isNew }: Props<Item> & { isNew: boolean }) {
  const t = useStrings(studioStrings).editor;
  const locale = useLocale();
  const patch = (p: Record<string, unknown>) => set({ ...item, ...p } as Item);
  const needsCode =
    item.type === 'predict-output' || item.type === 'fill-blank' || item.type === 'trace-table';
  const showCode = item.type === 'mcq' || needsCode;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={t.id}
          description={isNew ? t.idHelp : undefined}
          error={errorAt(issues, 'id')}
          className="lg:col-span-2"
        >
          <Input
            value={item.id}
            readOnly={!isNew}
            onChange={(e) => patch({ id: e.target.value.trim() })}
            className="font-mono"
          />
        </Field>
        <Field label={t.concept} error={errorAt(issues, 'concept')}>
          <Select value={item.concept} onChange={(e) => patch({ concept: e.target.value })}>
            {bundle.concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {pickText(c.title, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.difficulty} error={errorAt(issues, 'difficulty')}>
          <Select
            value={String(item.difficulty)}
            onChange={(e) => patch({ difficulty: asInt(e.target.value, 1) })}
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t.seconds} error={errorAt(issues, 'estSeconds')} className="max-w-48">
        <Input
          type="number"
          min={5}
          max={600}
          value={item.estSeconds}
          onChange={(e) => patch({ estSeconds: asInt(e.target.value, 30) })}
        />
      </Field>

      <LText
        label={t.prompt}
        value={item.prompt}
        onChange={(prompt) => patch({ prompt })}
        issues={issues}
        path="prompt"
        multiline
        testId="prompt"
      />

      {showCode && (
        <Field
          label={t.code}
          description={item.type === 'fill-blank' ? t.codeBlank : undefined}
          error={errorAt(issues, 'code')}
        >
          <Textarea
            rows={5}
            spellCheck={false}
            className="font-mono text-sm"
            value={'code' in item ? (item.code ?? '') : ''}
            onChange={(e) => patch({ code: e.target.value || (needsCode ? '' : undefined) })}
          />
        </Field>
      )}

      <RowList
        label={t.hints}
        rows={item.hints}
        min={1}
        max={3}
        addLabel={t.hints}
        onChange={(hints) => patch({ hints })}
        blank={blankText}
      >
        {(hint, i, setHint) => (
          <LText
            label={`${i + 1}`}
            value={hint}
            onChange={setHint}
            issues={issues
              .filter((x) => x.path.startsWith(`hints.${i}`))
              .map((x) => ({ ...x, path: x.path.replace(`hints.${i}`, 'h') }))}
            path="h"
            testId={`hint-${i}`}
          />
        )}
      </RowList>

      <LText
        label={t.explanation}
        value={item.explanation}
        onChange={(explanation) => patch({ explanation })}
        issues={issues}
        path="explanation"
        multiline
        testId="explanation"
      />

      <WhyCheck item={item} patch={patch} issues={issues} />
    </div>
  );
}

function WhyCheck({
  item,
  patch,
  issues,
}: {
  item: Item;
  patch: (p: Record<string, unknown>) => void;
  issues: readonly Issue[];
}) {
  const t = useStrings(studioStrings).editor;
  const why = item.explainWhy;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <Switch
        label={t.why}
        checked={!!why}
        onCheckedChange={(on) =>
          patch({
            explainWhy: on
              ? {
                  question: blankText(),
                  options: [
                    { text: blankText(), correct: true },
                    { text: blankText(), correct: false },
                  ],
                }
              : undefined,
          })
        }
      />
      {why && (
        <>
          <LText
            label={t.whyQuestion}
            value={why.question}
            onChange={(question) => patch({ explainWhy: { ...why, question } })}
            issues={issues}
            path="explainWhy.question"
          />
          <RowList
            label={t.options}
            rows={why.options}
            min={2}
            max={4}
            addLabel={t.addOption}
            onChange={(options) => patch({ explainWhy: { ...why, options } })}
            blank={() => ({ text: blankText(), correct: false })}
          >
            {(option, index, setOption) => (
              <div className="flex flex-col gap-2">
                <LText
                  label={`${t.optionText} ${index + 1}`}
                  value={option.text}
                  onChange={(text) => setOption({ ...option, text })}
                  issues={[]}
                  path="x"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="why-correct"
                    checked={option.correct}
                    onChange={() =>
                      patch({
                        explainWhy: {
                          ...why,
                          options: why.options.map((o, i) => ({ ...o, correct: i === index })),
                        },
                      })
                    }
                  />
                  {t.correct}
                </label>
              </div>
            )}
          </RowList>
          {errorAt(issues, 'explainWhy.options') && (
            <p className="text-xs font-medium text-danger">
              {errorAt(issues, 'explainWhy.options')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------- multiple choice ----------

type McqOption = ItemOf<'mcq'>['options'][number];

function McqFields({ item, set, issues }: Props<ItemOf<'mcq'>>) {
  const t = useStrings(studioStrings).editor;
  return (
    <>
      <RowList<McqOption>
        label={t.options}
        rows={item.options}
        min={2}
        max={5}
        addLabel={t.addOption}
        onChange={(options) => set({ ...item, options })}
        blank={() => ({ text: blankText(), correct: false })}
      >
        {(option, index, setOption) => (
          <div className="flex flex-col gap-3">
            <LText
              label={`${t.optionText} ${index + 1}`}
              value={option.text}
              onChange={(text) => setOption({ ...option, text })}
              issues={issues
                .filter((x) => x.path.startsWith(`options.${index}`))
                .map((x) => ({ ...x, path: x.path.replace(`options.${index}.text`, 'o') }))}
              path="o"
              testId={`option-${index}`}
            />
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mcq-correct"
                  checked={option.correct}
                  onChange={() =>
                    set({
                      ...item,
                      options: item.options.map((o, i) => ({ ...o, correct: i === index })),
                    })
                  }
                />
                {t.correct}
              </label>
              {!option.correct && (
                <div className="min-w-52 flex-1">
                  <MisconceptionSelect
                    label={t.misconception}
                    value={option.misconception}
                    onChange={(id) => {
                      const { misconception: _drop, ...rest } = option;
                      setOption(id ? { ...rest, misconception: id } : rest);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </RowList>
      {errorAt(issues, 'options') && (
        <p className="text-xs font-medium text-danger">{errorAt(issues, 'options')}</p>
      )}
    </>
  );
}

// ---------- predict the output ----------

function PredictFields({ item, set, issues }: Props<ItemOf<'predict-output'>>) {
  const t = useStrings(studioStrings).editor;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t.ask}</span>
        <Segmented
          label={t.ask}
          value={item.ask}
          onChange={(ask) => set({ ...item, ask })}
          options={[
            { value: 'last', label: t.askLast },
            { value: 'all', label: t.askAll },
          ]}
        />
      </div>
      <Field label={t.answer} error={errorAt(issues, 'answer')}>
        <Input value={item.answer} onChange={(e) => set({ ...item, answer: e.target.value })} />
      </Field>
      <WrongAnswers
        rows={item.wrongAnswers}
        onChange={(wrongAnswers) => set({ ...item, wrongAnswers })}
        blank=""
        renderMatch={(match, setMatch) => (
          <Field label={t.wrongMatch}>
            <Input value={match} onChange={(e) => setMatch(e.target.value)} />
          </Field>
        )}
      />
    </>
  );
}

// ---------- fill in the blank ----------

function FillFields({ item, set, issues }: Props<ItemOf<'fill-blank'>>) {
  const t = useStrings(studioStrings).editor;
  const blanksInCode = (item.code.match(/___/g) ?? []).length;
  return (
    <>
      <RowList
        label={`${t.blanks} (${blanksInCode} in the program)`}
        rows={item.blanks}
        min={1}
        addLabel={t.addRow}
        onChange={(blanks) => set({ ...item, blanks })}
        blank={() => ({ accept: [''], wrongAnswers: [] })}
      >
        {(blank, index, setBlank) => (
          <div className="flex flex-col gap-3">
            <CsvField
              label={`${t.blankAccept} #${index + 1}`}
              value={blank.accept}
              onChange={(accept) => setBlank({ ...blank, accept })}
              error={errorAt(issues, `blanks.${index}.accept`)}
            />
            <WrongAnswers
              rows={blank.wrongAnswers}
              onChange={(wrongAnswers) => setBlank({ ...blank, wrongAnswers })}
              blank=""
              renderMatch={(match, setMatch) => (
                <Field label={t.wrongMatch}>
                  <Input value={match} onChange={(e) => setMatch(e.target.value)} />
                </Field>
              )}
            />
          </div>
        )}
      </RowList>
      <LinesField
        label={t.expectedOutput}
        value={item.expectedOutput}
        onChange={(expectedOutput) => set({ ...item, expectedOutput })}
        error={errorAt(issues, 'expectedOutput')}
        rows={3}
      />
    </>
  );
}

// ---------- put in order ----------

function ArrangeFields({ item, set, issues }: Props<ItemOf<'arrange-steps'>>) {
  const t = useStrings(studioStrings).editor;
  const mode = item.steps ? 'steps' : 'lines';
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t.stepsMode}</span>
        <Segmented
          label={t.stepsMode}
          value={mode}
          onChange={(next) => {
            if (next === mode) return;
            if (next === 'steps') {
              const { lines: _l, expectedOutput: _e, ...rest } = item;
              set({ ...rest, steps: [blankText(), blankText()] });
            } else {
              const { steps: _s, ...rest } = item;
              set({ ...rest, lines: ['', ''], expectedOutput: [''] });
            }
          }}
          options={[
            { value: 'lines', label: t.modeLines },
            { value: 'steps', label: t.modeSteps },
          ]}
        />
      </div>
      {mode === 'lines' ? (
        <>
          <LinesField
            label={t.lines}
            help={t.linesHelp}
            value={item.lines ?? []}
            onChange={(lines) => set({ ...item, lines })}
            error={errorAt(issues, 'lines')}
            rows={6}
          />
          <LinesField
            label={t.expectedOutput}
            value={item.expectedOutput ?? []}
            onChange={(expectedOutput) => set({ ...item, expectedOutput })}
            error={errorAt(issues, 'expectedOutput')}
            rows={3}
          />
        </>
      ) : (
        <RowList
          label={t.steps}
          rows={item.steps ?? []}
          min={2}
          max={8}
          addLabel={t.addRow}
          onChange={(steps: LocalizedText[]) => set({ ...item, steps })}
          blank={blankText}
        >
          {(step, i, setStep) => (
            <LText label={`${i + 1}`} value={step} onChange={setStep} issues={[]} path="s" />
          )}
        </RowList>
      )}
    </>
  );
}

// ---------- trace table ----------

function TraceFields({ item, set, issues }: Props<ItemOf<'trace-table'>>) {
  const t = useStrings(studioStrings).editor;
  const resize = (columns: string[]) =>
    set({
      ...item,
      columns,
      rows: item.rows.map((row) => columns.map((_, c) => row[c] ?? '')),
    });
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.traceLine} error={errorAt(issues, 'line')}>
          <Input
            type="number"
            min={1}
            value={item.line}
            onChange={(e) => set({ ...item, line: asInt(e.target.value, 1) })}
          />
        </Field>
        <CsvField
          label={t.columns}
          value={item.columns}
          onChange={resize}
          error={errorAt(issues, 'columns')}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.rows}</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-80 border-separate border-spacing-1">
            <thead>
              <tr>
                {item.columns.map((c, i) => (
                  <th key={i} scope="col" className="px-1 text-left font-mono text-xs text-muted">
                    {c}
                  </th>
                ))}
                <td />
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row, r) => (
                <tr key={r}>
                  {item.columns.map((_, c) => (
                    <td key={c}>
                      <Input
                        aria-label={`${item.columns[c]} ${r + 1}`}
                        value={row[c] ?? ''}
                        className="h-9 font-mono"
                        onChange={(e) =>
                          set({
                            ...item,
                            rows: item.rows.map((x, i) =>
                              i === r ? x.map((cell, j) => (j === c ? e.target.value : cell)) : x,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t.remove} ${r + 1}`}
                      disabled={item.rows.length <= 1}
                      onClick={() => set({ ...item, rows: item.rows.filter((_, i) => i !== r) })}
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={item.rows.length >= 10}
            onClick={() => set({ ...item, rows: [...item.rows, item.columns.map(() => '')] })}
          >
            {t.addRow}
          </Button>
        </div>
        {errorAt(issues, 'rows') && (
          <p className="text-xs font-medium text-danger">{errorAt(issues, 'rows')}</p>
        )}
      </fieldset>
    </>
  );
}

// ---------- truth table ----------

function TruthFields({ item, set, issues }: Props<ItemOf<'truth-table'>>) {
  const t = useStrings(studioStrings).editor;
  const combos = (n: number) =>
    Array.from({ length: 2 ** n }, (_, row) =>
      Array.from({ length: n }, (_, col) => ((row >> (n - 1 - col)) & 1) === 1),
    );
  const rows = combos(item.inputs.length);
  const retable = (inputs: string[], outputs: ItemOf<'truth-table'>['outputs']) =>
    set({
      ...item,
      inputs,
      outputs,
      rows: truthRows(inputs.length, outputs.length).map((blank, r) =>
        blank.map((cell, c) => item.rows[r]?.[c] ?? cell),
      ),
    });
  return (
    <>
      <CsvField
        label={t.inputs}
        value={item.inputs}
        onChange={(inputs) => retable(inputs.slice(0, 3), item.outputs)}
        error={errorAt(issues, 'inputs')}
      />
      <RowList
        label={t.outputs}
        rows={item.outputs}
        min={1}
        max={3}
        addLabel={t.addRow}
        onChange={(outputs) => retable(item.inputs, outputs)}
        blank={() => ({ label: '', expression: '' })}
      >
        {(output, _i, setOutput) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t.outputLabel}>
              <Input
                value={output.label}
                onChange={(e) => setOutput({ ...output, label: e.target.value })}
              />
            </Field>
            <Field label={t.outputExpr}>
              <Input
                className="font-mono"
                value={output.expression}
                onChange={(e) => setOutput({ ...output, expression: e.target.value })}
              />
            </Field>
          </div>
        )}
      </RowList>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.truthRows}</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-72 border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                {item.inputs.map((name, i) => (
                  <th
                    key={`i${i}`}
                    scope="col"
                    className="px-2 text-left font-mono text-xs text-muted"
                  >
                    {name}
                  </th>
                ))}
                {item.outputs.map((o, i) => (
                  <th key={`o${i}`} scope="col" className="px-2 text-left font-mono text-xs">
                    {o.label || '…'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((combo, r) => (
                <tr key={r}>
                  {combo.map((value, c) => (
                    <td key={c} className="px-2 font-mono text-muted">
                      {String(value)}
                    </td>
                  ))}
                  {item.outputs.map((_, c) => (
                    <td key={c}>
                      <Select
                        aria-label={`${item.outputs[c]?.label ?? ''} ${r + 1}`}
                        value={item.rows[r]?.[c] ?? 'false'}
                        className="h-9"
                        onChange={(e) =>
                          set({
                            ...item,
                            rows: item.rows.map((x, i) =>
                              i === r
                                ? x.map((cell, j) =>
                                    j === c ? (e.target.value as 'true' | 'false') : cell,
                                  )
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </Select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </>
  );
}

/** The whole question form: the shared fields, then the part that depends on the type. */
export function ItemFields({ item, set, issues, isNew }: Props<Item> & { isNew: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <BaseFields item={item} set={set} issues={issues} isNew={isNew} />
      {item.type === 'mcq' && (
        <McqFields item={item} set={set as (n: ItemOf<'mcq'>) => void} issues={issues} />
      )}
      {item.type === 'predict-output' && (
        <PredictFields
          item={item}
          set={set as (n: ItemOf<'predict-output'>) => void}
          issues={issues}
        />
      )}
      {item.type === 'fill-blank' && (
        <FillFields item={item} set={set as (n: ItemOf<'fill-blank'>) => void} issues={issues} />
      )}
      {item.type === 'arrange-steps' && (
        <ArrangeFields
          item={item}
          set={set as (n: ItemOf<'arrange-steps'>) => void}
          issues={issues}
        />
      )}
      {item.type === 'trace-table' && (
        <TraceFields item={item} set={set as (n: ItemOf<'trace-table'>) => void} issues={issues} />
      )}
      {item.type === 'truth-table' && (
        <TruthFields item={item} set={set as (n: ItemOf<'truth-table'>) => void} issues={issues} />
      )}
    </div>
  );
}
