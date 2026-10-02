'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { engagement } from '@logicpath/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Stat,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import {
  Award,
  BookOpenCheck,
  Brain,
  ChevronsUp,
  Flame,
  Library,
  Lock,
  Repeat,
  Sprout,
  Target,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatDate } from '@/shared/lib/format';
import { useSession } from '@/shared/session/store';
import { QueryView } from '@/shared/ui/QueryView';

const ICONS: Record<string, LucideIcon> = {
  sprout: Sprout,
  'book-open-check': BookOpenCheck,
  library: Library,
  brain: Brain,
  trophy: Trophy,
  target: Target,
  zap: Zap,
  repeat: Repeat,
  flame: Flame,
  'chevrons-up': ChevronsUp,
  users: Users,
};
const TIER_TONE = { bronze: 'warning', silver: 'neutral', gold: 'xp' } as const;

export function ProfileScreen() {
  const t = useT().s;
  const locale = useLocale();
  const user = useSession((s) => s.user);
  const profile = useApi('profile.get');
  const rewards = useApi('rewards.me');
  const badges = useApi('rewards.badges');
  const progress = useApi('progress.get');
  const history = useApi('leaderboard.history');
  if (!user) return null;

  const mastered = progress.data?.concepts.filter((c) => c.status === 'mastered').length ?? 0;
  const lessons = progress.data?.lessons.filter((l) => l.completedAt).length ?? 0;

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={user.name} seed={user.id} size="xl" />
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl" data-testid="profile-name">
              {profile.data?.displayName ?? user.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge tone="accent">{t.profile.role[user.role]}</Badge>
              <span>{user.email}</span>
              <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified ? t.profile.verified : t.profile.unverified}
              </Badge>
            </div>
            <p className="text-sm text-muted">
              {t.profile.memberSince(formatDate(user.createdAt, locale))}
            </p>
          </div>
          {profile.data && <NameForm current={profile.data.displayName} />}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <h2 className="mb-3 text-lg font-semibold">{t.profile.stats}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t.profile.totalXp} value={rewards.data?.xp ?? '…'} />
          <Stat label={t.profile.lessons} value={progress.data ? lessons : '…'} />
          <Stat label={t.profile.mastered} value={progress.data ? mastered : '…'} />
          <Stat label={t.profile.longestStreak} value={progress.data?.streak.longest ?? '…'} />
        </div>
      </StaggerItem>

      <StaggerItem>
        <QueryView query={badges} skeleton={<Skeleton className="h-40" />}>
          {(all) => {
            const earned = new Map((rewards.data?.badges ?? []).map((b) => [b.id, b.earnedAt]));
            return (
              <section aria-labelledby="badges-title">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 id="badges-title" className="text-lg font-semibold">
                    {t.profile.badges}
                  </h2>
                  <span className="text-sm text-muted" data-testid="badge-count">
                    {t.profile.badgeCount(earned.size, all.items.length)}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {all.items.map((badge) => (
                    <BadgeTile
                      key={badge.id}
                      badge={badge}
                      earnedAt={earned.get(badge.id) ?? null}
                    />
                  ))}
                </ul>
              </section>
            );
          }}
        </QueryView>
      </StaggerItem>

      <StaggerItem className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <CardTitle>{t.profile.recent}</CardTitle>
          {rewards.data && rewards.data.recent.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border">
              {rewards.data.recent.map((entry, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{entry.reason}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted">{formatDate(entry.at, locale)}</span>
                    <Badge tone="xp">+{entry.amount}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t.profile.recentEmpty}</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>{t.profile.history}</CardTitle>
          {history.data && history.data.items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border">
              {history.data.items.map((week) => (
                <li
                  key={week.weekStart}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span>
                    {formatDate(week.weekStart, locale)} ·{' '}
                    {t.profile.historyRow(week.rank, t.league.tiers[week.tier])}
                  </span>
                  <Badge
                    tone={
                      week.result === 'promoted'
                        ? 'success'
                        : week.result === 'demoted'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {t.profile.result[week.result]}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t.profile.historyEmpty}</p>
          )}
        </Card>
      </StaggerItem>
    </Stagger>
  );
}

function BadgeTile({ badge, earnedAt }: { badge: engagement.Badge; earnedAt: string | null }) {
  const t = useT().s;
  const locale = useLocale();
  const Icon = ICONS[badge.icon] ?? Award;
  return (
    <li
      className={`flex items-start gap-3 rounded-2xl border p-4 ${earnedAt ? 'border-border bg-surface shadow-raised' : 'border-dashed border-border bg-surface-2'}`}
      data-testid={`badge-${badge.id}`}
      data-earned={earnedAt ? 'true' : 'false'}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${earnedAt ? 'bg-xp-soft text-xp' : 'bg-surface-2 text-subtle'}`}
      >
        {earnedAt ? (
          <Icon className="size-5" aria-hidden />
        ) : (
          <Lock className="size-5" aria-hidden />
        )}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-2 font-semibold">
          {badge.title[locale]}
          <Badge tone={TIER_TONE[badge.tier]}>{badge.tier}</Badge>
        </p>
        <p className="text-sm text-muted">{badge.description[locale]}</p>
        <p className="text-xs text-subtle">
          {earnedAt ? t.profile.badgeEarned(formatDate(earnedAt, locale)) : t.profile.badgeLocked}
        </p>
      </div>
    </li>
  );
}

function NameForm({ current }: { current: string }) {
  const t = useT().s;
  const [name, setName] = useState(current);
  const update = useApiMutation('profile.update', {
    invalidates: ['profile.get', 'home'],
    onSuccess: () => void toast.success(t.common.saved),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ body: { displayName: name.trim() } });
  };
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-xs flex-col gap-2 sm:w-64">
      <Field
        label={t.profile.editName}
        description={t.profile.nameHelp}
        error={update.error?.fieldErrors().displayName}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        loading={update.isPending}
        disabled={name.trim().length < 1 || name.trim() === current}
      >
        {t.common.save}
      </Button>
    </form>
  );
}
