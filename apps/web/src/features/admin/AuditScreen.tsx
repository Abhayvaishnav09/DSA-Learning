'use client';

import { useApi } from '@logicpath/api-client/react';
import { Badge, Button, DataTable, Field, Input, PageHeader, Select } from '@logicpath/ui';
import { useEffect, useState } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDateTime } from '@/shared/lib/format';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

const STEPS = [25, 50, 100] as const;
const TARGETS = [
  'user',
  'class',
  'flag',
  'api_key',
  'submission',
  'media',
  'content_version',
] as const;

export function AuditScreen() {
  const strings = useStrings(adminStrings);
  const t = strings.audit;
  const locale = useLocale();
  const [input, setInput] = useState('');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setAction(input.trim());
      setStep(0);
    }, 250);
    return () => clearTimeout(id);
  }, [input]);

  const list = useApi('admin.audit.list', {
    query: {
      limit: STEPS[step]!,
      ...(action ? { action } : {}),
      ...(target ? { targetType: target } : {}),
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field label={t.action} className="md:w-72">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="user.updated"
            className="font-mono"
            data-testid="audit-action"
          />
        </Field>
        <Field label={t.target} className="md:w-56">
          <Select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setStep(0);
            }}
          >
            <option value="">{t.anyTarget}</option>
            {TARGETS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <QueryView query={list}>
        {(data) => (
          <>
            <DataTable
              caption={t.caption}
              rows={data.items}
              rowKey={(e) => e.id}
              empty={t.empty}
              columns={[
                {
                  key: 'when',
                  header: t.columns.when,
                  sortValue: (e) => e.at,
                  cell: (e) => (
                    <span className="whitespace-nowrap">{formatDateTime(e.at, locale)}</span>
                  ),
                },
                {
                  key: 'who',
                  header: t.columns.who,
                  cell: (e) =>
                    e.actorId ? (
                      <span className="flex items-center gap-2">
                        {e.actorRole && <Badge tone="accent">{e.actorRole}</Badge>}
                        <code className="font-mono text-xs" title={e.actorId}>
                          {e.actorId.slice(0, 8)}
                        </code>
                      </span>
                    ) : (
                      t.system
                    ),
                },
                {
                  key: 'action',
                  header: t.columns.action,
                  sortValue: (e) => e.action,
                  cell: (e) => <code className="font-mono text-xs">{e.action}</code>,
                },
                {
                  key: 'target',
                  header: t.columns.target,
                  cell: (e) => (
                    <span className="text-xs">
                      {e.targetType}{' '}
                      <code className="font-mono text-muted">{e.targetId.slice(0, 12)}</code>
                    </span>
                  ),
                },
                {
                  key: 'details',
                  header: t.columns.details,
                  cell: (e) =>
                    Object.keys(e.details).length === 0 ? (
                      '–'
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs text-accent">{t.show}</summary>
                        <pre className="mt-1 max-w-72 overflow-x-auto rounded-lg bg-code p-2 font-mono text-xs">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    ),
                },
              ]}
            />
            {data.nextCursor && step < STEPS.length - 1 && (
              <div>
                <Button variant="secondary" onClick={() => setStep(step + 1)}>
                  {strings.common.showMore}
                </Button>
              </div>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}
