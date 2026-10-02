import type { Metadata } from 'next';
import { SubmissionScreen } from '@/features/admin/SubmissionScreen';

export const metadata: Metadata = { title: 'Submission' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionScreen id={id} />;
}
