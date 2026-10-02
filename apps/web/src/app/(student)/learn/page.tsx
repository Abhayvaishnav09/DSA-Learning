import type { Metadata } from 'next';
import { LearnHome } from '@/features/map/LearnHome';

export const metadata: Metadata = { title: 'Your learning path' };

export default function LearnPage() {
  return <LearnHome />;
}
