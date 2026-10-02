import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'How it works' };

export default function Page() {
  return <ComingSoon title="howItWorks" />;
}
