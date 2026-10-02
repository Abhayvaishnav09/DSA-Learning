import type { Metadata } from 'next';
import { StudioHome } from '@/features/studio/StudioHome';

export const metadata: Metadata = { title: 'Studio' };

export default function Page() {
  return <StudioHome />;
}
