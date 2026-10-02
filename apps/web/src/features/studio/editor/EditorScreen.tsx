'use client';

import {
  GraphConcept,
  Item,
  Lesson,
  Misconception,
  type ItemType,
} from '@logicpath/content-schema';
import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { authoring, content } from '@logicpath/contracts';
import { Button, Callout, Card, CardTitle, Skeleton, toast } from '@logicpath/ui';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ItemCard } from '@/entities/item/ItemCard';
import { bundle } from '@/shared/content/bundle';
import { useStrings } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';
import { withChange } from '../describe';
import { studioStrings } from '../strings';
import { blankItem, blankLesson, freshId } from './blank';
import { ProblemList, type Issue } from './fields';
import { ItemFields } from './ItemFields';
import { LessonPreview } from './LessonPreview';
import { ConceptFields, LessonFields, MisconceptionFields } from './OtherFields';

type Kind = content.ContentChange['kind'];
type Value = Item | Lesson | GraphConcept | Misconception;

/** What the editor needs from a schema: a yes or no, with the problems when it is no. */
interface Schema {
  safeParse(
    value: unknown,
  ):
    | { success: true }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

const SCHEMAS: Record<Kind, Schema> = {
  item: Item,
  lesson: Lesson,
  concept: GraphConcept,
  misconception: Misconception,
};
const KINDS = new Set<string>(['item', 'lesson', 'concept', 'misconception']);
const ITEM_TYPES = new Set<string>([
  'mcq',
  'predict-output',
  'fill-blank',
  'arrange-steps',
  'trace-table',
  'truth-table',
]);

const idOf = (kind: Kind, value: Value): string =>
  kind === 'lesson' ? (value as Lesson).concept : (value as { id: string }).id;

/** Where an editing session starts: the draft's own version, else what is live, else a blank form. */
function startingPoint(
  kind: Kind,
  targetId: string,
  draft: authoring.Draft,
  params: { type: string | null; concept: string | null },
): Value | null {
  const mine = draft.changes.find((c) => c.kind === kind && c.id === targetId && c.op === 'upsert');
  if (mine && mine.op === 'upsert') return mine.data as Value;
  if (targetId !== 'new') {
    if (kind === 'item') return bundle.items[targetId] ?? null;
    if (kind === 'lesson') return bundle.lessons[targetId] ?? null;
    if (kind === 'concept') {
      const found = bundle.concepts.find((c) => c.id === targetId);
      return found
        ? {
            id: found.id,
            stage: found.stage,
            title: found.title,
            prerequisites: [...found.prerequisites],
          }
        : null;
    }
    return bundle.misconceptions[targetId] ?? null;
  }
  const concept = params.concept ?? bundle.concepts[0]?.id ?? '';
  if (kind === 'item') {
    const taken = new Set([...Object.keys(bundle.items), ...draft.changes.map((c) => c.id)]);
    const type = (ITEM_TYPES.has(params.type ?? '') ? params.type : 'mcq') as ItemType;
    return blankItem(type, concept, freshId(`${concept}.new-question`, taken));
  }
  if (kind === 'lesson') return blankLesson(concept);
  if (kind === 'concept') {
    const taken = new Set(bundle.concepts.map((c) => c.id));
    return {
      id: freshId('stage.new-concept', taken),
      stage: bundle.stages[0]?.id ?? 0,
      title: { en: '', 'hi-Latn': '' },
      prerequisites: [],
    };
  }
  const taken = new Set(Object.keys(bundle.misconceptions));
  return {
    id: freshId('topic.new-mistake', taken),
    title: { en: '', 'hi-Latn': '' },
    explanation: { en: '', 'hi-Latn': '' },
  };
}

export function EditorScreen({
  draftId,
  kind,
  targetId,
}: {
  draftId: string;
  kind: string;
  targetId: string;
}) {
  const t = useStrings(studioStrings);
  const params = useSearchParams();
  const draft = useApi('studio.drafts.get', { params: { id: draftId } });

  if (!KINDS.has(kind)) return <Callout tone="danger">{t.editor.unknownKind}</Callout>;
  return (
    <QueryView query={draft} skeleton={<Skeleton className="h-96" />}>
      {(data) => {
        const start = startingPoint(kind as Kind, targetId, data, {
          type: params.get('type'),
          concept: params.get('concept'),
        });
        if (!start) return <Callout tone="danger">{t.editor.notFound}</Callout>;
        return (
          <Editor draft={data} kind={kind as Kind} initial={start} isNew={targetId === 'new'} />
        );
      }}
    </QueryView>
  );
}

function Editor({
  draft,
  kind,
  initial,
  isNew,
}: {
  draft: authoring.Draft;
  kind: Kind;
  initial: Value;
  isNew: boolean;
}) {
  const t = useStrings(studioStrings);
  const router = useRouter();
  const [value, setValue] = useState<Value>(initial);
  const save = useApiMutation('studio.drafts.update', {
    invalidates: ['studio.drafts.get', 'studio.drafts.list'],
    onSuccess: () => {
      toast.success(t.editor.saved);
      router.push(routes.draft(draft.id));
    },
  });

  const issues: Issue[] = useMemo(() => {
    const parsed = SCHEMAS[kind].safeParse(value);
    const found: Issue[] = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({
          path: i.path.map(String).join('.'),
          message: i.message,
        }));
    // Ids must be new when adding something.
    const id = idOf(kind, value);
    const taken =
      kind === 'item'
        ? id in bundle.items
        : kind === 'concept'
          ? bundle.concepts.some((c) => c.id === id)
          : kind === 'misconception'
            ? id in bundle.misconceptions
            : false;
    const inDraft = draft.changes.some(
      (c) => c.kind === kind && c.id === id && c.op === 'upsert' && isNew,
    );
    if (isNew && (taken || inDraft)) found.push({ path: 'id', message: 'This id is already used' });
    return found;
  }, [kind, value, draft.changes, isNew]);

  const valid = issues.length === 0;
  const onSave = () => {
    const id = idOf(kind, value);
    const change = { kind, op: 'upsert', id, data: value } as content.ContentChange;
    save.mutate({
      params: { id: draft.id },
      body: { changes: withChange(draft.changes, change, { kind, id }) },
    });
  };

  const title = isNew
    ? t.editor.newTitle(t.kind[kind])
    : t.editor.editTitle(t.kind[kind], idOf(kind, initial));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft />} className="self-start">
          <Link href={routes.draft(draft.id)}>{t.editor.back}</Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold" data-testid="editor-title">
            {title}
          </h1>
          <Button
            leftIcon={<Save />}
            loading={save.isPending}
            disabled={!valid}
            onClick={onSave}
            data-testid="editor-save"
          >
            {t.editor.save}
          </Button>
        </div>
        {!valid && <p className="text-sm text-muted">{t.editor.invalid}</p>}
        {save.error && <Callout tone="danger">{save.error.message}</Callout>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card className="flex flex-col gap-5" data-testid="editor-form">
          {kind === 'item' && (
            <ItemFields item={value as Item} set={setValue} issues={issues} isNew={isNew} />
          )}
          {kind === 'lesson' && (
            <LessonFields value={value as Lesson} set={setValue} issues={issues} isNew={isNew} />
          )}
          {kind === 'concept' && (
            <ConceptFields
              value={value as GraphConcept}
              set={setValue}
              issues={issues}
              isNew={isNew}
            />
          )}
          {kind === 'misconception' && (
            <MisconceptionFields
              value={value as Misconception}
              set={setValue}
              issues={issues}
              isNew={isNew}
            />
          )}
          <ProblemList issues={issues} title={t.editor.problems} />
        </Card>

        <aside
          className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start"
          aria-label={t.editor.preview}
        >
          <Card className="flex flex-col gap-3">
            <CardTitle>{t.editor.preview}</CardTitle>
            {kind === 'item' && (
              <>
                <p className="text-sm text-muted">{t.editor.previewHelp}</p>
                {valid ? (
                  <ItemCard
                    key={JSON.stringify(value)}
                    item={value as Item}
                    mode="practice"
                    source="lesson"
                    preview
                    onDone={() => {}}
                  />
                ) : (
                  <p className="text-sm text-muted">{t.editor.previewNeed}</p>
                )}
              </>
            )}
            {kind === 'lesson' && <LessonPreview lesson={value as Lesson} />}
            {(kind === 'concept' || kind === 'misconception') && (
              <p className="text-sm text-muted">
                {valid ? JSON.stringify(value, null, 2).slice(0, 400) : t.editor.previewNeed}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
