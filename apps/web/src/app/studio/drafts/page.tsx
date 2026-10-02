import type { Metadata } from 'next';
import { DraftsScreen } from '@/features/studio/DraftsScreen';

export const metadata: Metadata = { title: 'Drafts' };

export default function Page() {
  return <DraftsScreen />;
}
