import {
  ENDPOINTS,
  type BodyOf,
  type Endpoint,
  type EndpointId,
  type ParamsOf,
  type Problem,
  type QueryOf,
  type ResponseOf,
} from '@logicpath/contracts';

/** What a call needs, depending on the endpoint: path params, query string, body. */
type ParamsPart<K extends EndpointId> = [ParamsOf<K>] extends [undefined]
  ? unknown
  : { params: ParamsOf<K> };
type QueryPart<K extends EndpointId> = [QueryOf<K>] extends [undefined]
  ? unknown
  : { query?: QueryOf<K> };
/** Optional bodies (e.g. logout) may be left out; required ones may not. */
type BodyPart<K extends EndpointId> = [BodyOf<K>] extends [undefined]
  ? unknown
  : undefined extends BodyOf<K>
    ? { body?: BodyOf<K> }
    : { body: BodyOf<K> };
export type InputFor<K extends EndpointId> = ParamsPart<K> & QueryPart<K> & BodyPart<K>;

export interface RequestInput {
  params?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}

/** Moves a request to a backend: the real gateway (http) or the in-browser one (local). */
export interface Transport {
  request(id: EndpointId, endpoint: Endpoint, input: RequestInput): Promise<unknown>;
}

/** A failed call, carrying the RFC 9457 problem the server sent. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
  }

  /** Field errors by path, for forms ("body.email" → "email"). */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem.errors ?? []).map((e) => [e.path.replace(/^body\./, ''), e.message]),
    );
  }
}

export const problem = (
  status: number,
  title: string,
  detail?: string,
  slug = 'request',
): Problem => ({
  type: `https://logicpath.dev/problems/${slug}`,
  title,
  status,
  ...(detail ? { detail } : {}),
});

// "Is every field of the input optional?" Then the call needs no argument.
type CallArgs<K extends EndpointId> =
  Record<never, never> extends InputFor<K>
    ? [input?: InputFor<K> & { signal?: AbortSignal }]
    : [input: InputFor<K> & { signal?: AbortSignal }];

export interface ApiClient {
  call<K extends EndpointId>(id: K, ...args: CallArgs<K>): Promise<ResponseOf<K>>;
  readonly transport: Transport;
}

/** Typed client over the shared endpoint table (ADR-0022). */
export function createClient(transport: Transport): ApiClient {
  return {
    transport,
    async call(id, ...args) {
      const endpoint = (ENDPOINTS as Record<string, Endpoint>)[id];
      if (!endpoint) throw new Error(`unknown endpoint ${String(id)}`);
      const input = (args[0] ?? {}) as RequestInput;
      return (await transport.request(id, endpoint, input)) as never;
    },
  };
}
