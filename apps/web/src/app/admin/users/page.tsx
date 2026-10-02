import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Users' };

export default function Page() {
  return <ComingSoon title="users" />;
}
