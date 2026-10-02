'use client';

import { Badge, Button, Card, cn } from '@logicpath/ui';
import { m, Reveal, Stagger, StaggerItem, useMotionPrefs } from '@logicpath/ui/motion';
import { Visualizer } from '@logicpath/visualizer/react';
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Code2,
  Eye,
  GraduationCap,
  Lightbulb,
  Repeat2,
  School,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { bundle, text } from '@/shared/content/bundle';
import { useLocale, useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { useTier } from '@/shared/three/quality';
import { HeroFallback } from './HeroFallback';

// three.js loads after the page is interactive and only on devices that get 3D (ADR-0020).
const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <HeroFallback />,
});

const STEP_ICONS = [BookOpen, Eye, Lightbulb, Repeat2];
const HIGHLIGHT_ICONS = [Sparkles, GraduationCap, WifiOff];
const AUDIENCE_ICONS = [Brain, School, Code2];

const DEMO_PROGRAM = `total = 0
for i from 1 to 3:
    total = total + i
say total`;

export function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WatchItRun />
      <Roadmap />
      <Audiences />
      <Faq />
      <FinalCta />
    </>
  );
}

function Hero() {
  const t = useT();
  const tier = useTier();
  const { allowMovement } = useMotionPrefs();
  return (
    <section className="relative isolate overflow-hidden">
      {/* Soft colour fields behind everything. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-gradient-to-b from-hero-from via-hero-via to-bg"
      />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 -z-10 size-[42rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl desktop:left-[70%]"
      />
      <div className="mx-auto grid min-h-[min(84dvh,52rem)] max-w-6xl items-center gap-8 px-4 py-16 tablet:px-6 desktop:grid-cols-[1.05fr_1fr] desktop:py-20">
        <Stagger className="relative z-10 flex flex-col items-start gap-6" step={0.08}>
          <StaggerItem>
            <Badge tone="accent" size="md">
              <Sparkles aria-hidden /> {t.landing.eyebrow}
            </Badge>
          </StaggerItem>
          <StaggerItem>
            <h1 className="text-5xl font-extrabold tracking-tight">
              {t.landing.titleLead}{' '}
              <span className="lp-gradient-text">{t.landing.titleAccent}</span>{' '}
              {t.landing.titleTail}
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="max-w-xl text-lg text-muted">{t.landing.subtitle}</p>
          </StaggerItem>
          <StaggerItem className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={routes.learn} data-testid="start-learning">
                {t.landing.cta}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={routes.howItWorks}>{t.landing.ctaSecondary}</Link>
            </Button>
          </StaggerItem>
          <StaggerItem>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {t.landing.highlights.map((h, i) => {
                const Icon = HIGHLIGHT_ICONS[i]!;
                return (
                  <li key={h} className="flex items-center gap-2">
                    <Icon className="size-4 text-accent" aria-hidden /> {h}
                  </li>
                );
              })}
            </ul>
          </StaggerItem>
        </Stagger>
        <m.div
          className="relative h-[22rem] tablet:h-[28rem] desktop:h-[34rem]"
          initial={{ opacity: 0, scale: allowMovement ? 0.94 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          data-testid="hero-visual"
          data-tier={tier ?? 'pending'}
        >
          {tier === 'high' || tier === 'low' ? <HeroScene tier={tier} /> : <HeroFallback />}
        </m.div>
      </div>
    </section>
  );
}

function SectionTitle({
  title,
  body,
  center = false,
}: {
  title: string;
  body?: string;
  center?: boolean;
}) {
  return (
    <Reveal
      className={cn(
        'mb-10 flex max-w-2xl flex-col gap-3',
        center && 'mx-auto items-center text-center',
      )}
    >
      <h2 className="text-3xl font-bold">{title}</h2>
      {body && <p className="text-lg text-muted">{body}</p>}
    </Reveal>
  );
}

function HowItWorks() {
  const t = useT();
  return (
    <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-20 tablet:px-6">
      <Reveal>
        <h2 id="how" className="mb-10 text-3xl font-bold">
          {t.landing.how}
        </h2>
      </Reveal>
      <ol className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        {t.landing.steps.map((step, i) => {
          const Icon = STEP_ICONS[i]!;
          return (
            <li key={step.title} className="h-full">
              <Reveal delay={i * 0.08} className="h-full">
                <Card interactive className="flex h-full flex-col gap-3">
                  <span className="flex items-center justify-between">
                    <span
                      aria-hidden
                      className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="font-mono text-sm text-subtle">0{i + 1}</span>
                  </span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted">{step.body}</p>
                </Card>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WatchItRun() {
  const t = useT();
  const locale = useLocale();
  return (
    <section className="border-y border-border bg-bg-elevated">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 tablet:px-6 desktop:grid-cols-[1fr_1.2fr]">
        <div>
          <SectionTitle title={t.landing.watchTitle} body={t.landing.watchBody} />
          <Stagger as="ul" className="flex flex-col gap-3">
            {t.landing.watchPoints.map((p) => (
              <StaggerItem key={p} as="li" className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                <span>{p}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
        <Reveal>
          <Visualizer source={DEMO_PROGRAM} locale={locale} className="shadow-floating" />
        </Reveal>
      </div>
    </section>
  );
}

function Roadmap() {
  const t = useT();
  const locale = useLocale();
  const now = bundle.stages.map((s) => ({ id: s.id, title: text(s.title, locale), live: true }));
  const later = t.landing.laterStages.map((title, i) => ({
    id: now.length + i,
    title,
    live: false,
  }));
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 tablet:px-6">
      <SectionTitle title={t.landing.roadmapTitle} body={t.landing.roadmapBody} />
      <ol className="relative grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        {[...now, ...later].map((stage, i) => (
          <li key={stage.id} className="h-full">
            <Reveal
              delay={i * 0.06}
              className={cn(
                'relative flex h-full flex-col gap-2 rounded-2xl border p-5',
                stage.live
                  ? 'border-accent/30 bg-surface shadow-raised'
                  : 'border-dashed border-border-strong',
              )}
            >
              <span className="font-mono text-xs font-semibold text-accent">Stage {stage.id}</span>
              <span className="font-semibold">{stage.title}</span>
              <Badge tone={stage.live ? 'success' : 'neutral'} className="mt-auto self-start">
                {stage.live ? t.landing.roadmapNow : t.landing.roadmapNext}
              </Badge>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Audiences() {
  const t = useT();
  const links = [routes.learn, routes.howItWorks, routes.developers];
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 tablet:px-6">
      <SectionTitle title={t.landing.audiencesTitle} />
      <div className="grid gap-4 desktop:grid-cols-3">
        {t.landing.audiences.map((a, i) => {
          const Icon = AUDIENCE_ICONS[i]!;
          return (
            <Reveal key={a.title} delay={i * 0.08} className="h-full">
              <Card interactive padding="lg" className="flex h-full flex-col gap-4">
                <span
                  aria-hidden
                  className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow"
                >
                  <Icon className="size-6" />
                </span>
                <h3 className="text-xl font-semibold">{a.title}</h3>
                <p className="flex-1 text-muted">{a.body}</p>
                <Link
                  href={links[i]!}
                  className="inline-flex items-center gap-1.5 font-semibold text-accent hover:gap-2.5"
                >
                  {a.cta} <ArrowRight className="size-4 transition-all" aria-hidden />
                </Link>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function Faq() {
  const t = useT();
  return (
    <section className="border-t border-border bg-bg-elevated">
      <div className="mx-auto max-w-3xl px-4 py-20 tablet:px-6">
        <SectionTitle title={t.landing.faqTitle} center />
        <div className="flex flex-col gap-3">
          {t.landing.faq.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-border bg-surface p-5 shadow-raised open:shadow-floating"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.q}
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const t = useT();
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 tablet:px-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-2 px-6 py-14 text-center text-white shadow-overlay tablet:px-12">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 size-72 rounded-full bg-white/15 blur-2xl"
          />
          <h2 className="text-3xl font-bold">{t.landing.finalTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-white/85">{t.landing.finalBody}</p>
          <Button asChild size="lg" variant="secondary" className="mt-8 border-0">
            <Link href={routes.learn}>
              {t.landing.cta} <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
