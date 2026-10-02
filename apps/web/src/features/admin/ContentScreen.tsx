'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { content } from '@logicpath/contracts';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  PageHeader,
  Textarea,
  toast,
} from '@logicpath/ui';
import { History } from 'lucide-react';
import { useState } from 'react';
import { refreshContent } from '@/shared/content/live';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDateTime } from '@/shared/lib/format';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

export function ContentScreen() {
  const strings = useStrings(adminStrings);
  const t = strings.content;
  const locale = useLocale();
  const versions = useApi('admin.content.versions', { query: { limit: 50 } });
  const manifest = useApi('content.manifest');
  const [target, setTarget] = useState<content.Version | null>(null);
  const [note, setNote] = useState('');
  const rollback = useApiMutation('admin.content.rollback', {
    invalidates: ['admin.content.versions', 'content.manifest'],
    onSuccess: () => {
      setTarget(null);
      setNote('');
      toast.success(t.done);
      // The app itself picks the restored lessons up straight away.
      void refreshContent();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />
      {manifest.data && (
        <Card className="flex flex-wrap items-center gap-3">
          <History className="size-5 text-muted" aria-hidden />
          <div>
            <p className="text-sm text-muted">{t.live}</p>
            <p className="font-semibold" data-testid="live-manifest">
              v{manifest.data.number} · {t.stats(manifest.data.concepts, manifest.data.items)}
            </p>
          </div>
        </Card>
      )}
      <QueryView query={versions}>
        {(data) => (
          <DataTable
            caption={t.caption}
            rows={data.items}
            rowKey={(v) => v.id}
            columns={[
              {
                key: 'v',
                header: t.columns.version,
                sortValue: (v) => v.number,
                cell: (v) => <span className="font-mono">v{v.number}</span>,
              },
              { key: 'note', header: t.columns.note, cell: (v) => v.note },
              {
                key: 'at',
                header: t.columns.published,
                sortValue: (v) => v.publishedAt,
                cell: (v) => formatDateTime(v.publishedAt, locale),
              },
              {
                key: 'status',
                header: t.columns.status,
                cell: (v) =>
                  v.current ? (
                    <Badge tone="success">{t.current}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setTarget(v)}
                      data-testid={`rollback-${v.number}`}
                    >
                      {t.rollback}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </QueryView>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent title={t.rollbackTitle(target?.number ?? 0)} description={t.rollbackBody}>
          <Field label={t.note}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={rollback.isPending}
              onClick={() =>
                rollback.mutate({
                  params: { id: target!.id },
                  body: note.trim() ? { note: note.trim() } : {},
                })
              }
              data-testid="rollback-confirm"
            >
              {t.rollback}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
