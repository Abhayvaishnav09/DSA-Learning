import type { Metadata } from 'next';
import { ForgotScreen } from '@/features/auth/ForgotScreen';

export const metadata: Metadata = { title: 'Forgot password' };

export default function Page() {
  return <ForgotScreen />;
}
