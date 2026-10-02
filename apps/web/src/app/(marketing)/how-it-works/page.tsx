import type { Metadata } from 'next';
import { HowItWorks } from '@/features/marketing/HowItWorks';

export const metadata: Metadata = { title: 'How it works' };

export default function Page() {
  return <HowItWorks />;
}
