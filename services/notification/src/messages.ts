import { BADGES, moveTier, type LeagueTier } from '@logicpath/gamification-rules';

export type Locale = 'en' | 'hi-Latn';
export type Kind =
  'review_due' | 'badge' | 'level_up' | 'league' | 'class' | 'submission' | 'system';

export interface Note {
  kind: Kind;
  title: string;
  body: string;
  link: string | null;
}

const say = (locale: Locale, en: string, hi: string) => (locale === 'en' ? en : hi);
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The words of every in-app notification, in the learner's language. */
export const notes = {
  welcome: (locale: Locale): Note => ({
    kind: 'system',
    title: say(locale, 'Welcome to LogicPath!', 'LogicPath me swagat hai!'),
    body: say(
      locale,
      'Start with the first lesson. A few minutes a day is enough.',
      'Pehle lesson se shuru karo. Roz kuch minute kaafi hain.',
    ),
    link: '/learn',
  }),

  levelUp: (locale: Locale, level: number): Note => ({
    kind: 'level_up',
    title: `Level ${level}!`,
    body: say(
      locale,
      `You reached level ${level}. Keep going!`,
      `Tum level ${level} par pahunch gaye. Aise hi chalte raho!`,
    ),
    link: '/profile',
  }),

  badge: (locale: Locale, badgeId: string): Note | null => {
    const badge = BADGES.find((b) => b.id === badgeId);
    if (!badge) return null;
    return {
      kind: 'badge',
      title: say(locale, `New badge: ${badge.title.en}`, `Naya badge: ${badge.title['hi-Latn']}`),
      body: badge.description[locale],
      link: '/profile',
    };
  },

  /** Only a promotion or a demotion is news; staying put is not. */
  league: (
    locale: Locale,
    week: { tier: string; rank: number; result: 'promoted' | 'stayed' | 'demoted' },
  ): Note | null => {
    if (week.result === 'stayed') return null;
    const next = capital(
      moveTier(week.tier as LeagueTier, week.result === 'promoted' ? 'promote' : 'demote'),
    );
    return {
      kind: 'league',
      title:
        week.result === 'promoted'
          ? say(locale, `Promoted to ${next}!`, `${next} league me promote!`)
          : say(locale, `Moved down to ${next}`, `${next} league me aa gaye`),
      body: say(
        locale,
        `You finished #${week.rank} last week.`,
        `Pichhle hafte tum #${week.rank} rahe.`,
      ),
      link: '/leaderboard',
    };
  },

  joinedClass: (locale: Locale, className: string): Note => ({
    kind: 'class',
    title: say(locale, `You joined ${className}`, `Tum ${className} me aa gaye`),
    body: say(
      locale,
      'Your teacher can now see your progress.',
      'Ab tumhare teacher tumhari progress dekh sakte hain.',
    ),
    link: '/classes',
  }),

  published: (locale: Locale, title: string, submissionId: string): Note => ({
    kind: 'submission',
    title: say(locale, `Published: ${title}`, `Publish ho gaya: ${title}`),
    body: say(locale, 'It is live for every learner.', 'Ab sabhi learners ke liye live hai.'),
    link: `/studio/drafts/${submissionId}`,
  }),

  changesRequested: (
    locale: Locale,
    title: string,
    comment: string,
    submissionId: string,
  ): Note => ({
    kind: 'submission',
    title: say(locale, `Changes requested: ${title}`, `Badlav chahiye: ${title}`),
    body: comment,
    link: `/studio/drafts/${submissionId}`,
  }),

  publishFailed: (locale: Locale, title: string, problem: string, submissionId: string): Note => ({
    kind: 'submission',
    title: say(locale, `Could not publish: ${title}`, `Publish nahi ho paya: ${title}`),
    body: problem,
    link: `/studio/drafts/${submissionId}`,
  }),

  reviewsDue: (locale: Locale, count: number): Note => ({
    kind: 'review_due',
    title: say(locale, `${count} to review`, `${count} review baaki`),
    body: say(
      locale,
      'A few minutes now keeps it in your memory.',
      'Abhi kuch minute lagao, yaad rahega.',
    ),
    link: '/review',
  }),
};

export interface Mail {
  subject: string;
  text: string;
}

/** The emails. Plain text on purpose: it reads the same in every mail app and in a log. */
export const mails = {
  verifyEmail: (locale: Locale, name: string, link: string): Mail => ({
    subject: say(locale, 'Confirm your email', 'Apna email confirm karo'),
    text: say(
      locale,
      `Hi ${name},\n\nConfirm your email address for LogicPath:\n${link}\n\nThe link works for 24 hours.`,
      `Hi ${name},\n\nLogicPath ke liye apna email confirm karo:\n${link}\n\nYeh link 24 ghante tak chalta hai.`,
    ),
  }),

  resetPassword: (locale: Locale, name: string, link: string): Mail => ({
    subject: say(locale, 'Reset your password', 'Password reset karo'),
    text: say(
      locale,
      `Hi ${name},\n\nSomeone asked to reset the password for this LogicPath account. If it was you, use this link (valid for 24 hours):\n${link}\n\nIf it was not you, you can ignore this email.`,
      `Hi ${name},\n\nKisi ne is LogicPath account ka password reset karne ko kaha. Agar tumne kaha, to yeh link use karo (24 ghante tak valid):\n${link}\n\nAgar tumne nahi kaha, to is email ko ignore karo.`,
    ),
  }),

  parentConsent: (locale: Locale, child: string, link: string): Mail => ({
    subject: say(
      locale,
      `Please approve ${child}'s LogicPath account`,
      `${child} ka LogicPath account approve karo`,
    ),
    text: say(
      locale,
      `${child} would like to learn on LogicPath. Because they are under 18, we need a parent or guardian to say yes before the account starts.\n\nReview and answer here:\n${link}\n\nThe request is open for 7 days.`,
      `${child} LogicPath par seekhna chahte hain. Kyunki woh 18 se kam umar ke hain, account shuru karne se pehle ek parent ya guardian ki haan chahiye.\n\nYahan dekho aur jawab do:\n${link}\n\nYeh request 7 din tak khuli hai.`,
    ),
  }),

  approved: (locale: Locale, link: string): Mail => ({
    subject: say(locale, 'Your account is approved', 'Tumhara account approve ho gaya'),
    text: say(
      locale,
      `A parent or guardian approved your LogicPath account. You can sign in now:\n${link}`,
      `Ek parent ya guardian ne tumhara LogicPath account approve kar diya. Ab sign in kar sakte ho:\n${link}`,
    ),
  }),
};
