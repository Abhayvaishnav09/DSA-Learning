'use client';

import { ApiError } from '@logicpath/api-client';
import { Button, Callout, Field, Input } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { getApiClient } from '@/shared/api/client';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { DemoMailbox } from '@/shared/ui/DemoMailbox';

export function ForgotScreen() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getApiClient().call('auth.forgotPassword', { body: { email } });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Stagger className="flex flex-col gap-6">
        <StaggerItem className="flex flex-col items-start gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <MailCheck className="size-7" aria-hidden />
          </span>
          <h1 className="text-3xl font-bold">{t.s.forgot.sentTitle}</h1>
          <p className="text-muted">{t.s.forgot.sentBody}</p>
        </StaggerItem>
        <StaggerItem>
          <DemoMailbox refreshKey={sent} />
        </StaggerItem>
        <StaggerItem>
          <Button asChild variant="secondary">
            <Link href={routes.login()}>{t.s.forgot.back}</Link>
          </Button>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-3xl font-bold">{t.s.forgot.title}</h1>
        <p className="mt-2 text-muted">{t.s.forgot.subtitle}</p>
      </StaggerItem>
      <StaggerItem>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label={t.auth.email} required>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" block loading={busy} disabled={!email.includes('@')}>
            {t.s.forgot.submit}
          </Button>
          <p className="text-center text-sm">
            <Link
              href={routes.login()}
              className="font-semibold text-accent underline underline-offset-2"
            >
              {t.s.forgot.back}
            </Link>
          </p>
        </form>
      </StaggerItem>
    </Stagger>
  );
}
