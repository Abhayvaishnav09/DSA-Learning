import type { Metadata } from 'next';
import { InboxScreen } from '@/features/inbox/InboxScreen';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <InboxScreen />;
}
