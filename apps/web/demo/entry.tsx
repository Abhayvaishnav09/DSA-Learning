import { createRoot } from 'react-dom/client';
import { Providers } from '@/app/providers';
import { matchRoute, type RoutePattern } from '@/shared/routing/table';
import { NotFoundScreen } from '@/widgets/shell/StatusScreens';
import { AppShell, AuthShell, FocusShell, MarketingShell } from '@/widgets/shell/Shells';
import { usePathname } from './router';
import { SCREENS } from './routes';

/** The same shells and screens as the Next.js app, routed from the same table. */
function App() {
  const path = usePathname();
  const match = matchRoute(path);
  if (!match) {
    return (
      <MarketingShell>
        <NotFoundScreen />
      </MarketingShell>
    );
  }
  const screen = SCREENS[match.row.pattern as RoutePattern](match.params);
  switch (match.row.shell) {
    case 'marketing':
      return <MarketingShell>{screen}</MarketingShell>;
    case 'auth':
      return <AuthShell>{screen}</AuthShell>;
    case 'focus':
      return <FocusShell>{screen}</FocusShell>;
    case 'student':
    case 'studio':
    case 'admin':
      return <AppShell area={match.row.shell}>{screen}</AppShell>;
  }
}

createRoot(document.getElementById('root')!).render(
  <Providers>
    <App />
  </Providers>,
);
