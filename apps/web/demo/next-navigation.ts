import { navigate, usePathname, useSearchParams } from './router';

export { usePathname, useSearchParams };

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => {},
  prefetch: () => {},
};

export const useRouter = () => router;

export class NotFoundError extends Error {}
export function notFound(): never {
  throw new NotFoundError('not found');
}
export function redirect(href: string): never {
  navigate(href, true);
  throw new Error('redirect');
}
