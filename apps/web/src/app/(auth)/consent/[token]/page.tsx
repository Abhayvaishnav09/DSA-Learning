import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Parental consent' };

export default function Page() {
  return <ComingSoon title="account" />;
}
