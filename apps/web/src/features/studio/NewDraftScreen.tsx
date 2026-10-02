'use client';

import { useApiMutation } from '@logicpath/api-client/react';
import { Button, Callout, Card, Field, Input } from '@logicpath/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useStrings } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { studioStrings } from './strings';

export function NewDraftScreen() {
  const t = useStrings(studioStrings).create;
  const router = useRouter();
  const [title, setTitle] = useState('');
  const create = useApiMutation('studio.drafts.create', {
    invalidates: ['studio.drafts.list'],
    onSuccess: (draft) => router.push(routes.draft(draft.id)),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ body: { title, changes: [] } });
  };
  const error = create.error;
  return (
    <Card className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && !error.problem.errors?.length && <Callout tone="danger">{error.message}</Callout>}
        <Field label={t.name} description={t.nameHelp} error={error?.fieldErrors().title} required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            data-testid="draft-title"
          />
        </Field>
        <div>
          <Button
            type="submit"
            loading={create.isPending}
            disabled={title.trim().length < 3}
            data-testid="draft-create"
          >
            {t.submit}
          </Button>
        </div>
      </form>
    </Card>
  );
}
