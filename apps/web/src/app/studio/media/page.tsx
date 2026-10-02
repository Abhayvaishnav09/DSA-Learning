import type { Metadata } from 'next';
import { MediaLibrary } from '@/features/media/MediaLibrary';

export const metadata: Metadata = { title: 'Pictures' };

export default function Page() {
  return <MediaLibrary />;
}
