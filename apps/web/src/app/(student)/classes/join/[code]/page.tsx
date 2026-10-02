import type { Metadata } from 'next';
import { JoinClassScreen } from '@/features/classes/JoinClassScreen';

export const metadata: Metadata = { title: 'Join a class' };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinClassScreen code={code} />;
}
