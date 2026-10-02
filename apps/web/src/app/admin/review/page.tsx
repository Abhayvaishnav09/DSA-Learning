import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Review queue' };

export default function Page() {
  return <ComingSoon title="reviewQueue" />;
}
