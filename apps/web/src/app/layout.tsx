import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppHeader } from '@/features/settings/AppHeader';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LogicPath: learn to think like a programmer', template: '%s · LogicPath' },
  description:
    'Learn programming logic from zero, one small step at a time: stories, step-by-step visuals, small questions and reviews that make it stick.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#11111d' },
  ],
};

/** Applies a saved theme before first paint, so a dark-mode learner never sees a white flash. */
const themeScript = `try{var s=JSON.parse(localStorage.getItem('logicpath:settings')||'{}').state;if(s&&(s.theme==='light'||s.theme==='dark'))document.documentElement.dataset.theme=s.theme}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <AppHeader />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </body>
    </html>
  );
}
