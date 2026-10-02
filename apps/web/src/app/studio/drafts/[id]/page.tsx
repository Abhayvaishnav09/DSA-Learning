import type { Metadata } from 'next';
import { DraftScreen } from '@/features/studio/DraftScreen';

export const metadata: Metadata = { title: 'Draft' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DraftScreen id={id} />;
}
