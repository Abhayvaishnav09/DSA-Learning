import type { Metadata } from 'next';
import { LearnHome } from '@/features/map/LearnHome';

export const metadata: Metadata = { title: 'Your learning path' };

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <LearnHome />
    </div>
  );
}
