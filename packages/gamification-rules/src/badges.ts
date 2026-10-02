export interface BadgeDef {
  id: string;
  title: { en: string; 'hi-Latn': string };
  description: { en: string; 'hi-Latn': string };
  /** lucide icon name, drawn by both apps */
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
}

/** What the badge rules look at. Services keep these counters; the rules stay pure. */
export interface LearnerStats {
  correctTotal: number;
  /** Right answers in a row without any hint (resets on a miss or a hint). */
  unaidedRun: number;
  lessonsCompleted: number;
  conceptsMastered: number;
  reviewsDone: number;
  longestStreak: number;
  promotions: number;
  classesJoined: number;
}

export const emptyStats = (): LearnerStats => ({
  correctTotal: 0,
  unaidedRun: 0,
  lessonsCompleted: 0,
  conceptsMastered: 0,
  reviewsDone: 0,
  longestStreak: 0,
  promotions: 0,
  classesJoined: 0,
});

/** The facts of one answer that the counters care about. */
export interface AttemptFacts {
  correct: boolean;
  hintLevel: number;
  source: 'lesson' | 'predict' | 'review';
  solutionShown: boolean;
}

/**
 * The counters after one answer: right answers, the clean run, reviews done. Predictions and
 * answers shown to the learner prove nothing, so they leave the counters alone (a miss still
 * ends the run).
 */
export function statsAfterAttempt(stats: LearnerStats, attempt: AttemptFacts): LearnerStats {
  const next = { ...stats };
  const predict = attempt.source === 'predict';
  if (attempt.correct && !predict && !attempt.solutionShown) {
    next.correctTotal += 1;
    next.unaidedRun = attempt.hintLevel === 0 ? next.unaidedRun + 1 : 0;
    if (attempt.source === 'review') next.reviewsDone += 1;
  } else if (!predict && !attempt.correct) {
    next.unaidedRun = 0;
  }
  return next;
}

interface Rule extends BadgeDef {
  earned: (stats: LearnerStats) => boolean;
}

const rule = (
  id: string,
  tier: BadgeDef['tier'],
  icon: string,
  en: [string, string],
  hi: [string, string],
  earned: Rule['earned'],
): Rule => ({
  id,
  tier,
  icon,
  title: { en: en[0], 'hi-Latn': hi[0] },
  description: { en: en[1], 'hi-Latn': hi[1] },
  earned,
});

const RULES: readonly Rule[] = [
  rule(
    'first-answer',
    'bronze',
    'sprout',
    ['First step', 'Answer your first question correctly.'],
    ['Pehla kadam', 'Apna pehla sawaal sahi karo.'],
    (s) => s.correctTotal >= 1,
  ),
  rule(
    'first-lesson',
    'bronze',
    'book-open-check',
    ['Lesson done', 'Finish your first lesson.'],
    ['Lesson poora', 'Apna pehla lesson poora karo.'],
    (s) => s.lessonsCompleted >= 1,
  ),
  rule(
    'five-lessons',
    'silver',
    'library',
    ['Bookworm', 'Finish five lessons.'],
    ['Kitabi keeda', 'Paanch lessons poore karo.'],
    (s) => s.lessonsCompleted >= 5,
  ),
  rule(
    'first-mastery',
    'silver',
    'brain',
    ['Got it for good', 'Master your first concept.'],
    ['Pakka ho gaya', 'Apna pehla concept master karo.'],
    (s) => s.conceptsMastered >= 1,
  ),
  rule(
    'five-mastered',
    'gold',
    'trophy',
    ['Five concepts', 'Master five concepts.'],
    ['Paanch concepts', 'Paanch concepts master karo.'],
    (s) => s.conceptsMastered >= 5,
  ),
  rule(
    'hundred-correct',
    'silver',
    'target',
    ['Sharp shooter', 'Answer 100 questions correctly.'],
    ['Pakka nishana', '100 sawaal sahi karo.'],
    (s) => s.correctTotal >= 100,
  ),
  rule(
    'clean-run',
    'silver',
    'zap',
    ['No hints needed', 'Ten right answers in a row without a hint.'],
    ['Bina hint', 'Bina hint ke lagataar 10 sahi jawab.'],
    (s) => s.unaidedRun >= 10,
  ),
  rule(
    'reviewer',
    'bronze',
    'repeat',
    ['Remember to remember', 'Finish a review session item.'],
    ['Yaad rakhna', 'Ek review sawaal poora karo.'],
    (s) => s.reviewsDone >= 1,
  ),
  rule(
    'streak-3',
    'bronze',
    'flame',
    ['Three days', 'Learn three days in a row.'],
    ['Teen din', 'Lagataar teen din seekho.'],
    (s) => s.longestStreak >= 3,
  ),
  rule(
    'streak-7',
    'silver',
    'flame',
    ['One week', 'Learn seven days in a row.'],
    ['Ek hafta', 'Lagataar saat din seekho.'],
    (s) => s.longestStreak >= 7,
  ),
  rule(
    'streak-30',
    'gold',
    'flame',
    ['One month', 'Learn thirty days in a row.'],
    ['Ek mahina', 'Lagataar tees din seekho.'],
    (s) => s.longestStreak >= 30,
  ),
  rule(
    'promoted',
    'gold',
    'chevrons-up',
    ['Moving up', 'Get promoted to a higher league.'],
    ['Upar chalo', 'Ek upar wali league me promote ho jao.'],
    (s) => s.promotions >= 1,
  ),
  rule(
    'classmate',
    'bronze',
    'users',
    ['Classmate', 'Join a class.'],
    ['Classmate', 'Ek class join karo.'],
    (s) => s.classesJoined >= 1,
  ),
];

export const BADGES: readonly BadgeDef[] = RULES.map(({ earned: _earned, ...badge }) => badge);

/** Badge ids that the stats now qualify for and that are not owned yet. */
export function newBadges(stats: LearnerStats, owned: ReadonlySet<string>): string[] {
  return RULES.filter((r) => !owned.has(r.id) && r.earned(stats)).map((r) => r.id);
}
