import { Problem } from '@logicpath/contracts';

/** The error responses an endpoint may return, as documented in its OpenAPI entry. */
export const problems = {
  400: Problem,
  401: Problem,
  403: Problem,
  404: Problem,
  409: Problem,
  429: Problem,
} as const;
