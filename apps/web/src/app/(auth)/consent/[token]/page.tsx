import type { Metadata } from 'next';
import { ConsentScreen } from '@/features/auth/ConsentScreen';

export const metadata: Metadata = { title: 'Parental consent' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConsentScreen token={token} />;
}
