import type { Metadata } from 'next';
import { VisualizeScreen } from '@/features/visualize/VisualizeScreen';

export const metadata: Metadata = { title: 'Visualize your code' };

export default function Page() {
  return <VisualizeScreen />;
}
