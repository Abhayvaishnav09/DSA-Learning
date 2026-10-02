import type { Metadata } from 'next';
import { NewDraftScreen } from '@/features/studio/NewDraftScreen';

export const metadata: Metadata = { title: 'New draft' };

export default function Page() {
  return <NewDraftScreen />;
}
