import type { Metadata } from 'next';
import { ComingSoon } from '@/features/placeholder/ComingSoon';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return <ComingSoon title="audit" />;
}
