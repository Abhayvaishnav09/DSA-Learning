'use client';

import { ApiError } from '@logicpath/api-client';
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
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import {
  ArrowLeft,
  BookOpen,
  CircleAlert,
  CircleCheck,
  FileQuestion,
  Lightbulb,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { bundle, text } from '@/shared/content/bundle';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatDateTime } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';
import { describeChange, withChange } from './describe';
import { StatusBadge } from './StatusBadge';
import { studioStrings } from './strings';

type Kind = content.ContentChange['kind'];
const KIND_ICON = {
  concept: Workflow,
  lesson: BookOpen,
  item: FileQuestion,
  misconception: Lightbulb,
} as const;
const ITEM_TYPES = [
  'mcq',
  'predict-output',
  'fill-blank',
  'arrange-steps',
  'trace-table',
  'truth-table',
] as const;

export function DraftScreen({ id }: { id: string }) {
  const draft = useApi('studio.drafts.get', { params: { id } });
  return (
    <QueryView query={draft} skeleton={<Skeleton className="h-96" />}>
      {(data) => <DraftView draft={data} />}
    </QueryView>
  );
}

function DraftView({ draft }: { draft: authoring.Draft }) {
  const t = useStrings(studioStrings);
  const locale = useLocale();
  const router = useRouter();
  const editable = draft.status === 'draft' || draft.status === 'changes_requested';
  const [title, setTitle] = useState(draft.title);
  const [report, setReport] = useState<authoring.Validation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = ['studio.drafts.get', 'studio.drafts.list'] as const;
  const update = useApiMutation('studio.drafts.update', { invalidates: [...refresh] });
  const validate = useApiMutation('studio.drafts.validate', { onSuccess: setReport });
  const submit = useApiMutation('studio.drafts.submit', {
    invalidates: [...refresh],
    onSuccess: () => void toast.success(t.draft.submitted),
  });
  const withdraw = useApiMutation('studio.drafts.withdraw', {
    invalidates: [...refresh],
    onSuccess: () => void toast.success(t.draft.withdrawn),
  });
  const remove = useApiMutation('studio.drafts.delete', {
    invalidates: ['studio.drafts.list'],
    onSuccess: () => {
      toast.success(t.draft.deleted);
      router.push(routes.drafts);
    },
  });

  const asked = [...draft.activity].reverse().find((a) => a.action === 'changes_requested');
  const issues = report?.issues ?? draft.issues;
  const submitError = submit.error;
  const dropChange = (change: content.ContentChange) =>
    update.mutate(
      {
        params: { id: draft.id },
        body: { changes: withChange(draft.changes, null, { kind: change.kind, id: change.id }) },
      },
      { onSuccess: () => void toast.success(t.draft.removed) },
    );

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft />}>
          <Link href={routes.drafts}>{t.draft.back}</Link>
        </Button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl" data-testid="draft-heading">
              {draft.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={draft.status} />
              <span>{draft.authorName}</span>
              <span>· {formatDateTime(draft.updatedAt, locale)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <>
                <Button
                  variant="secondary"
                  loading={validate.isPending}
                  onClick={() => validate.mutate({ params: { id: draft.id } })}
                  data-testid="draft-check"
                >
                  {validate.isPending ? t.draft.checking : t.draft.check}
                </Button>
                <Button
                  leftIcon={<Send />}
                  loading={submit.isPending}
                  disabled={draft.changes.length === 0}
                  onClick={() => submit.mutate({ params: { id: draft.id } })}
                  data-testid="draft-submit"
                >
                  {t.draft.submit}
                </Button>
              </>
            )}
            {draft.status === 'in_review' && (
              <Button
                variant="secondary"
                leftIcon={<Undo2 />}
                loading={withdraw.isPending}
                onClick={() => withdraw.mutate({ params: { id: draft.id } })}
                data-testid="draft-withdraw"
              >
                {t.draft.withdraw}
              </Button>
            )}
            {editable && (
              <Button variant="ghost" leftIcon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
                {t.draft.delete}
              </Button>
            )}
          </div>
        </div>
        {editable && draft.changes.length === 0 && (
          <p className="mt-2 text-sm text-muted">{t.draft.needChanges}</p>
        )}
      </StaggerItem>

      {draft.status === 'changes_requested' && asked?.comment && (
        <StaggerItem>
          <Callout tone="warning" title={t.draft.reviewerSays}>
            <p data-testid="reviewer-comment">{asked.comment}</p>
          </Callout>
        </StaggerItem>
      )}
      {draft.publishedVersion !== null && (
        <StaggerItem>
          <Callout tone="success" icon={<CircleCheck />}>
            {t.draft.publishedAs(draft.publishedVersion)}
          </Callout>
        </StaggerItem>
      )}
      {draft.status === 'in_review' && (
        <StaggerItem>
          <Callout tone="info">{t.draft.locked}</Callout>
        </StaggerItem>
      )}
      {submitError instanceof ApiError && (
        <StaggerItem>
          <Callout tone="danger">{submitError.message}</Callout>
        </StaggerItem>
      )}

      {editable && (
        <StaggerItem>
          <Card className="flex flex-col gap-3">
            <CardTitle>{t.draft.rename}</CardTitle>
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate(
                  { params: { id: draft.id }, body: { title } },
                  { onSuccess: () => void toast.success(t.draft.titleSaved) },
                );
              }}
            >
              <Field
                label={t.draft.titleLabel}
                className="flex-1"
                error={update.error?.fieldErrors().title}
              >
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                loading={update.isPending}
                disabled={title.trim().length < 3 || title.trim() === draft.title}
              >
                {t.draft.saveTitle}
              </Button>
            </form>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card className="flex flex-col gap-4">
          <CardTitle>{t.draft.changes}</CardTitle>
          {draft.changes.length === 0 ? (
            <EmptyState icon={<Pencil />} title={t.draft.noChanges} />
          ) : (
            <ul className="flex flex-col divide-y divide-border" data-testid="change-list">
              {draft.changes.map((change) => {
                const line = describeChange(change, locale, bundle);
                const Icon = KIND_ICON[line.kind];
                return (
                  <li
                    key={`${change.kind}:${change.id}`}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{line.label}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge tone={line.remove ? 'danger' : 'accent'}>{t.kind[line.kind]}</Badge>
                        <code className="font-mono">{line.id}</code>
                        <span>{line.remove ? t.op.delete : t.op.upsert}</span>
                      </span>
                    </div>
                    {editable && (
                      <div className="flex gap-2">
                        {!line.remove && (
                          <Button asChild size="sm" variant="secondary" leftIcon={<Pencil />}>
                            <Link href={routes.editInDraft(draft.id, line.kind, line.id)}>
                              {t.draft.edit}
                            </Link>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => dropChange(change)}>
                          {t.draft.remove}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {editable && (
            <AddChange
              draft={draft}
              onDelete={(c) =>
                update.mutate({
                  params: { id: draft.id },
                  body: { changes: withChange(draft.changes, c, { kind: c.kind, id: c.id }) },
                })
              }
            />
          )}
        </Card>
      </StaggerItem>

      {(issues.length > 0 || report) && (
        <StaggerItem>
          <Callout
            tone={
              report ? (report.ok ? (issues.length ? 'warning' : 'success') : 'danger') : 'warning'
            }
            icon={report?.ok && issues.length === 0 ? <CircleCheck /> : <CircleAlert />}
            title={
              report
                ? report.ok
                  ? issues.length
                    ? t.draft.checkWarn
                    : t.draft.checkOk
                  : t.draft.checkFail
                : t.draft.issues
            }
          >
            {issues.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1.5 text-sm" data-testid="draft-issues">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <Badge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                      {issue.severity}
                    </Badge>{' '}
                    <code className="font-mono text-xs">{issue.file}</code> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </Callout>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card className="flex flex-col gap-3">
          <CardTitle>{t.draft.activity}</CardTitle>
          <ol className="flex flex-col gap-3" data-testid="activity">
            {[...draft.activity].reverse().map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <span className="text-sm font-medium">
                  {t.draft.action[a.action]} · {a.actorId ? a.actorName : t.draft.system}
                </span>
                <span className="text-xs text-muted">{formatDateTime(a.at, locale)}</span>
                {a.comment && <span className="text-sm">{a.comment}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </StaggerItem>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={t.draft.deleteTitle} description={t.draft.deleteBody}>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t.draft.cancel}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate({ params: { id: draft.id } })}
              data-testid="draft-delete-confirm"
            >
              {t.draft.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stagger>
  );
}

type Pick = 'item' | 'lesson' | 'concept' | 'misconception' | 'edit' | 'delete';

/** The row of buttons that starts a new change, each opening a small chooser first. */
function AddChange({
  draft,
  onDelete,
}: {
  draft: authoring.Draft;
  onDelete: (change: content.ContentChange) => void;
}) {
  const t = useStrings(studioStrings);
  const router = useRouter();
  const [pick, setPick] = useState<Pick | null>(null);
  const close = () => setPick(null);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-sm font-semibold">{t.draft.add}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          onClick={() => setPick('item')}
          data-testid="add-item"
        >
          {t.draft.newItem}
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={() => setPick('lesson')}>
          {t.draft.newLesson}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          onClick={() => router.push(routes.newInDraft(draft.id, 'concept'))}
        >
          {t.draft.newConcept}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          onClick={() => router.push(routes.newInDraft(draft.id, 'misconception'))}
        >
          {t.draft.newMistake}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Pencil />}
          onClick={() => setPick('edit')}
          data-testid="edit-existing"
        >
          {t.draft.editExisting}
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={() => setPick('delete')}>
          {t.draft.deleteExisting}
        </Button>
      </div>
      <Chooser draft={draft} pick={pick} onClose={close} onDelete={onDelete} />
    </div>
  );
}

function Chooser({
  draft,
  pick,
  onClose,
  onDelete,
}: {
  draft: authoring.Draft;
  pick: Pick | null;
  onClose: () => void;
  onDelete: (change: content.ContentChange) => void;
}) {
  const t = useStrings(studioStrings);
  const locale = useLocale();
  const router = useRouter();
  const [type, setType] = useState<(typeof ITEM_TYPES)[number]>('mcq');
  const [concept, setConcept] = useState(bundle.concepts[0]?.id ?? '');
  const [kind, setKind] = useState<Kind>('item');
  const [target, setTarget] = useState('');

  const options: Record<Kind, { id: string; label: string }[]> = {
    item: Object.values(bundle.items)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => ({ id: i.id, label: `${i.id}: ${text(i.prompt, locale).slice(0, 60)}` })),
    lesson: Object.values(bundle.lessons).map((l) => ({
      id: l.concept,
      label: `${l.concept}: ${text(l.story.title, locale)}`,
    })),
    concept: bundle.concepts.map((c) => ({ id: c.id, label: `${c.id}: ${text(c.title, locale)}` })),
    misconception: Object.values(bundle.misconceptions).map((m) => ({
      id: m.id,
      label: `${m.id}: ${text(m.title, locale)}`,
    })),
  };
  const chosen = target || options[kind][0]?.id || '';

  const go = () => {
    if (pick === 'item') router.push(routes.newInDraft(draft.id, 'item', { type, concept }));
    else if (pick === 'lesson') router.push(routes.newInDraft(draft.id, 'lesson', { concept }));
    else if (pick === 'edit') router.push(routes.editInDraft(draft.id, kind, chosen));
    else if (pick === 'delete') {
      onDelete({ kind, op: 'delete', id: chosen });
      onClose();
    }
  };
  const title =
    pick === 'item'
      ? t.draft.newItem
      : pick === 'lesson'
        ? t.draft.newLesson
        : pick === 'edit'
          ? t.draft.editExisting
          : t.draft.deleteExisting;

  return (
    <Dialog
      open={pick === 'item' || pick === 'lesson' || pick === 'edit' || pick === 'delete'}
      onOpenChange={(o) => !o && onClose()}
    >
      <DialogContent title={title}>
        <div className="flex flex-col gap-4">
          {pick === 'item' && (
            <Field label={t.editor.chooseType}>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                data-testid="pick-type"
              >
                {ITEM_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t.itemType[value]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(pick === 'item' || pick === 'lesson') && (
            <Field label={t.editor.chooseConcept}>
              <Select
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                data-testid="pick-concept"
              >
                {bundle.concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {text(c.title, locale)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(pick === 'edit' || pick === 'delete') && (
            <>
              <Segmented
                label={t.draft.pick}
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setTarget('');
                }}
                options={(['item', 'lesson', 'concept', 'misconception'] as const).map((value) => ({
                  value,
                  label: t.kind[value],
                }))}
              />
              <Select
                value={chosen}
                onChange={(e) => setTarget(e.target.value)}
                aria-label={t.draft.pick}
                data-testid="pick-target"
              >
                {options[kind].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={go}
            variant={pick === 'delete' ? 'danger' : 'primary'}
            disabled={(pick === 'edit' || pick === 'delete') && !chosen}
            data-testid="pick-go"
          >
            {pick === 'delete' ? t.draft.delChange : t.draft.edit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
