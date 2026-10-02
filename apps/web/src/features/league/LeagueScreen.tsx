'use client';

import { useApi } from '@logicpath/api-client/react';
import type { engagement } from '@logicpath/contracts';
import { Avatar, Badge, Button, Card, CardTitle, EmptyState, Skeleton } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { ChevronsDown, ChevronsUp, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatDate, formatRelative } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';

const ZONE_STYLE: Record<engagement.Standing['zone'], string> = {
  promote: 'border-l-4 border-l-success bg-success-soft/40',
  stay: 'border-l-4 border-l-transparent',
  demote: 'border-l-4 border-l-danger bg-danger-soft/40',
};

export function LeagueScreen() {
  const messages = useT().s;
  const t = messages.league;
  const locale = useLocale();
  const league = useApi('leaderboard.league');
  const history = useApi('leaderboard.history');

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </StaggerItem>

      <StaggerItem>
        <QueryView query={league} skeleton={<Skeleton className="h-96" />}>
          {(data) => {
            const me = data.standings.find((s) => s.isMe);
            return (
              <div className="flex flex-col gap-4">
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-xp-soft text-xp">
                      <Trophy className="size-6" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm text-muted">{t.tier}</p>
                      <p className="text-xl font-bold" data-testid="league-tier">
                        {t.tiers[data.tier]}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted">
                      {t.ends(formatRelative(data.endsAt, locale))}
                    </p>
                    {me && (
                      <p className="font-semibold" data-testid="league-place">
                        {t.yourPlace(me.rank, data.standings.length)}
                      </p>
                    )}
                  </div>
                </Card>

                <ol
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-raised"
                  data-testid="standings"
                >
                  {data.standings.map((row) => (
                    <li
                      key={row.userId}
                      className={`flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 ${ZONE_STYLE[row.zone]} ${row.isMe ? 'font-semibold ring-2 ring-inset ring-accent/50' : ''}`}
                      aria-current={row.isMe ? 'true' : undefined}
                      data-me={row.isMe}
                    >
                      <span className="w-8 text-center tabular-nums text-muted">{row.rank}</span>
                      <Avatar name={row.displayName} seed={row.userId} size="sm" decorative />
                      <span className="flex-1 truncate">
                        {row.displayName}
                        {row.isMe && (
                          <Badge tone="accent" className="ml-2">
                            {t.you}
                          </Badge>
                        )}
                      </span>
                      {row.zone !== 'stay' && (
                        <span
                          className={`hidden items-center gap-1 text-xs sm:flex ${row.zone === 'promote' ? 'text-success' : 'text-danger'}`}
                        >
                          {row.zone === 'promote' ? (
                            <ChevronsUp className="size-4" aria-hidden />
                          ) : (
                            <ChevronsDown className="size-4" aria-hidden />
                          )}
                          {t.zone[row.zone]}
                        </span>
                      )}
                      <span className="w-16 text-right tabular-nums">{row.xp} XP</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                  <span>{t.tip}</span>
                  <Button asChild size="sm">
                    <Link href={routes.learn}>{t.cta}</Link>
                  </Button>
                </div>
              </div>
            );
          }}
        </QueryView>
      </StaggerItem>

      <StaggerItem>
        <Card className="flex flex-col gap-3">
          <CardTitle>{t.history}</CardTitle>
          {history.data && history.data.items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border">
              {history.data.items.map((week) => (
                <li
                  key={week.weekStart}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span>
                    {t.week(formatDate(week.weekStart, locale))} · {t.tiers[week.tier]} · #
                    {week.rank}
                  </span>
                  <span className="flex items-center gap-2">
                    {week.xp} XP
                    <Badge
                      tone={
                        week.result === 'promoted'
                          ? 'success'
                          : week.result === 'demoted'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {messages.profile.result[week.result]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            history.data && <EmptyState title={t.historyEmpty} />
          )}
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
