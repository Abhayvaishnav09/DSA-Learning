'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { engagement, profile } from '@logicpath/contracts';
import {
  Button,
  Callout,
  Card,
  CardDescription,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  Switch,
  toast,
} from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { Download, KeyRound, LogOut, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProgress } from '@/entities/progress/store';
import { API_MODE, getApiClient, getLocalBackend } from '@/shared/api/client';
import { useT } from '@/shared/i18n/useT';
import { learnerTimeZone } from '@/shared/lib/clock';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import { useSettings } from '@/shared/settings/store';
import { clearQueue } from '@/shared/sync/queue';

const GOALS: readonly profile.ProfileUpdate['dailyGoalMinutes'][] = [5, 10, 20, 30];

const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Kolkata', 'UTC'];
  }
})();

export function SettingsScreen() {
  const t = useT().s;
  const status = useSession((s) => s.status);
  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-2xl font-bold sm:text-3xl">{t.settings.title}</h1>
      </StaggerItem>
      <StaggerItem>
        <Appearance />
      </StaggerItem>
      {status === 'signedIn' ? (
        <SignedInSettings />
      ) : (
        status === 'signedOut' && (
          <StaggerItem>
            <Callout tone="info">
              <p className="mb-3">{t.settings.guestNotice}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={routes.login()}>{t.common.signInCta}</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={routes.signup()}>{t.common.createCta}</Link>
                </Button>
              </div>
            </Callout>
          </StaggerItem>
        )
      )}
    </Stagger>
  );
}

function Appearance() {
  const t = useT().s.settings;
  const s = useSettings();
  const signedIn = useSession((x) => x.status === 'signedIn');
  const update = useApiMutation('profile.update', { invalidates: ['profile.get', 'home'] });
  // Appearance is kept on this device; signed in, language and theme follow the person.
  const sync = (patch: profile.ProfileUpdate) => {
    if (signedIn) update.mutate({ body: patch });
  };
  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{t.appearance}</CardTitle>
      <Row label={t.language}>
        <Segmented
          label={t.language}
          value={s.locale}
          onChange={(locale) => {
            s.setLocale(locale);
            sync({ locale });
          }}
          options={[
            { value: 'en', label: 'English' },
            { value: 'hi-Latn', label: 'Hinglish' },
          ]}
        />
      </Row>
      <Row label={t.theme}>
        <Segmented
          label={t.theme}
          value={s.theme}
          onChange={(theme) => {
            s.setTheme(theme);
            sync({ theme });
          }}
          options={(['system', 'light', 'dark'] as const).map((value) => ({
            value,
            label: t.themes[value],
          }))}
        />
      </Row>
      <Row label={t.motion}>
        <Segmented
          label={t.motion}
          value={s.motion}
          onChange={s.setMotion}
          options={(['full', 'reduced', 'off'] as const).map((value) => ({
            value,
            label: t.motions[value],
          }))}
        />
      </Row>
      <Row label={t.contrast}>
        <Segmented
          label={t.contrast}
          value={s.contrast}
          onChange={s.setContrast}
          options={(['normal', 'more'] as const).map((value) => ({
            value,
            label: t.contrasts[value],
          }))}
        />
      </Row>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function SignedInSettings() {
  const messages = useT().s;
  const t = messages.settings;
  const common = messages.common;
  const profileQuery = useApi('profile.get');
  const prefsQuery = useApi('notifications.prefs');
  const flags = useApi('flags.evaluate', { query: {} });
  const update = useApiMutation('profile.update', {
    invalidates: ['profile.get', 'home', 'progress.get'],
    onSuccess: () => void toast.success(common.saved),
  });
  const setPrefs = useApiMutation('notifications.setPrefs', {
    invalidates: ['notifications.prefs'],
  });
  const configured = flags.data?.flags['config.daily-goal-options'];
  const goals = (
    Array.isArray(configured?.value) ? (configured.value as number[]) : [...GOALS]
  ).filter((g): g is 5 | 10 | 20 | 30 => GOALS.includes(g as 5));

  return (
    <>
      <StaggerItem>
        <Card className="flex flex-col gap-5">
          <CardTitle>{t.learning}</CardTitle>
          {profileQuery.data ? (
            <>
              <Row label={t.dailyGoal}>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <Segmented
                    label={t.dailyGoal}
                    value={String(profileQuery.data.dailyGoalMinutes)}
                    onChange={(v) =>
                      update.mutate({ body: { dailyGoalMinutes: Number(v) as 5 | 10 | 20 | 30 } })
                    }
                    options={goals.map((g) => ({ value: String(g), label: `${g} min` }))}
                  />
                  <span className="text-xs text-muted">{t.dailyGoalHelp}</span>
                </div>
              </Row>
              <Field label={t.timeZone} description={t.timeZoneHelp}>
                <Select
                  value={profileQuery.data.timeZone}
                  onChange={(e) => update.mutate({ body: { timeZone: e.target.value } })}
                >
                  {[...new Set([profileQuery.data.timeZone, learnerTimeZone(), ...TIME_ZONES])].map(
                    (zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
            </>
          ) : (
            <Skeleton className="h-24" />
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card className="flex flex-col gap-4">
          <CardTitle>{t.notifications}</CardTitle>
          {prefsQuery.data ? (
            <PrefsSwitches
              prefs={prefsQuery.data}
              onChange={(next) => setPrefs.mutate({ body: next })}
            />
          ) : (
            <Skeleton className="h-24" />
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card className="flex flex-col gap-3">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-muted" aria-hidden /> {t.developer}
          </CardTitle>
          <CardDescription>{t.developerBody}</CardDescription>
          <div>
            <Button asChild variant="secondary">
              <Link href={routes.developerSettings}>{t.developerOpen}</Link>
            </Button>
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <DataAndAccount />
      </StaggerItem>
    </>
  );
}

function PrefsSwitches({
  prefs,
  onChange,
}: {
  prefs: engagement.NotificationPrefs;
  onChange: (next: engagement.NotificationPrefs) => void;
}) {
  const t = useT().s.settings;
  return (
    <div className="flex flex-col gap-4">
      <Switch
        label={t.reviewReminders}
        description={t.reviewRemindersHelp}
        checked={prefs.reviewReminders}
        onCheckedChange={(v) => onChange({ ...prefs, reviewReminders: v })}
      />
      <Switch
        label={t.weeklySummary}
        description={t.weeklySummaryHelp}
        checked={prefs.weeklySummary}
        onCheckedChange={(v) => onChange({ ...prefs, weeklySummary: v })}
      />
      <Switch
        label={t.productNews}
        description={t.productNewsHelp}
        checked={prefs.productNews}
        onCheckedChange={(v) => onChange({ ...prefs, productNews: v })}
      />
    </div>
  );
}

/** Wipes everything this device keeps about the person (after sign-out or deletion). */
function forgetOnThisDevice() {
  useProgress.getState().reset();
  clearQueue();
}

function DataAndAccount() {
  const messages = useT().s;
  const t = messages.settings;
  const common = messages.common;
  const router = useRouter();
  const signOut = useSession((s) => s.signOut);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setExporting(true);
    try {
      const data = await getApiClient().call('privacy.export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'logicpath-my-data.json';
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t.exportDone);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await getApiClient().call('privacy.delete');
      forgetOnThisDevice();
      await signOut();
      toast.success(t.deleted);
      router.push(routes.landing);
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  async function resetDemo() {
    const backend = await getLocalBackend();
    await backend.reset();
    forgetOnThisDevice();
    toast.success(t.demoResetDone);
    window.location.assign(routes.landing);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <CardTitle>{t.privacy}</CardTitle>
        <CardDescription>{t.privacyBody}</CardDescription>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            leftIcon={<Download />}
            loading={exporting}
            onClick={() => void download()}
          >
            {exporting ? t.exporting : t.export}
          </Button>
          <Button
            variant="danger"
            leftIcon={<Trash2 />}
            onClick={() => setConfirming(true)}
            data-testid="delete-account"
          >
            {t.deleteAccount}
          </Button>
        </div>
      </Card>

      {API_MODE === 'local' && (
        <Card className="flex flex-col gap-3">
          <CardTitle>{t.demo}</CardTitle>
          <CardDescription>{t.demoBody}</CardDescription>
          <div>
            <Button variant="secondary" leftIcon={<RotateCcw />} onClick={() => void resetDemo()}>
              {t.demoReset}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>{t.session}</CardTitle>
        <div>
          <Button
            variant="secondary"
            leftIcon={<LogOut />}
            onClick={() => void signOut().then(() => router.push(routes.landing))}
          >
            {t.signOut}
          </Button>
        </div>
      </Card>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={t.deleteTitle} description={t.deleteBody}>
          {error && (
            <Callout tone="danger" className="mb-3">
              {error}
            </Callout>
          )}
          <Field label={t.deleteConfirmLabel}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={typed !== t.deleteWord}
              onClick={() => void remove()}
              data-testid="delete-confirm"
            >
              {t.deleteAccount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
