'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { engagement } from '@logicpath/contracts';
import {
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
import { Copy, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ClassSheet } from '@/features/classes/ClassesScreen';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDate } from '@/shared/lib/format';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

export function AdminClassesScreen() {
  const strings = useStrings(adminStrings);
  const t = strings.classes;
  const locale = useLocale();
  const list = useApi('admin.classes.list', { query: { limit: 100 } });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<engagement.ClassSummary | null>(null);

  const newCode = useApiMutation('admin.classes.newCode', {
    invalidates: ['admin.classes.list', 'classes.get'],
    onSuccess: () => void toast.success(t.newCodeDone),
  });
  const remove = useApiMutation('admin.classes.delete', {
    invalidates: ['admin.classes.list'],
    onSuccess: () => {
      setDeleting(null);
      toast.success(t.deleted);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.intro}
        actions={
          <Button leftIcon={<Plus />} onClick={() => setCreating(true)} data-testid="class-new">
            {t.create}
          </Button>
        }
      />
      <QueryView query={list}>
        {(data) => (
          <DataTable
            caption={t.caption}
            rows={data.items}
            rowKey={(c) => c.id}
            empty={t.empty}
            columns={[
              {
                key: 'name',
                header: t.columns.name,
                sortValue: (c) => c.name.toLowerCase(),
                cell: (c) => (
                  <button
                    type="button"
                    className="font-medium text-accent hover:underline"
                    onClick={() => setOpen(c.id)}
                    data-testid="class-open"
                  >
                    {c.name}
                  </button>
                ),
              },
              {
                key: 'code',
                header: t.columns.code,
                cell: (c) => (
                  <span className="inline-flex items-center gap-2 font-mono tracking-widest">
                    {c.code}
                    <button
                      type="button"
                      aria-label={`${strings.common.copy} ${c.code}`}
                      className="text-muted hover:text-fg"
                      onClick={() => {
                        void navigator.clipboard?.writeText(c.code ?? '').catch(() => {});
                        toast.success(strings.common.copied);
                      }}
                    >
                      <Copy className="size-4" aria-hidden />
                    </button>
                  </span>
                ),
              },
              {
                key: 'teacher',
                header: t.columns.teacher,
                sortValue: (c) => c.ownerName,
                cell: (c) => c.ownerName,
              },
              {
                key: 'members',
                header: t.columns.members,
                sortValue: (c) => c.memberCount,
                cell: (c) => c.memberCount,
              },
              {
                key: 'created',
                header: t.columns.created,
                sortValue: (c) => c.createdAt,
                cell: (c) => formatDate(c.createdAt, locale),
              },
              {
                key: 'actions',
                header: '',
                cell: (c) => (
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={newCode.isPending && newCode.variables?.params.id === c.id}
                      onClick={() => newCode.mutate({ params: { id: c.id } })}
                    >
                      {t.newCode}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                      {t.delete}
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </QueryView>
      <CreateClassDialog open={creating} onClose={() => setCreating(false)} />
      <ClassSheet id={open} onClose={() => setOpen(null)} />
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent title={t.deleteTitle} description={t.deleteBody}>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate({ params: { id: deleting!.id } })}
              data-testid="class-delete-confirm"
            >
              {t.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const strings = useStrings(adminStrings);
  const t = strings.classes;
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const writers = useApi(
    'admin.users.list',
    { query: { role: 'writer', limit: 100 } },
    { enabled: open },
  );
  const admins = useApi(
    'admin.users.list',
    { query: { role: 'admin', limit: 100 } },
    { enabled: open },
  );
  const owners = [...(admins.data?.items ?? []), ...(writers.data?.items ?? [])];
  const create = useApiMutation('admin.classes.create', {
    invalidates: ['admin.classes.list'],
    onSuccess: () => {
      toast.success(t.created);
      setName('');
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ body: { name, ...(owner ? { ownerId: owner } : {}) } });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.createTitle}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {create.error && !create.error.problem.errors?.length && (
            <Callout tone="danger">{create.error.message}</Callout>
          )}
          <Field label={t.name} error={create.error?.fieldErrors().name} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              data-testid="class-name"
            />
          </Field>
          <Field label={t.teacher}>
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">{strings.common.you}</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={name.trim().length < 2}
              data-testid="class-create"
            >
              {strings.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
