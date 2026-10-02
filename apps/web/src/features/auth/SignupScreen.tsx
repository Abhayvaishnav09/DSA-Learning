'use client';

import { ApiError } from '@logicpath/api-client';
import type { identity } from '@logicpath/contracts';
import { Button, Callout, Field, Input, Segmented, toast } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getApiClient } from '@/shared/api/client';
import { useLocale, useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import { useSettings } from '@/shared/settings/store';
import { DemoMailbox } from '@/shared/ui/DemoMailbox';

const ADULT_AGE = 18;

/** Only same-site paths are allowed as a return address (no open redirects). */
const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : null;

export function SignupScreen() {
  const messages = useT();
  const t = messages.s;
  const locale = useLocale();
  const setLocale = useSettings((s) => s.setLocale);
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const adopt = useSession((s) => s.adopt);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [waiting, setWaiting] = useState<string | null>(null);

  const year = Number(birthYear);
  const thisYear = new Date().getFullYear();
  const validYear = /^\d{4}$/.test(birthYear) && year >= 1900 && year <= thisYear;
  const minor = validYear && thisYear - year < ADULT_AGE;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result: identity.RegisterResponse = await getApiClient().call('auth.register', {
        body: {
          name,
          email,
          password,
          birthYear: year,
          locale,
          ...(minor ? { parentEmail } : {}),
        },
      });
      if (result.status === 'pending_consent') {
        setWaiting(parentEmail);
      } else {
        adopt(result.user);
        toast.success(t.signup.welcome(result.user.name.split(' ')[0]!));
        router.push(next ?? routes.home);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fieldErrors());
        setError(e.problem.errors?.length ? null : e.message);
      } else setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (waiting) {
    return (
      <Stagger className="flex flex-col gap-6">
        <StaggerItem className="flex flex-col items-start gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <MailCheck className="size-7" aria-hidden />
          </span>
          <h1 className="text-3xl font-bold">{t.signup.waitingTitle}</h1>
          <p className="text-muted" data-testid="waiting-body">
            {t.signup.waitingBody(waiting)}
          </p>
        </StaggerItem>
        <StaggerItem>
          <DemoMailbox refreshKey={waiting} />
        </StaggerItem>
        <StaggerItem>
          <Button asChild variant="secondary">
            <Link href={routes.login(next ?? undefined)}>{t.signup.waitingBack}</Link>
          </Button>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-3xl font-bold">{t.signup.title}</h1>
        <p className="mt-2 text-muted">{t.signup.subtitle}</p>
      </StaggerItem>
      <StaggerItem>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label={t.signup.name} error={fields.name} required>
            <Input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label={messages.auth.email} error={fields.email} required>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label={t.signup.password}
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
          <Field
            label={t.signup.birthYear}
            description={t.signup.birthYearHelp}
            error={fields.birthYear}
            required
          >
            <Input
              inputMode="numeric"
              autoComplete="bday-year"
              placeholder="2008"
              maxLength={4}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          {minor && (
            <Callout tone="info" title={t.signup.parentTitle}>
              <p className="mb-3">{t.signup.parentBody}</p>
              <Field label={t.signup.parentEmail} error={fields.parentEmail} required>
                <Input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                />
              </Field>
            </Callout>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t.signup.language}</span>
            <Segmented
              label={t.signup.language}
              value={locale}
              onChange={setLocale}
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi-Latn', label: 'Hinglish' },
              ]}
            />
          </div>
          <Button type="submit" size="lg" block loading={busy} disabled={!validYear}>
            {t.signup.submit}
          </Button>
          <p className="text-center text-xs text-muted">
            {t.signup.terms}{' '}
            <Link href={routes.terms} className="text-accent underline underline-offset-2">
              {t.signup.termsLink}
            </Link>
            {' · '}
            <Link href={routes.privacy} className="text-accent underline underline-offset-2">
              {t.signup.privacyLink}
            </Link>
          </p>
          <p className="text-center text-sm text-muted">
            {t.signup.haveAccount}{' '}
            <Link
              href={routes.login(next ?? undefined)}
              className="font-semibold text-accent underline underline-offset-2"
            >
              {t.signup.signIn}
            </Link>
          </p>
        </form>
      </StaggerItem>
    </Stagger>
  );
}
