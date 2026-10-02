import type { ReactNode } from 'react';
import { FocusShell } from '@/widgets/shell/Shells';

export default function Layout({ children }: { children: ReactNode }) {
  return <FocusShell>{children}</FocusShell>;
}
