import type { ReactNode } from 'react';
import { AppShell } from '@/widgets/shell/Shells';

export default function Layout({ children }: { children: ReactNode }) {
  return <AppShell area="admin">{children}</AppShell>;
}
