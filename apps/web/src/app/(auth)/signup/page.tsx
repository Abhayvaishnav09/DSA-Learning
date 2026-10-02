import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignupScreen } from '@/features/auth/SignupScreen';

export const metadata: Metadata = { title: 'Create your account' };

export default function Page() {
  return (
    <Suspense>
      <SignupScreen />
    </Suspense>
  );
}
