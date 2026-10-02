'use client';

import { Callout } from '@logicpath/ui';
import { Info } from 'lucide-react';
import { useLocale } from '@/shared/i18n/useT';

/**
 * Privacy policy and terms in plain words (English is the binding text; Hinglish readers get a
 * summary). Marked as a draft until reviewed by a lawyer before public launch.
 */

interface Section {
  title: string;
  body: string[];
}

interface LegalDoc {
  title: string;
  updated: string;
  summaryHi: string;
  sections: Section[];
}

const PRIVACY: LegalDoc = {
  title: 'Privacy policy',
  updated: '2 October 2026',
  summaryHi:
    'Short mein: hum sirf wahi data rakhte hain jo seekhane ke liye zaroori hai (email, naam, birth year, aur tumhari progress). 18 se kam umar walon ke liye parent ki permission chahiye. Hum data bechte nahi, ads nahi dikhate, aur tum Settings se apna sara data download ya delete kar sakte ho.',
  sections: [
    {
      title: 'What we collect',
      body: [
        'Account: your email, name and birth year. For learners under 18, a parent or guardian’s email.',
        'Learning: which lessons you open, your answers, hints used, time spent, and the progress we calculate from them.',
        'Settings: language, theme, daily goal and similar choices.',
        'We do not collect your location, contacts or device identifiers, and we do not use advertising trackers.',
      ],
    },
    {
      title: 'Why we use it',
      body: [
        'To run your account and keep your progress across devices.',
        'To decide what to review and when, and to improve lessons that many learners find hard (using combined, not individual, numbers).',
        'To send emails you need: verification, password reset, parental consent, and reminders you can switch off.',
      ],
    },
    {
      title: 'Learners under 18',
      body: [
        'As India’s Digital Personal Data Protection Act requires, an account for someone under 18 stays inactive until a parent or guardian approves it from an email we send them.',
        'If they decline, or do not answer within 7 days, the account and its data are deleted.',
      ],
    },
    {
      title: 'Your rights',
      body: [
        'Download everything we hold about you from Settings → Privacy.',
        'Delete your account from the same place. Every service that holds your data deletes it, and you can follow the progress.',
        'Correct your details at any time in Settings.',
      ],
    },
    {
      title: 'Sharing and storage',
      body: [
        'We do not sell or rent personal data. Service providers (hosting, email delivery) process it only to run LogicPath.',
        'Content writers and admins see only what their role needs; every admin action is recorded in an audit log.',
        'Cookies: one to keep you signed in, and one that remembers your role for faster page loads. No advertising cookies.',
      ],
    },
    {
      title: 'Contact',
      body: ['Questions or requests: privacy@logicpath.dev. We answer within 30 days.'],
    },
  ],
};

const TERMS: LegalDoc = {
  title: 'Terms of use',
  updated: '2 October 2026',
  summaryHi:
    'Short mein: LogicPath seekhne ke liye free hai. Apna account safe rakho, doosron ko pareshan mat karo, aur content ko apna bata kar mat becho. Public API ke liye keys aur fair-use rules hain.',
  sections: [
    {
      title: 'Using LogicPath',
      body: [
        'LogicPath is free for learning. You may use it on your own or in a class.',
        'Keep your password private. You are responsible for what happens in your account.',
        'Learners under 18 need a parent or guardian’s approval (see the privacy policy).',
      ],
    },
    {
      title: 'The curriculum',
      body: [
        'Lessons, questions and explanations are © LogicPath and its writers. You may share links and use them for learning and teaching.',
        'You may not copy the curriculum in bulk or resell it. Developers can use it through the public API under its own fair-use rules.',
      ],
    },
    {
      title: 'Content writers',
      body: [
        'Writers keep credit for what they write and give LogicPath the right to publish, edit and translate it.',
        'Submissions are reviewed by an admin before they reach learners.',
      ],
    },
    {
      title: 'Acceptable use',
      body: [
        'No attempts to break, overload or get around the security of the service.',
        'No harassment of other learners, teachers or staff.',
        'We may suspend accounts that break these rules, and we tell you why.',
      ],
    },
    {
      title: 'No warranty',
      body: [
        'We work hard to keep LogicPath correct and available, but it is provided as it is. We are not liable for indirect losses from using it.',
      ],
    },
    {
      title: 'Changes',
      body: [
        'If these terms change in a way that matters, we tell you by email or in the app before the change applies.',
      ],
    },
  ],
};

function LegalPage({ doc }: { doc: LegalDoc }) {
  const locale = useLocale();
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 tablet:px-6" lang="en">
      <h1 className="text-4xl font-bold">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {doc.updated}</p>
      <Callout tone="warning" icon={<Info />} className="mt-6">
        Draft for review by counsel before public launch.
      </Callout>
      {locale === 'hi-Latn' && (
        <Callout tone="info" title="Hinglish summary" className="mt-4">
          <p lang="hi-Latn">{doc.summaryHi}</p>
        </Callout>
      )}
      <div className="mt-10 flex flex-col gap-10">
        {doc.sections.map((section, i) => (
          <section key={section.title} aria-labelledby={`legal-${i}`}>
            <h2 id={`legal-${i}`} className="mb-3 text-xl font-semibold">
              {section.title}
            </h2>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-muted marker:text-accent">
              {section.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

export const Privacy = () => <LegalPage doc={PRIVACY} />;
export const Terms = () => <LegalPage doc={TERMS} />;
