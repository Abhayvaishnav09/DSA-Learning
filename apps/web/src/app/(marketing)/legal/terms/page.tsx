import type { Metadata } from 'next';
import { Terms } from '@/features/marketing/Legal';

export const metadata: Metadata = { title: 'Terms of use' };

export default function Page() {
  return <Terms />;
}
