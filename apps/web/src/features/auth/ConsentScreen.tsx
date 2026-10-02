'use client';

import { useApi } from '@logicpath/api-client/react';
import { Button, Callout, Card } from '@logicpath/ui';
import { CircleCheck, CircleX, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { getApiClient } from '@/shared/api/client';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatDate } from '@/shared/lib/format';
import { QueryView } from '@/shared/ui/QueryView';
import type { platform } from '@logicpath/contracts';

type Status = platform.ConsentRequest['status'];

/** The page a parent opens from the email: what they are agreeing to, and a clear yes or no. */
export function ConsentScreen({ token }: { token: string }) {
  const t = useT().s.consent;
  const locale = useLocale();
  const query = useApi('consent.request', { params: { token } }, { retry: false });
  const [answered, setAnswered] = useState<Status | null>(null);
  const [busy, setBusy] = useState<'grant' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(decision: 'grant' | 'deny') {
    setBusy(decision);
    setError(null);
    try {
      const result = await getApiClient().call('consent.respond', { body: { token, decision } });
      setAnswered(result.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (query.error?.status === 404) return <Callout tone="warning">{t.notFound}</Callout>;
  return (
    <QueryView query={query}>
      {(request) => {
        const status = answered ?? request.status;
        if (status !== 'pending') {
          const text =
            status === 'granted' ? t.granted : status === 'denied' ? t.denied : t.expired;
          const ok = status === 'granted';
          return (
            <div className="flex flex-col items-start gap-3" data-testid={`consent-${status}`}>
              <span
                className={`grid size-14 place-items-center rounded-2xl ${ok ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'}`}
              >
                {ok ? (
                  <CircleCheck className="size-7" aria-hidden />
                ) : (
                  <CircleX className="size-7" aria-hidden />
                )}
              </span>
              <h1 className="text-3xl font-bold">{t.title}</h1>
              <p className="text-muted">
                {answered === null && status !== 'expired' ? t.answered : text}
              </p>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-start gap-3">
              <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                <ShieldCheck className="size-7" aria-hidden />
              </span>
              <h1 className="text-3xl font-bold">{t.title}</h1>
              <p className="text-muted">{t.intro(request.childName)}</p>
              <p className="text-xs text-subtle">
                {t.when(formatDate(request.requestedAt, locale))}
              </p>
            </div>
            <Card padding="md" elevation="flat" className="flex flex-col gap-2">
              <h2 className="font-semibold">{t.whatTitle}</h2>
              <ul className="ml-5 list-disc space-y-1 text-sm">
                {t.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </Card>
            {error && <Callout tone="danger">{error}</Callout>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                loading={busy === 'grant'}
                disabled={!!busy}
                onClick={() => void respond('grant')}
                data-testid="consent-grant"
              >
                {t.grant}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                loading={busy === 'deny'}
                disabled={!!busy}
                onClick={() => void respond('deny')}
                data-testid="consent-deny"
              >
                {t.deny}
              </Button>
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}
