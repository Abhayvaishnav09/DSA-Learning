import type { ReactNode } from 'react';
import { MarketingShell } from '@/widgets/shell/Shells';

export default function Layout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
