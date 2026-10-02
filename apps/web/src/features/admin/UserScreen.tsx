'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { Role, identity } from '@logicpath/contracts';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Select,
  Skeleton,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

const STATUS_TONE = { active: 'success', pending_consent: 'warning', suspended: 'danger' } as const;

export function UserScreen({ id }: { id: string }) {
  const user = useApi('admin.users.get', { params: { id } });
  return (
    <QueryView query={user} skeleton={<Skeleton className="h-80" />}>
      {(data) => <UserView user={data} />}
    </QueryView>
  );
}

function UserView({ user }: { user: identity.User }) {
  const strings = useStrings(adminStrings);
  const t = strings.users;
  const u = strings.user;
  const locale = useLocale();
  const me = useSession((s) => s.user);
  const [role, setRole] = useState<Role>(user.role);
  const [confirming, setConfirming] = useState(false);
  const isSelf = me?.id === user.id;
  const pending = user.status === 'pending_consent';

  const audit = useApi('admin.audit.list', { query: { targetType: 'user', limit: 100 } });
  const consent = useApi('admin.consent.list', { query: { limit: 100 } }, { enabled: pending });

  const update = useApiMutation('admin.users.update', {
    invalidates: ['admin.users.get', 'admin.users.list', 'admin.audit.list'],
    onSuccess: () => {
      setConfirming(false);
      toast.success(u.updated);
    },
  });
  const trail = audit.data?.items.filter((e) => e.targetId === user.id) ?? [];
  const request = consent.data?.items.find((c) => c.userId === user.id);
  const suspended = user.status === 'suspended';

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft />}>
          <Link href={routes.adminUsers}>{u.back}</Link>
        </Button>
        <Card className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={user.name} seed={user.id} size="xl" />
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="text-2xl font-bold" data-testid="user-name">
              {user.name}
            </h1>
            <p className="text-muted">{user.email}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="accent">{t.roles[user.role]}</Badge>
              <Badge tone={STATUS_TONE[user.status]} data-testid="user-status">
                {t.statuses[user.status]}
              </Badge>
              <Badge tone={user.emailVerified ? 'success' : 'neutral'}>
                {user.emailVerified ? u.verified : u.unverified}
              </Badge>
              <span className="text-muted">{u.joined(formatDate(user.createdAt, locale))}</span>
            </div>
          </div>
        </Card>
      </StaggerItem>

      {isSelf && (
        <StaggerItem>
          <Callout tone="info">{u.self}</Callout>
        </StaggerItem>
      )}
      {pending && (
        <StaggerItem>
          <Callout tone="warning" title={u.consent}>
            <p>{u.pending}</p>
            {request && (
              <p className="mt-1 text-sm">{u.consentRow(request.parentEmail, request.status)}</p>
            )}
          </Callout>
        </StaggerItem>
      )}

      {!isSelf && !pending && (
        <StaggerItem className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <CardTitle>{u.role}</CardTitle>
            <Field label={u.role}>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                data-testid="user-role"
              >
                {(['student', 'writer', 'admin'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t.roles[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Button
                variant="secondary"
                loading={update.isPending && !confirming}
                disabled={role === user.role}
                onClick={() => update.mutate({ params: { id: user.id }, body: { role } })}
                data-testid="user-save-role"
              >
                {u.saveRole}
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <CardTitle>{t.columns.status}</CardTitle>
            <p className="text-sm text-muted">
              {suspended ? t.statuses.suspended : t.statuses.active}
            </p>
            <div>
              <Button
                variant={suspended ? 'primary' : 'danger'}
                onClick={() =>
                  suspended
                    ? update.mutate({ params: { id: user.id }, body: { status: 'active' } })
                    : setConfirming(true)
                }
                data-testid="user-toggle-status"
              >
                {suspended ? u.reactivate : u.suspend}
              </Button>
            </div>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card className="flex flex-col gap-3">
          <CardTitle>{u.trail}</CardTitle>
          {trail.length === 0 ? (
            <p className="text-sm text-muted">{u.trailEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {trail.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <code className="font-mono">{e.action}</code>
                  </span>
                  <span className="text-muted">{formatDateTime(e.at, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </StaggerItem>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={u.suspendTitle} description={u.suspendBody}>
          {update.error && <Callout tone="danger">{update.error.message}</Callout>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={() =>
                update.mutate({ params: { id: user.id }, body: { status: 'suspended' } })
              }
              data-testid="user-suspend-confirm"
            >
              {u.suspend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stagger>
  );
}
