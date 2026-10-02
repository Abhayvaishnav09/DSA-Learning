'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { authoring, content } from '@logicpath/contracts';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Skeleton,
  Textarea,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { ArrowLeft, CircleCheck, MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { bundle } from '@/shared/content/bundle';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDateTime } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';
import { describeChange } from '../studio/describe';
import { StatusBadge } from '../studio/StatusBadge';
import { diffValues } from './diff';
import { adminStrings } from './strings';

export function SubmissionScreen({ id }: { id: string }) {
  const submission = useApi('admin.review.get', { params: { id } });
  return (
    <QueryView query={submission} skeleton={<Skeleton className="h-96" />}>
      {(data) => <SubmissionView draft={data} />}
    </QueryView>
  );
}

/** What is live now for a change, to compare the proposal against. */
function liveVersion(change: content.ContentChange): unknown {
  if (change.kind === 'item') return bundle.items[change.id];
  if (change.kind === 'lesson') return bundle.lessons[change.id];
  if (change.kind === 'misconception') return bundle.misconceptions[change.id];
  const concept = bundle.concepts.find((c) => c.id === change.id);
  return (
    concept && {
      id: concept.id,
      stage: concept.stage,
      title: concept.title,
      prerequisites: concept.prerequisites,
    }
  );
}

function ChangeDiff({ change }: { change: content.ContentChange }) {
  const t = useStrings(adminStrings).submission;
  const locale = useLocale();
  const line = describeChange(change, locale, bundle);
  const before = liveVersion(change);
  const rows = change.op === 'delete' ? [] : diffValues(before, change.data);
  return (
    <li className="flex flex-col gap-2 py-4" data-testid="submission-change">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={change.op === 'delete' ? 'danger' : before ? 'accent' : 'success'}>
          {t.kind[change.kind]}
        </Badge>
        <span className="font-medium">{line.label}</span>
        <code className="font-mono text-xs text-muted">{change.id}</code>
        {change.op === 'upsert' && !before && <Badge tone="success">{t.isNew}</Badge>}
      </div>
      {change.op === 'delete' ? (
        <p className="text-sm text-danger">{t.removes}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{t.unchanged}</p>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label={`${t.diff}: ${line.label}`}
          className="overflow-x-auto rounded-xl border border-border"
        >
          <table className="w-full min-w-96 text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Field
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t.before}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t.after}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-1.5 font-mono text-xs font-normal text-muted">
                    {row.path || '·'}
                  </th>
                  <td className="whitespace-pre-wrap break-words px-3 py-1.5 text-danger">
                    {row.before ?? '–'}
                  </td>
                  <td className="whitespace-pre-wrap break-words px-3 py-1.5 text-success">
                    {row.after ?? '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function SubmissionView({ draft }: { draft: authoring.Draft }) {
  const strings = useStrings(adminStrings);
  const t = strings.submission;
  const common = strings.common;
  const locale = useLocale();
  const [dialog, setDialog] = useState<'approve' | 'changes' | null>(null);
  const [comment, setComment] = useState('');
  const waiting = draft.status === 'in_review';
  const refresh = [
    'admin.review.get',
    'admin.review.list',
    'content.manifest',
    'admin.content.versions',
  ] as const;

  const approve = useApiMutation('admin.review.approve', {
    invalidates: [...refresh],
    onSuccess: () => {
      setDialog(null);
      toast.success(t.approved);
    },
  });
  const request = useApiMutation('admin.review.requestChanges', {
    invalidates: [...refresh],
    onSuccess: () => {
      setDialog(null);
      toast.success(t.sentBack);
    },
  });
  const close = () => {
    setDialog(null);
    setComment('');
  };

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft />}>
          <Link href={routes.adminReview}>{t.back}</Link>
        </Button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl" data-testid="submission-title">
              {draft.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={draft.status} />
              <span>{t.by(draft.authorName)}</span>
              {draft.submittedAt && <span>· {formatDateTime(draft.submittedAt, locale)}</span>}
            </div>
          </div>
          {waiting && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                leftIcon={<MessageSquareWarning />}
                onClick={() => setDialog('changes')}
                data-testid="request-changes"
              >
                {t.requestChanges}
              </Button>
              <Button
                leftIcon={<CircleCheck />}
                onClick={() => setDialog('approve')}
                data-testid="approve"
              >
                {t.approve}
              </Button>
            </div>
          )}
        </div>
      </StaggerItem>

      {!waiting && (
        <StaggerItem>
          <Callout tone={draft.publishedVersion !== null ? 'success' : 'info'}>
            {draft.publishedVersion !== null ? t.publishedAs(draft.publishedVersion) : t.notReady}
          </Callout>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card className="flex flex-col gap-1">
          <CardTitle>{t.changes}</CardTitle>
          <ul className="flex flex-col divide-y divide-border">
            {draft.changes.map((change) => (
              <ChangeDiff key={`${change.kind}:${change.id}`} change={change} />
            ))}
          </ul>
        </Card>
      </StaggerItem>

      {draft.issues.length > 0 && (
        <StaggerItem>
          <Callout tone="warning" title={t.issues}>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {draft.issues.map((issue, i) => (
                <li key={i}>
                  <Badge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                    {issue.severity}
                  </Badge>{' '}
                  <code className="font-mono text-xs">{issue.file}</code> {issue.message}
                </li>
              ))}
            </ul>
          </Callout>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card className="flex flex-col gap-3">
          <CardTitle>{t.activity}</CardTitle>
          <ol className="flex flex-col gap-3">
            {[...draft.activity].reverse().map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <span className="text-sm font-medium">
                  {t.action[a.action]} · {a.actorId ? a.actorName : 'System'}
                </span>
                <span className="text-xs text-muted">{formatDateTime(a.at, locale)}</span>
                {a.comment && <span className="text-sm">{a.comment}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </StaggerItem>

      <Dialog open={dialog === 'approve'} onOpenChange={(o) => !o && close()}>
        <DialogContent title={t.approveTitle} description={t.approveBody}>
          <Field label={t.comment}>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
            />
          </Field>
          {approve.error && (
            <Callout tone="danger" className="mt-3">
              {approve.error.message}
            </Callout>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={close}>
              {common.cancel}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approve.mutate({
                  params: { id: draft.id },
                  body: comment.trim() ? { comment: comment.trim() } : {},
                })
              }
              data-testid="approve-confirm"
            >
              {t.approve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'changes'} onOpenChange={(o) => !o && close()}>
        <DialogContent title={t.requestTitle} description={t.requestBody}>
          <Field label={t.requestComment} required>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              data-testid="request-comment"
            />
          </Field>
          {request.error && (
            <Callout tone="danger" className="mt-3">
              {request.error.message}
            </Callout>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={close}>
              {common.cancel}
            </Button>
            <Button
              loading={request.isPending}
              disabled={comment.trim().length === 0}
              onClick={() =>
                request.mutate({ params: { id: draft.id }, body: { comment: comment.trim() } })
              }
              data-testid="request-confirm"
            >
              {t.requestChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stagger>
  );
}
