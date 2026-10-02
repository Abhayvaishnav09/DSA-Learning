import type { Metadata } from 'next';
import { DeveloperKeysScreen } from '@/features/developer/DeveloperKeysScreen';

export const metadata: Metadata = { title: 'API keys' };

export default function Page() {
  return <DeveloperKeysScreen />;
}
