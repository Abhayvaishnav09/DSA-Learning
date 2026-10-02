import type { Metadata } from 'next';
import { Developers } from '@/features/marketing/Developers';

export const metadata: Metadata = { title: 'Developers: public API' };

export default function Page() {
  return <Developers />;
}
