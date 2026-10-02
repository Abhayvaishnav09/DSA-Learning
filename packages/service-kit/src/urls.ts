import { DEFAULT_PORTS, type ServiceName } from '@logicpath/contracts';
import { z } from 'zod';

/**
 * Config keys for reaching other services: `<NAME>_URL`, each optional. Without one a service is
 * looked for on this machine at the port reserved for it, so a laptop needs no configuration;
 * containers set the keys to their service names.
 */
export function serviceUrls<const N extends ServiceName>(...names: N[]) {
  return Object.fromEntries(
    names.map((name) => [`${name.toUpperCase()}_URL`, z.url().optional()]),
  ) as {
    [K in N as `${Uppercase<K>}_URL`]: z.ZodOptional<z.ZodURL>;
  };
}

export function serviceUrl(config: object, name: ServiceName): string {
  const given = (config as Record<string, string | undefined>)[`${name.toUpperCase()}_URL`];
  return (given ?? `http://127.0.0.1:${DEFAULT_PORTS[name]}`).replace(/\/$/, '');
}
