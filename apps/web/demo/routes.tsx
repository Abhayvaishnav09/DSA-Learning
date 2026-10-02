import type { ReactNode } from 'react';
import { AdminClassesScreen } from '@/features/admin/AdminClassesScreen';
import { ApiKeysScreen } from '@/features/admin/ApiKeysScreen';
import { AuditScreen } from '@/features/admin/AuditScreen';
import { ContentScreen } from '@/features/admin/ContentScreen';
import { FlagsScreen } from '@/features/admin/FlagsScreen';
import { OverviewScreen } from '@/features/admin/OverviewScreen';
import { ReviewQueueScreen } from '@/features/admin/ReviewQueueScreen';
import { SubmissionScreen } from '@/features/admin/SubmissionScreen';
import { UserScreen } from '@/features/admin/UserScreen';
import { UsersScreen } from '@/features/admin/UsersScreen';
import { ConsentScreen } from '@/features/auth/ConsentScreen';
import { ForgotScreen } from '@/features/auth/ForgotScreen';
import { ResetScreen } from '@/features/auth/ResetScreen';
import { SignupScreen } from '@/features/auth/SignupScreen';
import { VerifyScreen } from '@/features/auth/VerifyScreen';
import { ClassesScreen } from '@/features/classes/ClassesScreen';
import { JoinClassScreen } from '@/features/classes/JoinClassScreen';
import { DeveloperKeysScreen } from '@/features/developer/DeveloperKeysScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { InboxScreen } from '@/features/inbox/InboxScreen';
import { LeagueScreen } from '@/features/league/LeagueScreen';
import { MediaLibrary } from '@/features/media/MediaLibrary';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { SearchScreen } from '@/features/search/SearchScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { DraftScreen } from '@/features/studio/DraftScreen';
import { DraftsScreen } from '@/features/studio/DraftsScreen';
import { EditorScreen } from '@/features/studio/editor/EditorScreen';
import { NewDraftScreen } from '@/features/studio/NewDraftScreen';
import { StatsScreen } from '@/features/studio/StatsScreen';
import { StudioHome } from '@/features/studio/StudioHome';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { Landing } from '@/features/landing/Landing';
import { LessonPlayer } from '@/features/lesson-player/LessonPlayer';
import { LearnHome } from '@/features/map/LearnHome';
import { Developers } from '@/features/marketing/Developers';
import { HowItWorks } from '@/features/marketing/HowItWorks';
import { Privacy, Terms } from '@/features/marketing/Legal';
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
  '/how-it-works': () => <HowItWorks />,
  '/developers': () => <Developers />,
  '/legal/privacy': () => <Privacy />,
  '/legal/terms': () => <Terms />,
  '/login': () => <LoginScreen />,
  '/signup': () => <SignupScreen />,
  '/forgot-password': () => <ForgotScreen />,
  '/reset-password': () => <ResetScreen />,
  '/verify-email': () => <VerifyScreen />,
  '/consent/:token': ({ token }) => <ConsentScreen token={token!} />,
  '/home': () => <HomeScreen />,
  '/learn': () => <LearnHome />,
  '/leaderboard': () => <LeagueScreen />,
  '/classes': () => <ClassesScreen />,
  '/classes/join/:code': ({ code }) => <JoinClassScreen code={code!} />,
  '/search': () => <SearchScreen />,
  '/notifications': () => <InboxScreen />,
  '/profile': () => <ProfileScreen />,
  '/settings': () => <SettingsScreen />,
  '/settings/developer': () => <DeveloperKeysScreen />,
  '/learn/:concept': ({ concept }) =>
    getLesson(concept!) ? <LessonPlayer key={concept} conceptId={concept!} /> : <NotFoundScreen />,
  '/review': () => (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <ReviewHeader />
      <ReviewSession />
    </div>
  ),
  '/studio': () => <StudioHome />,
  '/studio/drafts': () => <DraftsScreen />,
  '/studio/drafts/new': () => <NewDraftScreen />,
  '/studio/drafts/:id': ({ id }) => <DraftScreen id={id!} />,
  '/studio/drafts/:id/edit/:kind/:itemId': ({ id, kind, itemId }) => (
    <EditorScreen key={`${kind}:${itemId}`} draftId={id!} kind={kind!} targetId={itemId!} />
  ),
  '/studio/media': () => <MediaLibrary />,
  '/studio/stats': () => <StatsScreen />,
  '/admin': () => <OverviewScreen />,
  '/admin/review': () => <ReviewQueueScreen />,
  '/admin/review/:id': ({ id }) => <SubmissionScreen id={id!} />,
  '/admin/content': () => <ContentScreen />,
  '/admin/users': () => <UsersScreen />,
  '/admin/users/:id': ({ id }) => <UserScreen id={id!} />,
  '/admin/classes': () => <AdminClassesScreen />,
  '/admin/flags': () => <FlagsScreen />,
  '/admin/api-keys': () => <ApiKeysScreen />,
  '/admin/media': () => <MediaLibrary />,
  '/admin/audit': () => <AuditScreen />,
};
