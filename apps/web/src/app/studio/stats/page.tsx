import type { Metadata } from 'next';
import { StatsScreen } from '@/features/studio/StatsScreen';

export const metadata: Metadata = { title: 'Question stats' };

export default function Page() {
  return <StatsScreen />;
}
