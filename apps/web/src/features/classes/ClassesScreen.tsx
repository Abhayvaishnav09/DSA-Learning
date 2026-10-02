'use client';

import { ApiError } from '@logicpath/api-client';
import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { engagement } from '@logicpath/contracts';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Sheet,
  Skeleton,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { Copy, LogOut, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { API_MODE } from '@/shared/api/client';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatDate } from '@/shared/lib/format';
import { QueryView } from '@/shared/ui/QueryView';
import { DEMO_CLASS_CODE } from '@logicpath/local-backend/accounts';

export function ClassesScreen() {
  const t = useT().s.classes;
  const mine = useApi('classes.mine');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </StaggerItem>
      <StaggerItem>
        <JoinForm onJoined={(c) => setOpen(c.id)} />
      </StaggerItem>
      <StaggerItem>
        <h2 className="mb-3 text-lg font-semibold">{t.mine}</h2>
        <QueryView query={mine} skeleton={<Skeleton className="h-32" />}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon={<Users />} title={t.empty} />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="class-list">
                {data.items.map((c) => (
                  <li key={c.id}>
                    <Card className="flex h-full flex-col gap-2" data-testid={`class-${c.name}`}>
                      <p className="text-lg font-semibold">{c.name}</p>
                      <p className="text-sm text-muted">
                        {t.teacher(c.ownerName)} · {t.members(c.memberCount)}
                      </p>
                      <div className="mt-auto pt-2">
                        <Button size="sm" variant="secondary" onClick={() => setOpen(c.id)}>
                          {t.open}
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryView>
      </StaggerItem>
      <ClassSheet id={open} onClose={() => setOpen(null)} />
    </Stagger>
  );
}

export function JoinForm({
  onJoined,
  initialCode = '',
}: {
  onJoined?: (c: engagement.ClassSummary) => void;
  initialCode?: string;
}) {
  const messages = useT().s;
  const t = messages.classes;
  const [code, setCode] = useState(initialCode);
  const join = useApiMutation('classes.join', {
    invalidates: ['classes.mine', 'home', 'rewards.me', 'notifications.list'],
    onSuccess: (c) => {
      toast.success(t.joined(c.name));
      setCode('');
      onJoined?.(c);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    join.mutate({ body: { code: code.trim().toUpperCase() } });
  };
  const error = join.error;
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          label={t.codeLabel}
          description={t.codeHelp}
          error={
            error?.fieldErrors().code ??
            (error instanceof ApiError && !error.problem.errors?.length ? error.message : undefined)
          }
          className="flex-1"
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono tracking-widest"
            data-testid="class-code"
          />
        </Field>
        <Button
          type="submit"
          loading={join.isPending}
          disabled={code.trim().length !== 6}
          data-testid="class-join"
        >
          {t.join}
        </Button>
      </form>
      {API_MODE === 'local' && (
        <p className="mt-3 text-xs text-muted">{t.demoHint(DEMO_CLASS_CODE)}</p>
      )}
    </Card>
  );
}

export function ClassSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const messages = useT().s;
  const t = messages.classes;
  const locale = useLocale();
  const detail = useApi('classes.get', { params: { id: id ?? '' } }, { enabled: !!id });
  const leave = useApiMutation('classes.leave', {
    invalidates: ['classes.mine', 'home'],
    onSuccess: () => {
      toast.success(t.left);
      onClose();
    },
  });
  const [confirmLeave, setConfirmLeave] = useState(false);
  const data = detail.data;

  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title={data?.name ?? t.title}
      description={data ? t.teacher(data.ownerName) : undefined}
    >
      {detail.isPending ? (
        <Skeleton className="h-40" />
      ) : data ? (
        <div className="flex flex-col gap-4">
          {data.code && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
              <div>
                <p className="text-xs text-muted">{t.code}</p>
                <p
                  className="font-mono text-xl font-bold tracking-widest"
                  data-testid="class-code-shown"
                >
                  {data.code}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Copy />}
                onClick={() => {
                  void navigator.clipboard?.writeText(data.code!).catch(() => {});
                  toast.success(messages.common.copied);
                }}
              >
                {messages.common.copy}
              </Button>
            </div>
          )}
          <p className="text-sm text-muted">{t.members(data.memberCount)}</p>
          {data.code !== null && (
            <section aria-label={t.roster}>
              <h3 className="mb-2 font-semibold">{t.roster}</h3>
              <DataTable
                caption={t.roster}
                rows={data.members}
                rowKey={(m) => m.userId}
                empty={t.rosterEmpty}
                columns={[
                  {
                    key: 'name',
                    header: messages.league.learner,
                    cell: (m) => m.name,
                    sortValue: (m) => m.name,
                  },
                  {
                    key: 'mastered',
                    header: t.mastered,
                    cell: (m) => m.conceptsMastered,
                    sortValue: (m) => m.conceptsMastered,
                  },
                  {
                    key: 'xp',
                    header: t.xpWeek,
                    cell: (m) => m.xpThisWeek,
                    sortValue: (m) => m.xpThisWeek,
                  },
                  {
                    key: 'last',
                    header: t.lastActive,
                    cell: (m) => (m.lastActiveOn ? formatDate(m.lastActiveOn, locale) : t.never),
                    sortValue: (m) => m.lastActiveOn ?? '',
                  },
                ]}
              />
            </section>
          )}
          {data.code === null && (
            <div>
              <Button
                variant="secondary"
                leftIcon={<LogOut />}
                onClick={() => setConfirmLeave(true)}
                data-testid="class-leave"
              >
                {t.leave}
              </Button>
              {confirmLeave && (
                <Callout tone="warning" title={t.leaveTitle} className="mt-3">
                  <p className="mb-3">{t.leaveBody}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={leave.isPending}
                      onClick={() => leave.mutate({ params: { id: data.id } })}
                      data-testid="class-leave-confirm"
                    >
                      {t.leave}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmLeave(false)}>
                      {messages.common.cancel}
                    </Button>
                  </div>
                </Callout>
              )}
            </div>
          )}
        </div>
      ) : (
        <Badge tone="danger">{messages.common.errorTitle}</Badge>
      )}
    </Sheet>
  );
}
