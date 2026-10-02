'use client';

import { ApiError } from '@logicpath/api-client';
import { useApiMutation } from '@logicpath/api-client/react';
import { Button, Callout, Card } from '@logicpath/ui';
import { CircleCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

/** Opens from a class invitation link: shows the code and joins only when the learner says so. */
export function JoinClassScreen({ code }: { code: string }) {
  const t = useT().s.classes.joinPage;
  const upper = code.toUpperCase();
  const join = useApiMutation('classes.join', {
    invalidates: ['classes.mine', 'home', 'rewards.me', 'notifications.list'],
  });
  const notFound = join.error instanceof ApiError && join.error.status === 404;

  if (join.isSuccess) {
    return (
      <Card className="flex flex-col items-start gap-4" data-testid="join-done">
        <span className="grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">{t.done}</h1>
        <p className="text-muted">{join.data.name}</p>
        <Button asChild>
          <Link href={routes.classes}>{t.openClasses}</Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col items-start gap-4">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Users className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-muted">{t.body(upper)}</p>
      {join.error && <Callout tone="danger">{notFound ? t.notFound : join.error.message}</Callout>}
      <Button
        size="lg"
        loading={join.isPending}
        onClick={() => join.mutate({ body: { code: upper } })}
        data-testid="join-confirm"
      >
        {t.confirm}
      </Button>
    </Card>
  );
}
