import type { Metadata } from 'next';
import { ReviewQueueScreen } from '@/features/admin/ReviewQueueScreen';

export const metadata: Metadata = { title: 'Review queue' };

export default function Page() {
  return <ReviewQueueScreen />;
}
