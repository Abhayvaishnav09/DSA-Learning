import { createRoot } from 'react-dom/client';
import { LearnHome } from '@/features/map/LearnHome';
import { Landing } from '@/features/landing/Landing';
import { LessonPlayer } from '@/features/lesson-player/LessonPlayer';
import { ReviewHeader } from '@/features/review/ReviewHeader';
import { ReviewSession } from '@/features/review/ReviewSession';
import { AppHeader } from '@/features/settings/AppHeader';
import { getLesson } from '@/shared/content/bundle';
import { usePathname } from './router';

function Page() {
  const path = usePathname();
  if (path === '/learn') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <LearnHome />
      </div>
    );
  }
  if (path === '/review') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <ReviewHeader />
        <ReviewSession />
      </div>
    );
  }
  const lesson = /^\/learn\/(.+)$/.exec(path)?.[1];
  if (lesson && getLesson(lesson)) return <LessonPlayer key={lesson} conceptId={lesson} />;
  return <Landing />;
}

function App() {
  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Page />
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
