import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetScreen } from '@/features/auth/ResetScreen';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function Page() {
  return (
    <Suspense>
      <ResetScreen />
    </Suspense>
  );
}
