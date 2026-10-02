'use client';

import { Callout } from '@logicpath/ui';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_MODE, getLocalBackend } from '@/shared/api/client';
import { useT } from '@/shared/i18n/useT';

interface Mail {
  id: string;
  to: string;
  subject: string;
  link: string | null;
}

/**
 * The demo has no email service, so the messages it would send are listed here, with their
 * links. It only exists in the demo; the real site sends real email.
 */
export function DemoMailbox({ refreshKey }: { refreshKey?: unknown }) {
  const t = useT();
  const [mails, setMails] = useState<Mail[]>([]);
  useEffect(() => {
    if (API_MODE !== 'local') return;
    let live = true;
    void getLocalBackend().then((backend) => {
      if (live) setMails(backend.db.t.mailbox.slice(0, 3));
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  if (API_MODE !== 'local' || mails.length === 0) return null;
  return (
    <Callout tone="info" icon={<Mail />} title={t.s.mailbox.title} className="text-sm">
      <p className="mb-2">{t.s.mailbox.body}</p>
      <ul className="flex flex-col gap-1.5">
        {mails.map((mail) => (
          <li key={mail.id}>
            <span className="text-muted">{mail.to}: </span>
            {mail.link ? (
              <Link
                href={mail.link}
                className="font-semibold text-accent underline underline-offset-2"
              >
                {mail.subject}
              </Link>
            ) : (
              mail.subject
            )}
          </li>
        ))}
      </ul>
    </Callout>
  );
}
