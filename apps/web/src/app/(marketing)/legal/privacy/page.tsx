import type { Metadata } from 'next';
import { Privacy } from '@/features/marketing/Legal';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function Page() {
  return <Privacy />;
}
