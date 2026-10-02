import type { Metadata } from 'next';
import { ContentScreen } from '@/features/admin/ContentScreen';

export const metadata: Metadata = { title: 'Content versions' };

export default function Page() {
  return <ContentScreen />;
}
