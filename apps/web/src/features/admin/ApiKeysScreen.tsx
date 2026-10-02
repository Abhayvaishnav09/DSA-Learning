'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { platform } from '@logicpath/contracts';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  PageHeader,
  Select,
  toast,
} from '@logicpath/ui';
import { useState, type FormEvent } from 'react';
import { useStrings } from '@/shared/i18n/useT';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

export function ApiKeysScreen() {
  const strings = useStrings(adminStrings);
  const t = strings.keys;
  const list = useApi('admin.apiKeys.list', { query: { limit: 100 } });
  const [editing, setEditing] = useState<platform.ApiKey | null>(null);
  const [revoking, setRevoking] = useState<platform.ApiKey | null>(null);
  const revoke = useApiMutation('admin.apiKeys.revoke', {
    invalidates: ['admin.apiKeys.list'],
    onSuccess: () => {
      setRevoking(null);
      toast.success(t.revokedDone);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />
      <QueryView query={list}>
        {(data) => (
          <DataTable
            caption={t.caption}
            rows={data.items}
            rowKey={(k) => k.id}
            empty={t.empty}
            columns={[
              {
                key: 'name',
                header: t.columns.name,
                sortValue: (k) => k.name.toLowerCase(),
                cell: (k) => <span className="font-medium">{k.name}</span>,
              },
              {
                key: 'key',
                header: t.columns.key,
                cell: (k) => <code className="font-mono text-xs">{k.prefix}…</code>,
              },
              {
                key: 'owner',
                header: t.columns.owner,
                cell: (k) => (
                  <code className="font-mono text-xs" title={k.ownerId}>
                    {k.ownerId.slice(0, 8)}
                  </code>
                ),
              },
              {
                key: 'plan',
                header: t.columns.plan,
                sortValue: (k) => k.plan,
                cell: (k) => (
                  <Badge tone={k.plan === 'partner' ? 'xp' : 'neutral'}>{t.plans[k.plan]}</Badge>
                ),
              },
              {
                key: 'quota',
                header: t.columns.quota,
                sortValue: (k) => k.dailyQuota,
                cell: (k) => k.dailyQuota.toLocaleString(),
              },
              {
                key: 'today',
                header: t.columns.today,
                sortValue: (k) => k.usageToday,
                cell: (k) => k.usageToday,
              },
              {
                key: 'status',
                header: t.columns.status,
                cell: (k) => (
                  <Badge tone={k.revokedAt ? 'danger' : 'success'}>
                    {k.revokedAt ? t.revoked : t.active}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: '',
                cell: (k) =>
                  k.revokedAt ? null : (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing(k)}
                        data-testid={`key-edit-${k.name}`}
                      >
                        {t.edit}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRevoking(k)}>
                        {t.revoke}
                      </Button>
                    </span>
                  ),
              },
            ]}
          />
        )}
      </QueryView>
      {editing && <EditDialog key={editing.id} apiKey={editing} onClose={() => setEditing(null)} />}
      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent title={t.revokeTitle} description={t.revokeBody}>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => revoke.mutate({ params: { id: revoking!.id } })}
              data-testid="key-revoke-confirm"
            >
              {t.revoke}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDialog({ apiKey, onClose }: { apiKey: platform.ApiKey; onClose: () => void }) {
  const strings = useStrings(adminStrings);
  const t = strings.keys;
  const [plan, setPlan] = useState(apiKey.plan);
  const [quota, setQuota] = useState(String(apiKey.dailyQuota));
  const update = useApiMutation('admin.apiKeys.update', {
    invalidates: ['admin.apiKeys.list'],
    onSuccess: () => {
      toast.success(t.saved);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = Number.parseInt(quota, 10);
    update.mutate({
      params: { id: apiKey.id },
      body: { plan, ...(plan === apiKey.plan && Number.isFinite(n) ? { dailyQuota: n } : {}) },
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.editTitle(apiKey.name)}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {update.error && <Callout tone="danger">{update.error.message}</Callout>}
          <Field label={t.plan}>
            <Select
              value={plan}
              onChange={(e) => setPlan(e.target.value as typeof plan)}
              data-testid="key-plan"
            >
              <option value="free">{t.plans.free}</option>
              <option value="partner">{t.plans.partner}</option>
            </Select>
          </Field>
          <Field label={t.quota}>
            <Input
              type="number"
              min={0}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              disabled={plan !== apiKey.plan}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button type="submit" loading={update.isPending} data-testid="key-save">
              {strings.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
