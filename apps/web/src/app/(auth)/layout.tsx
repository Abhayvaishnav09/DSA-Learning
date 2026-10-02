import type { ReactNode } from 'react';
import { AuthShell } from '@/widgets/shell/Shells';

export default function Layout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
