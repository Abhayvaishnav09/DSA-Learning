import type { Metadata } from 'next';
import { ReviewHeader } from '@/features/review/ReviewHeader';
import { ReviewSession } from '@/features/review/ReviewSession';

export const metadata: Metadata = { title: 'Review' };

export default function ReviewPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <ReviewHeader />
      <ReviewSession />
    </div>
  );
}
