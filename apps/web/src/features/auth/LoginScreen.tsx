'use client';

import { ApiError } from '@logicpath/api-client';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@logicpath/local-backend/accounts';
import { Button, Callout, Card, Field, Input, toast } from '@logicpath/ui';
import { m, Stagger, StaggerItem } from '@logicpath/ui/motion';
import { GraduationCap, PenLine, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { API_MODE } from '@/shared/api/client';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';

const ROLE_ICONS = { student: GraduationCap, writer: PenLine, admin: ShieldCheck };
const ROLE_HOME = { student: routes.home, writer: routes.studio, admin: routes.admin };

/** Only same-site paths are allowed as a return address (no open redirects). */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function LoginScreen() {
  const t = useT();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function go(withEmail: string, withPassword: string, key: string) {
    setBusy(key);
    setError(null);
    setFields({});
    try {
      const user = await signIn(withEmail, withPassword);
      toast.success(t.auth.welcome(user.name.split(' ')[0]!));
      router.push(next ?? ROLE_HOME[user.role]);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fieldErrors());
        setError(e.problem.errors?.length ? null : e.message);
      } else setError(String(e));
      setBusy(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void go(email, password, 'form');
  };

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-3xl font-bold">{t.auth.loginTitle}</h1>
        <p className="mt-2 text-muted">{t.auth.loginSubtitle}</p>
      </StaggerItem>

      {API_MODE === 'local' && (
        <StaggerItem>
          <Card padding="md" className="flex flex-col gap-3 border-accent/30 bg-accent-soft/40">
            <div>
              <h2 className="font-semibold">{t.auth.demoTitle}</h2>
              <p className="text-sm text-muted">{t.auth.demoBody}</p>
            </div>
            <div className="grid gap-2 tablet:grid-cols-3">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = ROLE_ICONS[account.role];
                return (
                  <m.div key={account.role} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      block
                      variant="secondary"
                      loading={busy === account.role}
                      disabled={!!busy}
                      leftIcon={<Icon />}
                      data-testid={`demo-${account.role}`}
                      onClick={() => void go(account.email, DEMO_PASSWORD, account.role)}
                    >
                      {t.auth.roles[account.role]}
                    </Button>
                  </m.div>
                );
              })}
            </div>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label={t.auth.email} error={fields.email} required>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t.auth.password} error={fields.password} required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between text-sm">
            <Link href={routes.forgotPassword} className="text-accent hover:underline">
              {t.auth.forgot}
            </Link>
          </div>
          <Button
            type="submit"
            size="lg"
            block
            loading={busy === 'form'}
            disabled={!!busy && busy !== 'form'}
          >
            {t.auth.submit}
          </Button>
          <p className="text-center text-sm text-muted">
            {t.auth.noAccount}{' '}
            <Link
              href={routes.signup(next ?? undefined)}
              className="font-semibold text-accent hover:underline"
            >
              {t.auth.createAccount}
            </Link>
          </p>
        </form>
      </StaggerItem>
    </Stagger>
  );
}
