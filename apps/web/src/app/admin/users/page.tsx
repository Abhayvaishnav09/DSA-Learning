import type { Metadata } from 'next';
import { UsersScreen } from '@/features/admin/UsersScreen';

export const metadata: Metadata = { title: 'Users' };

export default function Page() {
  return <UsersScreen />;
}
