import type { MetadataRoute } from 'next';

/** Installable app (PWA): home-screen icon, standalone window, quick links. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LogicPath',
    short_name: 'LogicPath',
    description: 'Learn to think like a programmer, one small step at a time.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#0c0c18',
    theme_color: '#5546d6',
    orientation: 'any',
    categories: ['education'],
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    shortcuts: [
      { name: 'Continue learning', url: '/learn' },
      { name: 'Review', url: '/review' },
    ],
  };
}
