import type { Metadata } from 'next';
import { UserScreen } from '@/features/admin/UserScreen';

export const metadata: Metadata = { title: 'User' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserScreen id={id} />;
}
