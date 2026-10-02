/** An error that becomes an RFC 9457 problem response. */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly slug: string,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: { path: string; message: string }[],
  ) {
    super(detail ?? title);
    this.name = 'HttpProblem';
  }
}

export const problemType = (slug: string) => `https://logicpath.dev/problems/${slug}`;

export const badRequest = (detail: string, errors?: { path: string; message: string }[]) =>
  new HttpProblem(400, 'validation', 'Invalid request', detail, errors);
export const unauthorized = (detail = 'Sign in to continue') =>
  new HttpProblem(401, 'unauthorized', 'Unauthorized', detail);
export const forbidden = (detail = 'You do not have permission to do this') =>
  new HttpProblem(403, 'forbidden', 'Forbidden', detail);
export const notFound = (what: string) =>
  new HttpProblem(404, 'not-found', 'Not found', `${what} not found`);
export const conflict = (detail: string) => new HttpProblem(409, 'conflict', 'Conflict', detail);
export const tooManyRequests = (detail = 'Too many requests, slow down') =>
  new HttpProblem(429, 'rate-limited', 'Too many requests', detail);
