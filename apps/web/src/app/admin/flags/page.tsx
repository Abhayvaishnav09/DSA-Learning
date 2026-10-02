import type { Metadata } from 'next';
import { FlagsScreen } from '@/features/admin/FlagsScreen';

export const metadata: Metadata = { title: 'Feature flags' };

export default function Page() {
  return <FlagsScreen />;
}
