'use client';

import { useApi } from '@logicpath/api-client/react';
import type { home } from '@logicpath/contracts';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardTitle,
  ProgressBar,
  ProgressRing,
  Skeleton,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { Bell, BookOpen, Flame, Repeat, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { useReviewQueue, useUpNext } from '@/entities/progress/selectors';
import { useProgress } from '@/entities/progress/store';
import { text } from '@/shared/content/bundle';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatRelative } from '@/shared/lib/format';
import { useHydrated } from '@/shared/lib/useHydrated';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import { QueryView } from '@/shared/ui/QueryView';

/** The dashboard. Signed in, it comes from the server in one call; as a guest it is built from this device. */
export function HomeScreen() {
  const hydrated = useHydrated();
  const status = useSession((s) => s.status);
  const t = useT();
  if (!hydrated || status === 'unknown') {
    return <Skeleton className="h-64 w-full" />;
  }
  return status === 'signedIn' ? <SignedInHome /> : <GuestHome title={t.s.home.guestGreeting} />;
}

function ContinueCard() {
  const t = useT().s.home;
  const locale = useLocale();
  const up = useUpNext();
  const label = !up?.lesson
    ? t.continueStart
    : up.lesson.completedAt
      ? t.continueAgain
      : t.continueResume;
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <BookOpen className="size-4" aria-hidden /> {t.continueTitle}
      </CardTitle>
      {up ? (
        <>
          <p className="text-xl font-bold">{text(up.view.concept.title, locale)}</p>
          <div>
            <Button asChild data-testid="home-continue">
              <Link href={routes.lesson(up.view.concept.id)}>{label}</Link>
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted">{t.allCaughtUp}</p>
      )}
    </Card>
  );
}

function ReviewCard({ due, nextDueAt }: { due: number; nextDueAt: string | null }) {
  const t = useT().s.home;
  const locale = useLocale();
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <Repeat className="size-4" aria-hidden /> {t.reviewTitle}
      </CardTitle>
      <p className="text-xl font-bold" data-testid="home-reviews">
        {due > 0 ? t.reviewDue(due) : t.reviewNone}
      </p>
      {due > 0 ? (
        <div>
          <Button asChild variant="secondary">
            <Link href={routes.review}>{t.reviewStart}</Link>
          </Button>
        </div>
      ) : (
        nextDueAt && (
          <p className="text-sm text-muted">{t.reviewNext(formatRelative(nextDueAt, locale))}</p>
        )
      )}
    </Card>
  );
}

function StreakCard({ current, longest }: { current: number; longest: number }) {
  const t = useT().s.home;
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <Flame className="size-4 text-warning" aria-hidden /> {t.streakTitle}
      </CardTitle>
      <p className="text-2xl font-bold" data-testid="home-streak">
        {current > 0 ? t.streak(current) : '0'}
      </p>
      <p className="text-sm text-muted">{current > 0 ? t.streakBest(longest) : t.streakStart}</p>
    </Card>
  );
}

function GuestHome({ title }: { title: string }) {
  const t = useT().s;
  const streak = useProgress((s) => s.streak);
  const { due, nextDueAt } = useReviewQueue();
  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-muted">{t.home.subtitle}</p>
      </StaggerItem>
      <StaggerItem>
        <Callout tone="info" title={t.home.guestTitle}>
          <p className="mb-3">{t.home.guestBody}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={routes.signup()}>{t.common.createCta}</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={routes.login()}>{t.common.signInCta}</Link>
            </Button>
          </div>
        </Callout>
      </StaggerItem>
      <StaggerItem className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ContinueCard />
        <ReviewCard due={due.length} nextDueAt={nextDueAt} />
        <StreakCard current={streak.current} longest={streak.longest} />
      </StaggerItem>
    </Stagger>
  );
}

function SignedInHome() {
  const query = useApi('home');
  return (
    <QueryView query={query} skeleton={<HomeSkeleton />}>
      {(data) => <Dashboard data={data} />}
    </QueryView>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="home-loading">
      <Skeleton className="h-10 w-1/2" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: home.Home }) {
  const t = useT().s;
  const locale = useLocale();
  const classes = useApi('classes.mine');
  const { progress, rewards, reviews, league } = data;
  const goalPct = Math.min(
    100,
    Math.round((progress.today.minutes / progress.today.goalMinutes) * 100),
  );
  const levelSpan = rewards.nextLevelXp - rewards.levelFloorXp;
  const levelPct = Math.round(((rewards.xp - rewards.levelFloorXp) / levelSpan) * 100);
  const me = league?.standings.find((s) => s.isMe);
  const firstClass = classes.data?.items[0];

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-2xl font-bold sm:text-3xl" data-testid="home-greeting">
          {t.home.greeting(data.profile.displayName.split(' ')[0]!)}
        </h1>
        <p className="mt-1 text-muted">{t.home.subtitle}</p>
      </StaggerItem>

      {data.partial.length > 0 && (
        <StaggerItem>
          <Callout tone="warning">{t.home.partial}</Callout>
        </StaggerItem>
      )}

      <StaggerItem className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex items-center gap-4">
          <ProgressRing
            value={goalPct}
            label={t.home.goalTitle}
            size={92}
            tone={goalPct >= 100 ? 'success' : 'accent'}
          >
            <span className="text-lg font-bold tabular-nums">{goalPct}%</span>
          </ProgressRing>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t.home.goalTitle}
            </p>
            <p className="font-bold" data-testid="home-goal">
              {t.home.goalProgress(Math.round(progress.today.minutes), progress.today.goalMinutes)}
            </p>
            <p className="text-sm text-muted">
              {goalPct >= 100
                ? t.home.goalDone
                : t.home.goalMore(
                    Math.max(1, Math.ceil(progress.today.goalMinutes - progress.today.minutes)),
                  )}
            </p>
          </div>
        </Card>
        <StreakCard current={progress.streak.current} longest={progress.streak.longest} />
        <Card className="flex flex-col gap-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted">
            <span>{t.home.levelTitle}</span>
            <Badge tone="xp">{t.home.weekXp(rewards.xpThisWeek)}</Badge>
          </CardTitle>
          <p className="text-2xl font-bold" data-testid="home-level">
            {t.home.level(rewards.level)}
          </p>
          <ProgressBar value={levelPct} label={t.home.level(rewards.level)} tone="xp" />
          <p className="text-sm text-muted">{t.home.toNext(rewards.nextLevelXp - rewards.xp)}</p>
        </Card>
      </StaggerItem>

      <StaggerItem className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ContinueCard />
        <ReviewCard due={reviews.dueNow} nextDueAt={reviews.nextDueAt} />
      </StaggerItem>

      <StaggerItem className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Trophy className="size-4 text-xp" aria-hidden /> {t.home.leagueTitle}
          </CardTitle>
          {league && me ? (
            <>
              <p className="text-xl font-bold" data-testid="home-league">
                {t.home.leagueRank(me.rank, t.league.tiers[league.tier])}
              </p>
              <p className="text-sm text-muted">
                {t.home.leagueEnds(formatRelative(league.endsAt, locale))}
              </p>
            </>
          ) : (
            <p className="text-muted">{t.league.tip}</p>
          )}
          <div>
            <Button asChild size="sm" variant="secondary">
              <Link href={routes.leaderboard}>{t.home.leagueOpen}</Link>
            </Button>
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Bell className="size-4" aria-hidden /> {t.home.inboxTitle}
          </CardTitle>
          <p className="text-xl font-bold" data-testid="home-unread">
            {data.unreadNotifications > 0
              ? t.home.inboxUnread(data.unreadNotifications)
              : t.home.inboxEmpty}
          </p>
          <div>
            <Button asChild size="sm" variant="secondary">
              <Link href={routes.notifications}>{t.inbox.open}</Link>
            </Button>
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Users className="size-4" aria-hidden /> {t.home.classTitle}
          </CardTitle>
          {firstClass ? (
            <>
              <p className="text-xl font-bold">{firstClass.name}</p>
              <p className="text-sm text-muted">{t.classes.members(firstClass.memberCount)}</p>
            </>
          ) : (
            <p className="text-muted">{t.home.classNone}</p>
          )}
          <div>
            <Button asChild size="sm" variant="secondary">
              <Link href={routes.classes}>{firstClass ? t.home.classOpen : t.home.classJoin}</Link>
            </Button>
          </div>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
