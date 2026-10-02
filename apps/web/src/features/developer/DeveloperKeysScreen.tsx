'use client';

import { ApiError } from '@logicpath/api-client';
import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { platform } from '@logicpath/contracts';
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Sparkline,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { Copy, KeyRound, Plus, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatDate, formatRelative } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';

export function DeveloperKeysScreen() {
  const t = useT().s.devKeys;
  const keys = useApi('developer.keys.list');
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<platform.CreatedApiKey | null>(null);
  const active = keys.data?.items.filter((k) => !k.revokedAt).length ?? 0;

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <PageHeader
          title={t.title}
          description={t.intro}
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href={routes.developers}>{t.docs}</Link>
              </Button>
              <Button
                leftIcon={<Plus />}
                onClick={() => setCreating(true)}
                disabled={active >= 5}
                data-testid="key-create"
              >
                {t.create}
              </Button>
            </>
          }
        />
        {active >= 5 && <p className="mt-2 text-sm text-muted">{t.limit}</p>}
      </StaggerItem>
      <StaggerItem>
        <QueryView query={keys}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon={<KeyRound />} title={t.empty} />
            ) : (
              <ul className="flex flex-col gap-3">
                {data.items.map((key) => (
                  <KeyRow key={key.id} apiKey={key} />
                ))}
              </ul>
            )
          }
        </QueryView>
      </StaggerItem>
      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={setSecret} />
      <SecretDialog created={secret} onClose={() => setSecret(null)} />
    </Stagger>
  );
}

function KeyRow({ apiKey }: { apiKey: platform.ApiKey }) {
  const messages = useT().s;
  const t = messages.devKeys;
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const usage = useApi(
    'developer.keys.usage',
    { params: { id: apiKey.id } },
    { enabled: !apiKey.revokedAt },
  );
  const revoke = useApiMutation('developer.keys.revoke', {
    invalidates: ['developer.keys.list'],
    onSuccess: () => {
      setConfirming(false);
      toast.success(t.revoked);
    },
  });
  return (
    <li>
      <Card
        className={`flex flex-col gap-3 ${apiKey.revokedAt ? 'opacity-70' : ''}`}
        data-testid={`key-${apiKey.name}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 font-semibold">
              {apiKey.name}
              <Badge tone={apiKey.plan === 'partner' ? 'xp' : 'neutral'}>
                {apiKey.plan === 'partner' ? t.planPartner : t.planFree}
              </Badge>
              {apiKey.revokedAt && <Badge tone="danger">{t.revokedTag}</Badge>}
            </p>
            <code className="font-mono text-sm text-muted">{apiKey.prefix}…</code>
          </div>
          {!apiKey.revokedAt && (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              {t.revoke}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted">
          {t.created_(formatDate(apiKey.createdAt, locale))} ·{' '}
          {apiKey.lastUsedAt ? t.lastUsed(formatRelative(apiKey.lastUsedAt, locale)) : t.neverUsed}
        </p>
        {!apiKey.revokedAt && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>{t.quota(apiKey.usageToday, apiKey.dailyQuota)}</span>
            {usage.data && (
              <span className="flex items-center gap-2 text-muted">
                {t.usage}
                <Sparkline values={usage.data.days.map((d) => d.requests)} />
              </span>
            )}
          </div>
        )}
      </Card>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={t.revokeTitle} description={t.revokeBody}>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {messages.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => revoke.mutate({ params: { id: apiKey.id } })}
            >
              {t.revoke}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: platform.CreatedApiKey) => void;
}) {
  const messages = useT().s;
  const t = messages.devKeys;
  const [name, setName] = useState('');
  const create = useApiMutation('developer.keys.create', {
    invalidates: ['developer.keys.list'],
    onSuccess: (key) => {
      setName('');
      onClose();
      onCreated(key);
    },
  });
  const error = create.error;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ body: { name, scopes: ['curriculum:read'] } });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.createTitle}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error instanceof ApiError && !error.problem.errors?.length && (
            <Callout
              tone="danger"
              icon={<ShieldAlert />}
              title={error.status === 403 ? t.ageTitle : undefined}
            >
              {error.status === 403 ? t.ageBody : error.message}
            </Callout>
          )}
          <Field label={t.name} description={t.nameHelp} error={error?.fieldErrors().name} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">{t.scopes}</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked readOnly className="mt-1 accent-[var(--accent)]" />
              {t.scopeLabels['curriculum:read']}
            </label>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {messages.common.cancel}
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={name.trim().length < 2}
              data-testid="key-submit"
            >
              {t.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  created,
  onClose,
}: {
  created: platform.CreatedApiKey | null;
  onClose: () => void;
}) {
  const messages = useT().s;
  const t = messages.devKeys;
  const copy = async () => {
    await navigator.clipboard?.writeText(created!.secret).catch(() => {});
    toast.success(messages.common.copied);
  };
  return (
    <Dialog open={!!created} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.secretTitle} description={t.secretBody} hideClose>
        <div className="flex flex-col gap-3">
          <code
            className="break-all rounded-xl border border-border bg-surface-2 p-3 font-mono text-sm"
            data-testid="key-secret"
          >
            {created?.secret}
          </code>
          <Button variant="secondary" leftIcon={<Copy />} onClick={() => void copy()}>
            {t.secretCopy}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose} data-testid="key-saved">
            {t.secretDone}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
