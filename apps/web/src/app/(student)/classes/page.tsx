import type { Metadata } from 'next';
import { ClassesScreen } from '@/features/classes/ClassesScreen';

export const metadata: Metadata = { title: 'Classes' };

export default function Page() {
  return <ClassesScreen />;
}
