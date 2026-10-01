/** Single seam for "now" so tests (and later the server) control time. */
export const now = (): Date => new Date();

export const learnerTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
