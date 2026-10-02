'use client';

import { ApiError } from '@logicpath/api-client';
import { Button, Callout, Field, Input } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getApiClient } from '@/shared/api/client';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

export function ResetScreen() {
  const t = useT().s;
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== again) {
      setFields({ confirm: t.reset.mismatch });
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await getApiClient().call('auth.resetPassword', { body: { token: token!, password } });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fieldErrors());
        setError(e.problem.errors?.length ? null : e.message);
      } else setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Callout tone="warning">{t.reset.missing}</Callout>
        <Button asChild variant="secondary">
          <Link href={routes.forgotPassword}>{t.reset.askAgain}</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <Stagger className="flex flex-col items-start gap-4">
        <StaggerItem>
          <span className="grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
            <CircleCheck className="size-7" aria-hidden />
          </span>
        </StaggerItem>
        <StaggerItem>
          <h1 className="text-3xl font-bold">{t.reset.title}</h1>
          <p className="mt-2 text-muted" data-testid="reset-done">
            {t.reset.done}
          </p>
        </StaggerItem>
        <StaggerItem>
          <Button asChild>
            <Link href={routes.login()}>{t.reset.signIn}</Link>
          </Button>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-3xl font-bold">{t.reset.title}</h1>
      </StaggerItem>
      <StaggerItem>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {error && (
            <Callout tone="danger">
              {error}{' '}
              <Link href={routes.forgotPassword} className="font-semibold underline">
                {t.reset.askAgain}
              </Link>
            </Callout>
          )}
          <Field
            label={t.reset.password}
            description={t.signup.passwordHelp}
            error={fields.password}
            required
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t.reset.confirm} error={fields.confirm} required>
            <Input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" block loading={busy} disabled={password.length < 8}>
            {t.reset.submit}
          </Button>
        </form>
      </StaggerItem>
    </Stagger>
  );
}
