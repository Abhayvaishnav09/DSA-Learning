import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginScreen } from '@/features/auth/LoginScreen';

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  // useSearchParams (the ?next= return address) needs a Suspense boundary when prerendered.
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
