import type { Metadata } from 'next';
import { AdminClassesScreen } from '@/features/admin/AdminClassesScreen';

export const metadata: Metadata = { title: 'Classes' };

export default function Page() {
  return <AdminClassesScreen />;
}
