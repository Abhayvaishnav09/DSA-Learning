'use client';

import { Button, Callout, Field, PageHeader, Segmented, Select, Textarea } from '@logicpath/ui';
import {
  PYODIDE_VERSION,
  PythonUnavailableError,
  measurePython,
  tracePython,
  type Complexity,
  type Derived,
  type PythonStatus,
  type Recognised,
} from '@logicpath/visualizer/python';
import { Insights, Visualizer } from '@logicpath/visualizer/react';
import { viewPseudocode, type ViewFrame } from '@logicpath/visualizer/view';
import { Play, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { FIRST_DRAFT, useDraft } from './draft';
import { EXAMPLES, type CodeLanguage } from './examples';
import { visualizeStrings } from './strings';

const MAX_BYTES = 50 * 1024;
/** Python's files are served by this site (copied from the pyodide package at build time). */
const PYODIDE_URL = process.env.NEXT_PUBLIC_PYODIDE_URL ?? `/pyodide/${PYODIDE_VERSION}/`;

interface Result {
  run: number;
  language: CodeLanguage;
  code: string;
  frames: ViewFrame[];
  algorithms: Recognised[];
  /** Big-O from the code's shape; null when the code did not parse. */
  derived: Derived | null;
  /** undefined while measuring, null when there is nothing to measure. */
  complexity?: Complexity | null;
  measureFailed?: boolean;
}

/**
 * Paste or upload a program and watch it run, with the same player as the lessons.
 * Python runs for real in the learner's own browser (a Worker); nothing is sent anywhere.
 */
export function VisualizeScreen() {
  const t = useStrings(visualizeStrings);
  const locale = useLocale();
  const saved = useDraft();
  const update = saved.update;
  // Until hydration the server's first example shows, so both renders match.
  const draft = useHydrated() ? saved : FIRST_DRAFT;
  const [status, setStatus] = useState<PythonStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const runs = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async () => {
    const { language, code, stdin } = draft;
    setProblem(null);
    if (!code.trim()) {
      setProblem(t.empty);
      return;
    }
    const id = ++runs.current;
    try {
      let frames: ViewFrame[];
      let algorithms: Recognised[] = [];
      let derived: Derived | null = null;
      if (language === 'python') {
        ({ frames, algorithms, derived } = await tracePython(code, {
          baseUrl: PYODIDE_URL,
          stdin,
          onStatus: setStatus,
        }));
      } else {
        try {
          frames = viewPseudocode(code);
        } catch (error) {
          setProblem(t.pseudoError(error instanceof Error ? error.message : String(error)));
          setResult(null);
          return;
        }
      }
      if (id !== runs.current) return;
      setResult({ run: id, language, code, frames, algorithms, derived });
      // Then, in the background: how does the work grow? It makes up its own inputs, so a
      // run that stopped (say input() with an empty Input box) is still measured.
      if (language === 'python' && derived) {
        setStatus(null);
        measurePython(code, { baseUrl: PYODIDE_URL, stdin })
          .then((complexity) => {
            if (id === runs.current) setResult((r) => r && { ...r, complexity });
          })
          .catch(() => {
            if (id === runs.current) setResult((r) => r && { ...r, measureFailed: true });
          });
      }
    } catch (error) {
      if (id === runs.current)
        setProblem(error instanceof PythonUnavailableError ? t.unavailable : String(error));
    } finally {
      if (id === runs.current) setStatus(null);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setProblem(t.tooBig);
      return;
    }
    const text = await file.text();
    // A NUL byte means a binary file (an image, a .pyc), not a program.
    if (text.includes('\u0000')) {
      setProblem(t.notText);
      return;
    }
    setProblem(null);
    update({
      code: text.replace(/\r\n?/g, '\n'),
      language: /\.py$/i.test(file.name) ? 'python' : draft.language,
    });
  };

  const examples = EXAMPLES.filter((e) => e.language === draft.language);
  const lastFrame = result?.frames.at(-1);
  const busy = status !== null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />

      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t.language}</span>
            <Segmented<CodeLanguage>
              label={t.language}
              value={draft.language}
              options={[
                { value: 'python', label: t.python },
                { value: 'pseudocode', label: t.pseudocode },
              ]}
              onChange={(language) => update({ language })}
            />
          </div>
          <Field label={t.example} className="min-w-56 flex-1">
            <Select
              value=""
              onChange={(e) => {
                const example = EXAMPLES.find((x) => x.id === e.target.value);
                if (example) update({ code: example.code, language: example.language });
              }}
              data-testid="viz-example"
            >
              <option value="">{t.examplePick}</option>
              {examples.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title[locale]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t.code} description={t.limits}>
          <Textarea
            value={draft.code}
            onChange={(e) => update({ code: e.target.value })}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={14}
            maxLength={MAX_BYTES}
            className="font-mono text-sm"
            data-testid="viz-code"
          />
        </Field>

        {draft.language === 'python' && (
          <Field label={t.input} description={t.inputHelp}>
            <Textarea
              value={draft.stdin}
              onChange={(e) => update({ stdin: e.target.value })}
              spellCheck={false}
              rows={2}
              className="min-h-0 font-mono text-sm"
              data-testid="viz-stdin"
            />
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} loading={busy} leftIcon={<Play />} data-testid="viz-run">
            {t.run}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Upload />}
            onClick={() => fileInput.current?.click()}
          >
            {t.upload}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".py,.txt,text/plain,text/x-python"
            className="sr-only"
            tabIndex={-1}
            aria-label={t.upload}
            onChange={onFile}
            data-testid="viz-file"
          />
          <span className="text-xs text-muted">{t.uploadHelp}</span>
        </div>
        {status && (
          <p className="text-sm text-muted" role="status">
            {status === 'loading' ? t.loading : t.running}
          </p>
        )}
        {problem && <Callout tone="danger">{problem}</Callout>}
      </section>

      {result && (
        <section className="flex flex-col gap-3" aria-live="polite">
          {lastFrame?.error && <Callout tone="warning">{t.stoppedEarly}</Callout>}
          <Visualizer
            key={result.run}
            source={result.code}
            frames={result.frames}
            locale={locale}
            quoteText={result.language === 'python'}
          />
          {result.language === 'python' && result.derived && (
            <Insights
              algorithms={result.algorithms}
              derived={result.derived}
              complexity={result.complexity}
              failed={result.measureFailed}
              locale={locale}
            />
          )}
        </section>
      )}
    </div>
  );
}
