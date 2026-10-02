import type { Metadata } from 'next';
import { LeagueScreen } from '@/features/league/LeagueScreen';

export const metadata: Metadata = { title: 'Leagues' };

export default function Page() {
  return <LeagueScreen />;
}
