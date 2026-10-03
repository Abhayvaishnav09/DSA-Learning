import type { Locale } from '../engine';
import { ALGORITHMS } from '../python/algorithms';
import type { Complexity, MeasuredCase } from '../python/complexity';
import type { Recognised } from '../python/toFrames';
import { verdict, type Derived, type DerivedStep, type Verdict } from '../python/verdict';

type Both = Record<Locale, string>;

const CASES: Record<string, Both> = {
  first: { en: 'Key in the first place', 'hi-Latn': 'Target pehli position par' },
  middle: { en: 'Key in the middle', 'hi-Latn': 'Target beech me' },
  last: { en: 'Key in the last place', 'hi-Latn': 'Target aakhri position par' },
  missing: { en: 'Key not in the list', 'hi-Latn': 'Target list me hai hi nahi' },
  typical: { en: 'Like your input', 'hi-Latn': 'Tumhare input jaisa' },
  sorted: { en: 'Already sorted list', 'hi-Latn': 'Pehle se sorted list' },
  reversed: { en: 'Reversed list', 'hi-Latn': 'Ulti list' },
  shuffled: { en: 'Mixed-up list', 'hi-Latn': 'Mili-juli list' },
  even: { en: 'n = 2, 4, 8, … (even)', 'hi-Latn': 'n = 2, 4, 8, … (even)' },
  prime: { en: 'n is a prime number', 'hi-Latn': 'n ek prime number' },
  graph: { en: 'Bigger and bigger graph', 'hi-Latn': 'Bada hota graph' },
  same: { en: 'One letter repeated (aaaa…)', 'hi-Latn': 'Ek hi letter (aaaa…)' },
  mixed: { en: 'Mixed letters', 'hi-Latn': 'Mile-jule letters' },
};

/** "n times" for O(n), "a fixed number of" for O(1). */
const times = (label: string | undefined, locale: Locale) => {
  if (!label || label === 'O(1)') return locale === 'en' ? 'a fixed number of' : 'fixed (kuch hi)';
  return label.slice(2, -1);
};

function stepText(s: DerivedStep, locale: Locale): string {
  const en = locale === 'en';
  const it = times(s.iters, locale);
  const each = en ? `each round ${s.body} → ${s.cost}` : `har round ${s.body} → kul ${s.cost}`;
  switch (s.kind) {
    case 'for':
      return en ? `runs ${it} times; ${each}.` : `${it} baar chalta hai; ${each}.`;
    case 'while-halve':
      return en
        ? `what is left halves every round → log n rounds; ${each}.`
        : `har round me bacha hissa aadha → log n round; ${each}.`;
    case 'while-mod':
      return en
        ? `a % b shrinks the numbers at least as fast as halving → log n rounds; ${each}.`
        : `a % b numbers ko aadha karne jitni tezi se chhota karta hai → log n round; ${each}.`;
    case 'while-sqrt':
      return en
        ? `i * i <= n stops at √n → √n rounds; ${each}.`
        : `i * i <= n, √n par ruk jaata hai → √n round; ${each}.`;
    case 'while-step':
      return en
        ? `the counter moves one step at a time → n rounds; ${each}.`
        : `counter ek-ek kadam badhta hai → n round; ${each}.`;
    case 'while-constant':
      return en
        ? `stops at a fixed number → a fixed number of rounds; ${each}.`
        : `ek fixed number par rukta hai → fixed round; ${each}.`;
    case 'while-drain':
      return en
        ? `takes one item out per round and each item goes in once → n rounds in all; ${each}.`
        : `har round ek item nikalta hai aur har item ek hi baar andar jaata hai → kul n round; ${each}.`;
    case 'while-unknown':
      return en
        ? `how many rounds depends on the data; counted as n, not certain; ${each}.`
        : `kitne round chalega yeh data par depend karta hai; n maana, pakka nahi; ${each}.`;
    case 'builtin':
      return s.name === 'sort' || s.name === 'sorted'
        ? en
          ? `${s.name}() sorts inside Python → O(n log n).`
          : `${s.name}() Python ke andar sort karta hai → O(n log n).`
        : en
          ? `${s.name}() goes through the whole list inside Python → O(n).`
          : `${s.name}() Python ke andar poori list dekhta hai → O(n).`;
    case 'in-list':
      return en
        ? '"in" on a list checks the items one by one → O(n). (A set would make it O(1).)'
        : 'list par "in" items ko ek-ek karke dekhta hai → O(n). (set ho to O(1).)';
    case 'slice':
      return en ? 'slicing copies the items → O(n).' : 'slice items ki copy banata hai → O(n).';
    case 'call':
      return en ? `calls ${s.fn}() → ${s.cost}.` : `${s.fn}() call karta hai → ${s.cost}.`;
    case 'comprehension':
      return en
        ? `the comprehension runs once per item → ${s.cost}.`
        : `comprehension har item par ek baar chalti hai → ${s.cost}.`;
    case 'harmonic':
      return en
        ? `for each i the inner loop runs n / i times; added up (n/2 + n/3 + n/5 …) that is ${s.cost}.`
        : `har i ke liye andar ka loop n / i baar; sab jodo (n/2 + n/3 + n/5 …) to ${s.cost}.`;
    case 'recursion-step':
      return en
        ? `${s.fn}() calls itself once on a smaller input (n − 1) → n calls × ${s.work} → ${s.cost}.`
        : `${s.fn}() khud ko ek baar chhote input (n − 1) par call karta hai → n calls × ${s.work} → ${s.cost}.`;
    case 'recursion-branching':
      return en
        ? `${s.fn}() calls itself ${s.calls} times on a smaller input; the calls double at every level → ${s.cost}.`
        : `${s.fn}() khud ko ${s.calls} baar chhote input par call karta hai; har level par calls double → ${s.cost}.`;
    case 'recursion-half':
      return en
        ? `${s.fn}() calls itself ${s.calls} time(s) on half the input with ${s.work} extra work per call (master theorem) → ${s.cost}.`
        : `${s.fn}() khud ko ${s.calls} baar aadhe input par call karta hai, har call me ${s.work} extra kaam (master theorem) → ${s.cost}.`;
    case 'recursion-mod':
      return en
        ? `${s.fn}() calls itself with a % b, which shrinks like halving → ${s.cost}.`
        : `${s.fn}() khud ko a % b ke saath call karta hai, jo aadha karne jaisa chhota karta hai → ${s.cost}.`;
    case 'recursion-memo':
      return en
        ? `${s.fn}() remembers its answers, so each value is worked out once → ${s.cost}.`
        : `${s.fn}() jawab yaad rakhta hai, isliye har value ek hi baar nikalti hai → ${s.cost}.`;
    case 'recursion-graph':
      return en
        ? `${s.fn}() enters each node once (visited) and looks at each edge once → ${s.cost}.`
        : `${s.fn}() har node me ek baar jaata hai (visited) aur har edge ek baar dekhta hai → ${s.cost}.`;
    case 'recursion-partition':
      return en
        ? `${s.fn}() splits around a pivot: halves when lucky (n log n), one item off when not → worst ${s.cost}.`
        : `${s.fn}() pivot ke aas-paas todta hai: lucky ho to aadha (n log n), warna sirf ek item alag → worst ${s.cost}.`;
    default:
      return en
        ? `${s.fn ?? ''}() calls itself; how fast the input shrinks is not clear, counted as ${s.cost}, not certain.`
        : `${s.fn ?? ''}() khud ko call karta hai; input kitni tezi se chhota hota hai saaf nahi, ${s.cost} maana, pakka nahi.`;
  }
}

function verdictText(v: Verdict, derived: Derived | null | undefined, locale: Locale): string {
  const en = locale === 'en';
  const { growth: g, derived: d, measured: m } = v;
  const lines = derived?.unsure.join(', ');
  switch (v.reason) {
    case 'both':
      return en
        ? `Certain: the code's structure (worked out below) and the real runs both give ${g}.`
        : `Pakka: code ki banawat (neeche ka hisaab) aur asli runs, dono ${g} kehte hain.`;
    case 'hidden':
      return en
        ? `${g}. Counting lines gave ${m}, but built-ins like sorted() or "in" do their work inside Python, where lines are not counted. The structure below adds that work back.`
        : `${g}. Lines ginne se ${m} aaya, par sorted() ya "in" jaise built-ins apna kaam Python ke andar karte hain, jahan lines nahi gini jaatin. Neeche ka hisaab woh kaam bhi jodta hai.`;
    case 'close':
      return en
        ? `${g}. On these inputs n and n log n look almost the same (measured ${m}); the structure below settles it.`
        : `${g}. In inputs par n aur n log n lagbhag ek jaise dikhte hain (naap ${m}); neeche ka hisaab faisla karta hai.`;
    case 'inputs':
      return en
        ? `${g} (from the structure). The runs measured ${m}: the inputs tried never reached the worst case, which the structure below shows.`
        : `${g} (banawat se). Runs me ${m} aaya: try kiye gaye inputs worst case tak nahi pahunche, jo neeche ka hisaab dikhata hai.`;
    case 'measured-more':
      return en
        ? `${g} (measured). The structure suggested ${d}, but the real runs did more work, so the measurement is trusted.`
        : `${g} (naap se). Banawat se ${d} lag raha tha, par asli runs ne zyada kaam kiya, isliye naap par bharosa.`;
    case 'unsure':
      return m
        ? en
          ? `${g} (measured). Line ${lines}: how often it repeats depends on the data, which the structure alone cannot settle.`
          : `${g} (naap se). Line ${lines}: kitni baar chalegi yeh data par depend karta hai, jo sirf banawat se tay nahi hota.`
        : en
          ? `About ${g}, not certain: line ${lines} repeats a number of times that depends on the data.`
          : `Lagbhag ${g}, pakka nahi: line ${lines} kitni baar chalegi yeh data par depend karta hai.`;
    case 'derived':
      return en
        ? `${g} (from the structure below). There was no input to make bigger, so it was not also measured.`
        : `${g} (neeche ke hisaab se). Badhane layak input nahi mila, isliye naap nahi hua.`;
    case 'measured':
      return en ? `${g} (measured on real runs).` : `${g} (asli runs ka naap).`;
  }
}

const T = {
  en: {
    answer: 'Big-O of your code',
    certain: 'certain',
    likely: 'best estimate',
    best: 'Best case',
    worst: 'Worst case',
    derivation: 'Worked out from the code',
    line: (n: number) => `Line ${n}`,
    measuredTitle: 'Measured on real runs',
    measuring: 'Measuring: running your code on bigger and bigger inputs…',
    nothing: 'Nothing to grow here, so only the structure is used.',
    failed: 'The measurement did not finish; the structure is used.',
    how: (what: string, from: number, to: number, runs: number) =>
      `We made ${what} go from ${from} to ${to}, ran your code ${runs} times and counted the lines that ran.`,
    called: (call: string) => `Your file only defines functions, so we called ${call} ourselves.`,
    fedInput: 'input() was answered with made-up values of each size.',
    unknown: 'unclear',
    steps: (n: number, s: number) => `n = ${n}: ${s.toLocaleString('en')} steps`,
    capped: 'grew past the step limit',
    looksLike: 'Looks like',
    textbook: (best: string, worst: string) => `Textbook: best ${best}, worst ${worst}.`,
    agrees: 'Matches the textbook.',
    differs: (yours: string, book: string) =>
      `Yours is ${yours}, the textbook version is ${book}: your code does it differently.`,
    chart: 'Steps for each input size',
    numbers: 'See the numbers',
    size: 'n',
    partial: 'Stopped early to stay fast; the fit uses the sizes that finished.',
  },
  'hi-Latn': {
    answer: 'Tumhare code ka Big-O',
    certain: 'pakka',
    likely: 'sabse achha andaza',
    best: 'Best case',
    worst: 'Worst case',
    derivation: 'Code se hisaab',
    line: (n: number) => `Line ${n}`,
    measuredTitle: 'Asli runs ka naap',
    measuring: 'Naap rahe hain: tumhara code bade-bade inputs par chala rahe hain…',
    nothing: 'Badhane layak input nahi mila, isliye sirf banawat ka hisaab use hua.',
    failed: 'Naap poora nahi hua; banawat ka hisaab use hua.',
    how: (what: string, from: number, to: number, runs: number) =>
      `${what} ko ${from} se ${to} tak badhaya, tumhara code ${runs} baar chalaya aur har baar chali hui lines gini.`,
    called: (call: string) =>
      `Tumhari file me sirf functions hain, isliye humne khud ${call} call kiya.`,
    fedInput: 'input() ko humne har size ki values di.',
    unknown: 'saaf nahi',
    steps: (n: number, s: number) => `n = ${n} par ${s.toLocaleString('en')} steps`,
    capped: 'step limit se aage chala gaya',
    looksLike: 'Yeh lagta hai',
    textbook: (best: string, worst: string) => `Textbook: best ${best}, worst ${worst}.`,
    agrees: 'Textbook se milta hai.',
    differs: (yours: string, book: string) =>
      `Tumhara ${yours} hai, textbook wala ${book}: tumhara code alag tareeke se karta hai.`,
    chart: 'Har input size par steps',
    numbers: 'Numbers dekho',
    size: 'n',
    partial: 'Tez rehne ke liye jaldi roka; jo sizes poore hue unhi se fit kiya.',
  },
};

const COLORS = ['text-accent', 'text-danger', 'text-success', 'text-warning', 'text-fg'];

export interface InsightsProps {
  algorithms: Recognised[];
  /** Big-O from the code's shape, available at once. */
  derived?: Derived | null;
  /** undefined = still measuring, null = nothing to measure. */
  complexity: Complexity | null | undefined;
  failed?: boolean;
  locale: Locale;
}

/** "Which algorithm is this, what is its Big-O, and how do we know?" next to the player. */
export function Insights({
  algorithms,
  derived,
  complexity,
  failed = false,
  locale,
}: InsightsProps) {
  const t = T[locale];
  const known = algorithms.filter((a) => ALGORITHMS[a.id]);
  const measuring = complexity === undefined && !failed;
  const answer = verdict(derived, failed ? null : complexity);
  const best = derived?.best ?? complexity?.best.growth ?? null;
  return (
    <div className="flex flex-col gap-4" data-testid="insights">
      {answer && (
        <section
          className={`flex flex-col gap-2 rounded-2xl border-2 p-4 ${answer.certain ? 'border-success bg-success-soft' : 'border-warning bg-warning-soft'}`}
          aria-label={t.answer}
          data-testid="verdict"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t.answer}</h3>
            <span
              className="rounded-lg border-2 border-accent bg-surface px-3 py-1 font-mono text-lg font-bold text-accent"
              data-testid="big-o"
            >
              {answer.growth}
            </span>
            <span className="text-xs font-semibold uppercase">
              {answer.certain ? `✓ ${t.certain}` : t.likely}
            </span>
          </div>
          <p className="text-sm" data-testid="verdict-text">
            {verdictText(answer, derived, locale)}
          </p>
          {best && (
            <p className="font-mono text-sm">
              {t.best}: {best} · {t.worst}: {answer.growth}
            </p>
          )}
          {measuring && (
            <p className="text-xs text-muted" role="status">
              {t.measuring}
            </p>
          )}
        </section>
      )}

      {known.map((found) => {
        const notes = ALGORITHMS[found.id]!;
        const yours = answer?.growth;
        return (
          <section
            key={found.id + found.fn}
            className="rounded-2xl border border-border bg-surface p-4"
            data-testid="algorithm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t.looksLike}
            </p>
            <h3 className="text-lg font-bold">
              {notes.name[locale]}
              {found.fn && <span className="ml-2 font-mono text-sm text-muted">{found.fn}()</span>}
            </h3>
            <p className="mt-1">{notes.idea[locale]}</p>
            <p className="mt-2 text-sm text-muted">
              {t.textbook(notes.best.growth, notes.worst.growth)} {notes.worst.why[locale]}{' '}
              {notes.watch[locale]}
            </p>
            {yours && (
              <p
                className={`mt-2 text-sm font-medium ${yours === notes.worst.growth ? 'text-success' : 'text-warning'}`}
              >
                {yours === notes.worst.growth
                  ? `✓ ${t.agrees}`
                  : `⚠ ${t.differs(yours, notes.worst.growth)}`}
              </p>
            )}
          </section>
        );
      })}

      {derived && derived.steps.length > 0 && (
        <section
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
          aria-label={t.derivation}
          data-testid="derivation"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t.derivation}
          </h3>
          <ol className="flex flex-col gap-2 text-sm">
            {derived.steps.map((s, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-muted">
                  {t.line(s.line)}: <code className="text-fg">{s.code}</code>
                </span>
                <span>{stepText(s, locale)}</span>
              </li>
            ))}
          </ol>
          <p className="font-mono text-sm font-bold">
            = {derived.worst}
            {derived.best !== derived.worst && ` (${t.best}: ${derived.best})`}
          </p>
        </section>
      )}

      <section
        className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
        aria-label={t.measuredTitle}
        data-testid="complexity-measured"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t.measuredTitle}
          </h3>
          {complexity && (
            <span className="font-mono font-bold text-accent" data-testid="measured-o">
              {complexity.overall ?? t.unknown}
            </span>
          )}
        </div>
        {failed ? (
          <p className="text-sm text-muted">{t.failed}</p>
        ) : complexity === undefined ? (
          <p className="text-sm text-muted">{t.measuring}</p>
        ) : complexity === null ? (
          <p className="text-sm text-muted">{t.nothing}</p>
        ) : (
          <Measured complexity={complexity} locale={locale} />
        )}
      </section>
    </div>
  );
}

function Measured({ complexity, locale }: { complexity: Complexity; locale: Locale }) {
  const t = T[locale];
  const runs = complexity.cases.reduce((s, c) => s + c.points.length, 0);
  const sizes = complexity.cases.flatMap((c) => c.points.map(([n]) => n));
  return (
    <>
      {complexity.call && <p className="text-sm">{t.called(complexity.call)}</p>}
      {complexity.mode === 'input' && <p className="text-sm">{t.fedInput}</p>}
      <p className="text-sm">
        {t.how(complexity.scaled.join(', '), Math.min(...sizes), Math.max(...sizes), runs)}
      </p>
      {complexity.cases.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <CaseCard title={t.best} found={complexity.best} locale={locale} />
          <CaseCard title={t.worst} found={complexity.worst} locale={locale} />
        </div>
      )}
      <Chart complexity={complexity} locale={locale} />
      <details className="text-sm">
        <summary className="cursor-pointer text-accent">{t.numbers}</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left font-mono text-xs">
            <thead>
              <tr>
                <th className="pr-2">{t.size}</th>
                {complexity.cases.map((c) => (
                  <th key={c.label} className="pr-2">
                    {CASES[c.label]?.[locale] ?? c.label} ({c.growth ?? t.unknown})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(sizes)]
                .sort((a, b) => a - b)
                .map((n) => (
                  <tr key={n}>
                    <td className="pr-2">{n}</td>
                    {complexity.cases.map((c) => (
                      <td key={c.label} className="pr-2">
                        {c.points.find(([m]) => m === n)?.[1] ?? '–'}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
      {complexity.partial && <p className="text-xs text-muted">{t.partial}</p>}
    </>
  );
}

function CaseCard({
  title,
  found,
  locale,
}: {
  title: string;
  found: MeasuredCase;
  locale: Locale;
}) {
  const t = T[locale];
  return (
    <div className="rounded-xl border border-border bg-bg p-3" data-testid={`case-${title}`}>
      <div className="flex items-center justify-between gap-2">
        <strong>{title}</strong>
        <span className="font-mono font-bold text-accent">{found.growth ?? t.unknown}</span>
      </div>
      <p className="text-sm">{CASES[found.label]?.[locale] ?? found.label}</p>
      <p className="font-mono text-xs text-muted">
        {t.steps(found.n, found.steps)}
        {found.capped && `, ${t.capped}`}
      </p>
    </div>
  );
}

/** Steps against input size, one line per case. The table has the same numbers. */
function Chart({ complexity, locale }: { complexity: Complexity; locale: Locale }) {
  const W = 320;
  const H = 150;
  const P = 28;
  const points = complexity.cases.flatMap((c) => c.points);
  const maxN = Math.max(...points.map(([n]) => n));
  const minN = Math.min(...points.map(([n]) => n));
  const maxS = Math.max(...points.map(([, s]) => s));
  // Sizes double, so a log scale spreads them out evenly.
  const lx = (n: number) => Math.log2(Math.max(1, n));
  const x = (n: number) =>
    P + ((lx(n) - lx(minN)) / Math.max(1e-9, lx(maxN) - lx(minN))) * (W - P - 8);
  const y = (s: number) => H - P - (s / Math.max(1, maxS)) * (H - P - 8);
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-md"
        role="img"
        aria-label={T[locale].chart}
      >
        <line x1={P} y1={H - P} x2={W - 4} y2={H - P} className="stroke-border" strokeWidth={1} />
        <line x1={P} y1={4} x2={P} y2={H - P} className="stroke-border" strokeWidth={1} />
        <text x={P} y={H - 8} className="fill-muted text-[10px]">
          n = {minN}
        </text>
        <text x={W - 4} y={H - 8} textAnchor="end" className="fill-muted text-[10px]">
          n = {maxN}
        </text>
        <text x={P - 4} y={12} textAnchor="end" className="fill-muted text-[10px]">
          {maxS}
        </text>
        {complexity.cases.map((c, i) => (
          <polyline
            key={c.label}
            points={c.points.map(([n, s]) => `${x(n)},${y(s)}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={COLORS[i % COLORS.length]}
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {complexity.cases.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1">
            <span
              className={`inline-block h-1 w-4 rounded bg-current ${COLORS[i % COLORS.length]}`}
            />
            {CASES[c.label]?.[locale] ?? c.label}: {c.growth ?? T[locale].unknown}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
