'use client';

import { Badge, Button, cn, ProgressBar, Segmented, Sheet } from '@logicpath/ui';
import { m } from '@logicpath/ui/motion';
import { Box, Map as MapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useConceptViews, type ConceptView } from '@/entities/progress/selectors';
import { bundle, getConcept, text } from '@/shared/content/bundle';
import { useLocale, useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { useMediaQuery } from '@/shared/lib/useMediaQuery';
import { useTier } from '@/shared/three/quality';
import { layoutMap, pathOrder, type MapLayout } from './layout';
import type { NodeState } from './MapScene';

const MapScene = dynamic(() => import('./MapScene'), { ssr: false });

const stateOf = (view: ConceptView): NodeState => (view.concept.published ? view.status : 'soon');

/**
 * The learning path as a map: 3D islands on capable devices, a flat map otherwise (or by
 * choice). Either way, selecting a concept opens its sheet, and `?concept=` deep-links to it.
 */
export function MapPanel() {
  const t = useT();
  const locale = useLocale();
  const tier = useTier();
  const router = useRouter();
  const pathname = usePathname();
  const selected = useSearchParams().get('concept');
  const views = useConceptViews();
  const layout = useMemo(() => layoutMap(bundle.stages, bundle.concepts), []);
  const order = useMemo(() => pathOrder(layout), [layout]);
  const states = useMemo(
    () =>
      Object.fromEntries(views.map((v) => [v.concept.id, stateOf(v)])) as Record<string, NodeState>,
    [views],
  );

  const [choice, setChoice] = useState<'3d' | 'flat' | null>(null);
  const view = choice ?? (tier === 'high' || tier === 'low' ? '3d' : 'flat');
  const can3d = tier === 'high' || tier === 'low';

  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const label = useRef<HTMLDivElement>(null);

  const open = useCallback(
    (id: string | null) => router.replace(id ? routes.concept(id) : pathname),
    [router, pathname],
  );

  const name = (id: string) => text(getConcept(id)!.title, locale);
  const status = (id: string) => t.map.status[states[id] ?? 'locked'];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const i = focus ? order.indexOf(focus) : -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      setFocus(order[(i + 1) % order.length]!);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      setFocus(order[(i - 1 + order.length) % order.length]!);
    else if (event.key === 'Enter' && focus) open(focus);
    else return;
    event.preventDefault();
  };

  const shown = hover ?? focus;

  return (
    <section aria-labelledby="map-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="map-title" className="text-xl font-bold">
          {t.map.mapTitle}
        </h2>
        {can3d && (
          <Segmented
            label={t.map.viewLabel}
            value={view}
            onChange={setChoice}
            options={[
              {
                value: '3d',
                label: (
                  <>
                    <Box aria-hidden /> {t.map.view3d}
                  </>
                ),
              },
              {
                value: 'flat',
                label: (
                  <>
                    <MapIcon aria-hidden /> {t.map.view2d}
                  </>
                ),
              },
            ]}
          />
        )}
      </div>
      {/* One focusable widget with arrow-key navigation; the concept list below is the full text alternative. */}
      {/* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */}
      <div
        role="group"
        aria-roledescription={t.map.mapTitle}
        aria-label={t.map.mapHint}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-testid="learning-map"
        data-view={view}
        /* eslint-enable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */
        className="relative h-[24rem] overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-hero-from via-bg-elevated to-hero-to shadow-raised tablet:h-[28rem] desktop:h-[32rem]"
      >
        {view === '3d' && tier && tier !== 'lite' ? (
          <MapScene
            layout={layout}
            states={states}
            focusId={selected ?? focus}
            hoverId={shown}
            onHover={setHover}
            onSelect={(id) => open(id)}
            tier={tier}
            onProject={(_, x, y) => {
              if (label.current)
                label.current.style.transform = `translate(${x}px, ${y - 42}px) translate(-50%, -100%)`;
            }}
          />
        ) : (
          <FlatMap
            layout={layout}
            states={states}
            hoverId={shown}
            onHover={setHover}
            onSelect={(id) => open(id)}
          />
        )}
        {view === '3d' && shown && (
          <div
            ref={label}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 rounded-xl border border-border bg-surface/95 px-3 py-1.5 text-sm font-semibold shadow-floating backdrop-blur"
          >
            {name(shown)} <span className="font-normal text-muted">· {status(shown)}</span>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 left-4 hidden text-xs text-muted tablet:block">
          {t.map.mapHint}
        </p>
        <p className="sr-only" aria-live="polite">
          {focus ? t.map.announce(name(focus), status(focus)) : ''}
        </p>
      </div>
      <ConceptSheet id={selected} views={views} onClose={() => open(null)} />
    </section>
  );
}

/**
 * The same map, flat: SVG bridges with real buttons on top, so it works with any input.
 * Stages run left to right on wide screens and top to bottom on phones.
 */
function FlatMap({
  layout,
  states,
  hoverId,
  onHover,
  onSelect,
}: {
  layout: MapLayout;
  states: Record<string, NodeState>;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const locale = useLocale();
  const vertical = useMediaQuery('(width < 600px)');
  const count = layout.islands.length;
  // Island centres along the main axis, alternating sides on the other axis (in % of the panel).
  const centre = (index: number) => {
    const along = 12 + ((index + 0.5) / count) * 76;
    const across = 50 + (index % 2 === 0 ? -12 : 12);
    return vertical ? { x: across, y: along } : { x: along, y: across };
  };
  // Ring offsets from the 3D layout, scaled so each island's ring fits its share of the panel.
  const spread = vertical ? { x: 9, y: 22 / count } : { x: 26 / count, y: 9 };
  const nodes = layout.nodes.map((n) => {
    const index = layout.islands.findIndex((i) => i.stageId === n.stageId);
    const island = layout.islands[index]!;
    const c = centre(index);
    const dx = (n.position[0] - island.center[0]) / Math.max(1, island.radius - 1.1);
    const dz = (n.position[2] - island.center[2]) / Math.max(1, island.radius - 1.1);
    return { ...n, x: c.x + dx * spread.x, y: c.y + dz * spread.y };
  });
  const point = (id: string) => nodes.find((n) => n.id === id)!;
  const tone: Record<NodeState, string> = {
    locked: 'bg-surface-2 text-subtle border-border-strong',
    soon: 'bg-surface text-subtle border-dashed border-border-strong',
    available: 'bg-accent text-accent-fg border-accent shadow-glow',
    learning: 'bg-accent-2 text-white border-accent-2',
    mastered: 'bg-xp text-white border-xp',
  };
  return (
    <div className="absolute inset-0" data-testid="flat-map">
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {layout.islands.map((island, i) => {
          const c = centre(i);
          return (
            <ellipse
              key={island.stageId}
              cx={c.x}
              cy={c.y}
              rx={spread.x * 1.6}
              ry={spread.y * 1.6}
              className="fill-surface/80 stroke-border"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {layout.edges.map((e) => {
          const a = point(e.from);
          const b = point(e.to);
          const learned = states[e.from] === 'learning' || states[e.from] === 'mastered';
          return (
            <m.path
              key={`${e.from}-${e.to}`}
              d={`M${a.x},${a.y} Q${(a.x + b.x) / 2 + (vertical ? 8 : 0)},${(a.y + b.y) / 2 - (vertical ? 0 : 8)} ${b.x},${b.y}`}
              fill="none"
              strokeWidth={learned ? 3 : 2}
              strokeLinecap="round"
              className={learned ? 'stroke-accent' : 'stroke-border-strong'}
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: learned ? 1 : 0.7 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const state = states[n.id] ?? 'locked';
        return (
          <m.button
            key={n.id}
            type="button"
            tabIndex={-1}
            onClick={() => onSelect(n.id)}
            onPointerEnter={() => onHover(n.id)}
            onPointerLeave={() => onHover(null)}
            aria-label={text(getConcept(n.id)!.title, locale)}
            title={text(getConcept(n.id)!.title, locale)}
            className={cn(
              'absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold transition-transform tablet:size-11',
              tone[state],
              hoverId === n.id && 'scale-125',
            )}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.03, type: 'spring', stiffness: 400, damping: 22 }}
          >
            {state === 'mastered' ? '★' : n.stageId}
          </m.button>
        );
      })}
    </div>
  );
}

function ConceptSheet({
  id,
  views,
  onClose,
}: {
  id: string | null;
  views: ConceptView[];
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const view = views.find((v) => v.concept.id === id);
  const lesson = id ? bundle.lessons[id] : undefined;
  return (
    <Sheet
      open={!!view}
      onOpenChange={(o) => !o && onClose()}
      title={view ? text(view.concept.title, locale) : ''}
      description={view ? t.map.stage(view.concept.stage) : undefined}
    >
      {view && (
        <div className="flex flex-col gap-5" data-testid="concept-sheet">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                view.status === 'mastered'
                  ? 'success'
                  : view.status === 'locked'
                    ? 'neutral'
                    : 'accent'
              }
            >
              {t.map.status[stateOf(view)]}
            </Badge>
            {view.minutes && <Badge>{t.map.minutes(view.minutes)}</Badge>}
          </div>
          {lesson && <p className="text-muted">{text(lesson.story.title, locale)}</p>}
          {(view.status === 'learning' || view.status === 'mastered') && (
            <ProgressBar
              value={view.knowledge}
              label={t.map.knowledge(view.knowledge)}
              tone={view.status === 'mastered' ? 'success' : 'accent'}
            />
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-subtle">
              {t.map.buildsOn}
            </h3>
            {view.concept.prerequisites.length === 0 ? (
              <p className="text-sm">{t.map.startsHere}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {view.concept.prerequisites.map((p) => (
                  <li key={p}>
                    <Badge size="md">
                      {text(getConcept(p)?.title ?? { en: p, 'hi-Latn': p }, locale)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {view.concept.published && view.status !== 'locked' ? (
            <Button asChild size="lg" block>
              <Link href={routes.lesson(view.concept.id)}>{t.map.open}</Link>
            </Button>
          ) : (
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
              {view.concept.published ? t.map.lockedHint : t.map.soonHint}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
