'use client';

import { Button, Callout, Spinner } from '@logicpath/ui';
import { CircleCheck, CircleX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getApiClient } from '@/shared/api/client';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

type State = 'working' | 'done' | 'failed';

/** Opens from the link in the email: confirms the address once, then says how it went. */
export function VerifyScreen() {
  const t = useT().s.verify;
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>('working');

  useEffect(() => {
    if (!token) return;
    let live = true;
    getApiClient()
      .call('auth.verifyEmail', { body: { token } })
      .then(
        () => live && setState('done'),
        () => live && setState('failed'),
      );
    return () => {
      live = false;
    };
  }, [token]);

  if (!token) return <Callout tone="warning">{t.missing}</Callout>;
  if (state === 'working') return <Spinner label={t.working} />;
  const ok = state === 'done';
  return (
    <div className="flex flex-col items-start gap-4" data-testid={`verify-${state}`}>
      <span
        className={`grid size-14 place-items-center rounded-2xl ${ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
      >
        {ok ? (
          <CircleCheck className="size-7" aria-hidden />
        ) : (
          <CircleX className="size-7" aria-hidden />
        )}
      </span>
      <h1 className="text-3xl font-bold">{ok ? t.doneTitle : t.failTitle}</h1>
      <p className="text-muted">{ok ? t.doneBody : t.failBody}</p>
      <Button asChild>
        <Link href={routes.home}>{t.continue}</Link>
      </Button>
    </div>
  );
}
