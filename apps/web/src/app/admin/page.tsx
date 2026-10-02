import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Admin' };

export default function Page() {
  return <ComingSoon title="overview" />;
}
