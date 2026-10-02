import type { ReactNode } from 'react';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { Landing } from '@/features/landing/Landing';
import { LessonPlayer } from '@/features/lesson-player/LessonPlayer';
import { LearnHome } from '@/features/map/LearnHome';
import { ComingSoon } from '@/features/placeholder/ComingSoon';
import { ReviewHeader } from '@/features/review/ReviewHeader';
import { ReviewSession } from '@/features/review/ReviewSession';
import { getLesson } from '@/shared/content/bundle';
import type { RoutePattern } from '@/shared/routing/table';
import { NotFoundScreen } from '@/widgets/shell/StatusScreens';

type Screen = (params: Record<string, string>) => ReactNode;

/**
 * The demo's screen for every route in the table. Typed as a complete Record, so adding a
 * route to the table without a demo screen fails the build.
 */
export const SCREENS: Record<RoutePattern, Screen> = {
  '/': () => <Landing />,
  '/how-it-works': () => <ComingSoon title="howItWorks" />,
  '/developers': () => <ComingSoon title="developers" />,
  '/legal/privacy': () => <ComingSoon title="privacy" />,
  '/legal/terms': () => <ComingSoon title="terms" />,
  '/login': () => <LoginScreen />,
  '/signup': () => <ComingSoon title="signUp" />,
  '/forgot-password': () => <ComingSoon title="signIn" />,
  '/reset-password': () => <ComingSoon title="signIn" />,
  '/verify-email': () => <ComingSoon title="signIn" />,
  '/consent/:token': () => <ComingSoon title="account" />,
  '/home': () => <ComingSoon title="dashboard" />,
  '/learn': () => <LearnHome />,
  '/leaderboard': () => <ComingSoon title="leagues" />,
  '/classes': () => <ComingSoon title="classes" />,
  '/classes/join/:code': () => <ComingSoon title="classes" />,
  '/search': () => <ComingSoon title="search" />,
  '/notifications': () => <ComingSoon title="notifications" />,
  '/profile': () => <ComingSoon title="profile" />,
  '/settings': () => <ComingSoon title="settings" />,
  '/settings/developer': () => <ComingSoon title="developer" />,
  '/learn/:concept': ({ concept }) =>
    getLesson(concept!) ? <LessonPlayer key={concept} conceptId={concept!} /> : <NotFoundScreen />,
  '/review': () => (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <ReviewHeader />
      <ReviewSession />
    </div>
  ),
  '/studio': () => <ComingSoon title="studio" />,
  '/studio/drafts': () => <ComingSoon title="drafts" />,
  '/studio/drafts/new': () => <ComingSoon title="newDraft" />,
  '/studio/drafts/:id': () => <ComingSoon title="drafts" />,
  '/studio/drafts/:id/edit/:kind/:itemId': () => <ComingSoon title="drafts" />,
  '/studio/media': () => <ComingSoon title="media" />,
  '/studio/stats': () => <ComingSoon title="stats" />,
  '/admin': () => <ComingSoon title="overview" />,
  '/admin/review': () => <ComingSoon title="reviewQueue" />,
  '/admin/review/:id': () => <ComingSoon title="reviewQueue" />,
  '/admin/content': () => <ComingSoon title="content" />,
  '/admin/users': () => <ComingSoon title="users" />,
  '/admin/users/:id': () => <ComingSoon title="users" />,
  '/admin/classes': () => <ComingSoon title="classes" />,
  '/admin/flags': () => <ComingSoon title="flags" />,
  '/admin/api-keys': () => <ComingSoon title="apiKeys" />,
  '/admin/media': () => <ComingSoon title="media" />,
  '/admin/audit': () => <ComingSoon title="audit" />,
};
