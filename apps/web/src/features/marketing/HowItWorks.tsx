'use client';

import { Badge, Button, Card, ProgressRing } from '@logicpath/ui';
import { Reveal, Stagger, StaggerItem } from '@logicpath/ui/motion';
import { ArrowRight, BookOpen, Eye, Lightbulb, LifeBuoy, Repeat2, School } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

const ICONS = [BookOpen, Eye, Lightbulb, LifeBuoy, Repeat2];

/** The teaching method, beat by beat, with the research idea behind each one. */
export function HowItWorks() {
  const t = useT();
  const h = t.howItWorks;
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 tablet:px-6">
      <Stagger className="mb-14 flex max-w-2xl flex-col gap-4">
        <StaggerItem>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {h.eyebrow}
          </p>
        </StaggerItem>
        <StaggerItem>
          <h1 className="text-4xl font-bold">{h.title}</h1>
        </StaggerItem>
        <StaggerItem>
          <p className="text-lg text-muted">{h.intro}</p>
        </StaggerItem>
      </Stagger>

      <ol className="relative flex flex-col gap-6 before:absolute before:top-4 before:bottom-4 before:left-6 before:w-0.5 before:bg-gradient-to-b before:from-accent before:to-accent-2 tablet:before:left-7">
        {h.beats.map((beat, i) => {
          const Icon = ICONS[i]!;
          return (
            <li key={beat.title}>
              <Reveal delay={i * 0.05} className="relative flex gap-5 tablet:gap-7">
                <span
                  aria-hidden
                  className="relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow tablet:size-14"
                >
                  <Icon className="size-6" />
                </span>
                <Card className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-subtle">0{i + 1}</span>
                    <h2 className="text-xl font-semibold">{beat.title}</h2>
                    <Badge tone="info" className="ml-auto">
                      {beat.evidence}
                    </Badge>
                  </div>
                  <p className="text-muted">{beat.body}</p>
                </Card>
              </Reveal>
            </li>
          );
        })}
      </ol>

      <div className="mt-16 grid gap-6 desktop:grid-cols-2">
        <Reveal>
          <Card padding="lg" className="flex h-full items-center gap-6">
            <ProgressRing value={72} label={h.pathTitle} tone="success">
              <span className="text-lg font-bold">72%</span>
            </ProgressRing>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{h.pathTitle}</h2>
              <p className="text-muted">{h.pathBody}</p>
            </div>
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card padding="lg" className="flex h-full items-center gap-6">
            <span
              aria-hidden
              className="grid size-20 shrink-0 place-items-center rounded-3xl bg-accent-soft text-accent"
            >
              <School className="size-9" />
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{h.teachersTitle}</h2>
              <p className="text-muted">{h.teachersBody}</p>
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-14 flex justify-center">
        <Button asChild size="lg">
          <Link href={routes.learn}>
            {h.cta} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </Reveal>
    </div>
  );
}
