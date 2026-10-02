import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LogicPath: learn to think like a programmer', template: '%s · LogicPath' },
  description:
    'Learn programming logic from zero, one small step at a time: stories, step-by-step visuals, small questions and reviews that make it stick.',
  applicationName: 'LogicPath',
  appleWebApp: { capable: true, title: 'LogicPath', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c18' },
  ],
};

/**
 * Applies saved settings before first paint, so a dark-mode learner never sees a white flash
 * and "animations off" holds from the first frame.
 */
const settingsScript = `try{var s=JSON.parse(localStorage.getItem('logicpath:settings')||'{}').state||{},d=document.documentElement;if(s.theme==='light'||s.theme==='dark')d.dataset.theme=s.theme;if(s.contrast==='more')d.dataset.contrast='more';if(s.motion)d.dataset.motion=s.motion}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: settingsScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
