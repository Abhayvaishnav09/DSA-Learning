import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Draft' };

export default function Page() {
  return <ComingSoon title="drafts" />;
}
