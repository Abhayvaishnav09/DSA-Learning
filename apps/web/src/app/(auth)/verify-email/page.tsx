import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyScreen } from '@/features/auth/VerifyScreen';

export const metadata: Metadata = { title: 'Confirm your email' };

export default function Page() {
  return (
    <Suspense>
      <VerifyScreen />
    </Suspense>
  );
}
