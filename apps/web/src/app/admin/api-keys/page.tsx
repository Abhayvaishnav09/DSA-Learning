import type { Metadata } from 'next';
import { ApiKeysScreen } from '@/features/admin/ApiKeysScreen';

export const metadata: Metadata = { title: 'API keys' };

export default function Page() {
  return <ApiKeysScreen />;
}
