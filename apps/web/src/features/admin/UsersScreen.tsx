'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { Role } from '@logicpath/contracts';
import {
  Avatar,
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
  Segmented,
  Select,
  toast,
} from '@logicpath/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDate } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

type RoleFilter = Role | 'all';
type StatusFilter = 'active' | 'pending_consent' | 'suspended' | 'all';
const STEPS = [20, 50, 100] as const;

const STATUS_TONE = { active: 'success', pending_consent: 'warning', suspended: 'danger' } as const;

export function UsersScreen() {
  const t = useStrings(adminStrings).users;
  const common = useStrings(adminStrings).common;
  const locale = useLocale();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(input.trim());
      setStep(0);
    }, 250);
    return () => clearTimeout(id);
  }, [input]);

  const limit = STEPS[step]!;
  const users = useApi('admin.users.list', {
    query: {
      limit,
      ...(q ? { q } : {}),
      ...(role === 'all' ? {} : { role }),
      ...(status === 'all' ? {} : { status }),
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.intro}
        actions={
          <Button leftIcon={<Plus />} onClick={() => setCreating(true)} data-testid="user-add">
            {t.create}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field label={t.search} className="md:w-80">
          <Input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-testid="user-search"
          />
        </Field>
        <Segmented
          label={t.role}
          value={role}
          onChange={(r) => {
            setRole(r);
            setStep(0);
          }}
          options={[
            { value: 'all', label: common.all },
            ...(['student', 'writer', 'admin'] as const).map((value) => ({
              value,
              label: t.roles[value],
            })),
          ]}
        />
        <Segmented
          label={t.status}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setStep(0);
          }}
          options={[
            { value: 'all', label: common.all },
            ...(['active', 'pending_consent', 'suspended'] as const).map((value) => ({
              value,
              label: t.statuses[value],
            })),
          ]}
        />
      </div>
      <QueryView query={users}>
        {(data) => (
          <>
            <DataTable
              caption={t.caption}
              rows={data.items}
              rowKey={(u) => u.id}
              empty={t.empty}
              columns={[
                {
                  key: 'name',
                  header: t.columns.name,
                  sortValue: (u) => u.name.toLowerCase(),
                  cell: (u) => (
                    <Link
                      href={routes.adminUser(u.id)}
                      className="flex items-center gap-2 font-medium text-accent hover:underline"
                      data-testid="user-row"
                    >
                      <Avatar name={u.name} seed={u.id} size="sm" decorative />
                      {u.name}
                    </Link>
                  ),
                },
                {
                  key: 'email',
                  header: t.columns.email,
                  sortValue: (u) => u.email,
                  cell: (u) => u.email,
                },
                {
                  key: 'role',
                  header: t.columns.role,
                  sortValue: (u) => u.role,
                  cell: (u) => t.roles[u.role],
                },
                {
                  key: 'status',
                  header: t.columns.status,
                  cell: (u) => <Badge tone={STATUS_TONE[u.status]}>{t.statuses[u.status]}</Badge>,
                },
                {
                  key: 'joined',
                  header: t.columns.joined,
                  sortValue: (u) => u.createdAt,
                  cell: (u) => formatDate(u.createdAt, locale),
                },
              ]}
            />
            {data.nextCursor &&
              (step < STEPS.length - 1 ? (
                <div>
                  <Button variant="secondary" onClick={() => setStep(step + 1)}>
                    {common.showMore}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted">{common.refine}</p>
              ))}
          </>
        )}
      </QueryView>
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const strings = useStrings(adminStrings);
  const t = strings.users;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('writer');
  const create = useApiMutation('admin.users.create', {
    invalidates: ['admin.users.list'],
    onSuccess: () => {
      toast.success(t.created);
      setName('');
      setEmail('');
      setPassword('');
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ body: { name, email, password, role } });
  };
  const errors = create.error?.fieldErrors() ?? {};
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.createTitle}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {create.error && !create.error.problem.errors?.length && (
            <Callout tone="danger">{create.error.message}</Callout>
          )}
          <Field label={t.name} error={errors.name} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="new-user-name"
            />
          </Field>
          <Field label={t.email} error={errors.email} required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="new-user-email"
            />
          </Field>
          <Field label={t.columns.role}>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              data-testid="new-user-role"
            >
              {(['student', 'writer', 'admin'] as const).map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.password} description={t.passwordHelp} error={errors.password} required>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="new-user-password"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {strings.common.cancel}
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!name.trim() || !email.includes('@') || password.length < 8}
              data-testid="new-user-submit"
            >
              {strings.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
