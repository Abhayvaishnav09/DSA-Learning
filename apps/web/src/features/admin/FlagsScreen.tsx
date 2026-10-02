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
  Switch,
  Textarea,
  toast,
} from '@logicpath/ui';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatRelative } from '@/shared/lib/format';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

type Role = platform.Flag['roles'][number];
type PlatformName = platform.Flag['platforms'][number];
const ROLES: Role[] = ['student', 'writer', 'admin'];
const PLATFORMS: PlatformName[] = ['web', 'android'];
const KEY = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;

const toChange = (flag: platform.Flag): platform.FlagChange => ({
  description: flag.description,
  enabled: flag.enabled,
  rolloutPercent: flag.rolloutPercent,
  roles: flag.roles,
  platforms: flag.platforms,
  minAppVersion: flag.minAppVersion,
  value: flag.value,
});

export function FlagsScreen() {
  const strings = useStrings(adminStrings);
  const t = strings.flags;
  const locale = useLocale();
  const list = useApi('admin.flags.list');
  const [editing, setEditing] = useState<{ key: string; flag: platform.Flag | null } | null>(null);
  const put = useApiMutation('admin.flags.put', {
    invalidates: ['admin.flags.list', 'flags.evaluate', 'home'],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.intro}
        actions={
          <Button
            leftIcon={<Plus />}
            onClick={() => setEditing({ key: '', flag: null })}
            data-testid="flag-new"
          >
            {t.create}
          </Button>
        }
      />
      <QueryView query={list}>
        {(data) => (
          <DataTable
            caption={t.caption}
            rows={data.items}
            rowKey={(f) => f.key}
            empty={t.empty}
            columns={[
              {
                key: 'key',
                header: t.columns.key,
                sortValue: (f) => f.key,
                cell: (f) => (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="text-left font-mono font-medium text-accent hover:underline"
                      onClick={() => setEditing({ key: f.key, flag: f })}
                      data-testid={`flag-${f.key}`}
                    >
                      {f.key}
                    </button>
                    <span className="text-xs text-muted">{f.description}</span>
                  </div>
                ),
              },
              {
                key: 'on',
                header: t.columns.on,
                cell: (f) => (
                  <Switch
                    label={`${t.columns.on}: ${f.key}`}
                    checked={f.enabled}
                    onCheckedChange={(enabled) =>
                      put.mutate(
                        { params: { key: f.key }, body: { ...toChange(f), enabled } },
                        { onSuccess: () => void toast.success(t.saved) },
                      )
                    }
                  />
                ),
              },
              {
                key: 'rollout',
                header: t.columns.rollout,
                sortValue: (f) => f.rolloutPercent,
                cell: (f) => `${f.rolloutPercent}%`,
              },
              {
                key: 'who',
                header: t.columns.who,
                cell: (f) => (
                  <span className="flex flex-wrap gap-1">
                    {f.roles.length === 0 && f.platforms.length === 0 ? (
                      <Badge>{t.everyone}</Badge>
                    ) : (
                      <>
                        {f.roles.map((r) => (
                          <Badge key={r} tone="accent">
                            {t.roleNames[r]}
                          </Badge>
                        ))}
                        {f.platforms.map((p) => (
                          <Badge key={p} tone="info">
                            {t.platformNames[p]}
                          </Badge>
                        ))}
                      </>
                    )}
                  </span>
                ),
              },
              {
                key: 'updated',
                header: t.columns.updated,
                sortValue: (f) => f.updatedAt,
                cell: (f) => formatRelative(f.updatedAt, locale),
              },
            ]}
          />
        )}
      </QueryView>
      {editing && (
        <FlagDialog key={editing.key || 'new'} editing={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function FlagDialog({
  editing,
  onClose,
}: {
  editing: { key: string; flag: platform.Flag | null };
  onClose: () => void;
}) {
  const strings = useStrings(adminStrings);
  const t = strings.flags;
  const base = editing.flag ? toChange(editing.flag) : null;
  const [key, setKey] = useState(editing.key);
  const [description, setDescription] = useState(base?.description ?? '');
  const [enabled, setEnabled] = useState(base?.enabled ?? true);
  const [rollout, setRollout] = useState(base?.rolloutPercent ?? 100);
  const [roles, setRoles] = useState<Role[]>(base?.roles ?? []);
  const [platforms, setPlatforms] = useState<PlatformName[]>(base?.platforms ?? []);
  const [minVersion, setMinVersion] = useState(base?.minAppVersion ?? '');
  const [valueText, setValueText] = useState(
    base && base.value !== null && base.value !== undefined ? JSON.stringify(base.value) : '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  let value: unknown = null;
  let valueError: string | undefined;
  if (valueText.trim()) {
    try {
      value = JSON.parse(valueText);
    } catch {
      valueError = t.valueBad;
    }
  }

  const close = () => {
    onClose();
  };
  const put = useApiMutation('admin.flags.put', {
    invalidates: ['admin.flags.list', 'flags.evaluate', 'home'],
    onSuccess: () => {
      toast.success(t.saved);
      close();
    },
  });
  const remove = useApiMutation('admin.flags.delete', {
    invalidates: ['admin.flags.list', 'flags.evaluate', 'home'],
    onSuccess: () => {
      toast.success(t.deleted);
      close();
    },
  });

  const toggle = <T,>(list: T[], item: T, on: boolean): T[] =>
    on ? [...list, item] : list.filter((x) => x !== item);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    put.mutate({
      params: { key },
      body: {
        description,
        enabled,
        rolloutPercent: rollout,
        roles,
        platforms,
        minAppVersion: minVersion.trim() || null,
        value,
      },
    });
  };
  const keyOk = KEY.test(key);

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent
        title={editing.flag ? t.editTitle(editing.key) : t.createTitle}
        className="max-w-xl"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {put.error && <Callout tone="danger">{put.error.message}</Callout>}
          <Field
            label={t.key}
            description={editing.flag ? undefined : t.keyHelp}
            error={key && !keyOk ? t.keyHelp : undefined}
            required
          >
            <Input
              value={key}
              readOnly={!!editing.flag}
              className="font-mono"
              onChange={(e) => setKey(e.target.value.trim())}
              data-testid="flag-key"
            />
          </Field>
          <Field label={t.description}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Switch label={t.enabled} checked={enabled} onCheckedChange={setEnabled} />
          <Field label={`${t.rollout}: ${rollout}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={rollout}
              onChange={(e) => setRollout(Number(e.target.value))}
              className="accent-[var(--accent)]"
              data-testid="flag-rollout"
            />
          </Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">{t.roles}</legend>
            <div className="flex flex-wrap gap-4">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={roles.includes(r)}
                    onChange={(e) => setRoles(toggle(roles, r, e.target.checked))}
                  />
                  {t.roleNames[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">{t.platforms}</legend>
            <div className="flex flex-wrap gap-4">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={platforms.includes(p)}
                    onChange={(e) => setPlatforms(toggle(platforms, p, e.target.checked))}
                  />
                  {t.platformNames[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t.minVersion}>
            <Input
              value={minVersion}
              onChange={(e) => setMinVersion(e.target.value)}
              placeholder="1.4.0"
            />
          </Field>
          <Field label={t.value} error={valueError}>
            <Textarea
              rows={3}
              value={valueText}
              spellCheck={false}
              className="font-mono text-sm"
              onChange={(e) => setValueText(e.target.value)}
            />
          </Field>
          <DialogFooter className="justify-between">
            {editing.flag ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                {t.delete}
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                {strings.common.cancel}
              </Button>
              <Button
                type="submit"
                loading={put.isPending}
                disabled={!keyOk || !!valueError}
                data-testid="flag-save"
              >
                {strings.common.save}
              </Button>
            </span>
          </DialogFooter>
          {confirmDelete && (
            <Callout tone="danger" title={t.deleteTitle}>
              <p className="mb-2">{t.deleteBody}</p>
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={remove.isPending}
                onClick={() => remove.mutate({ params: { key } })}
                data-testid="flag-delete-confirm"
              >
                {t.delete}
              </Button>
            </Callout>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
