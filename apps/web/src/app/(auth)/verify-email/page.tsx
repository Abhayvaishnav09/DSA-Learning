import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Verify your email' };

export default function Page() {
  return <ComingSoon title="signIn" />;
}
