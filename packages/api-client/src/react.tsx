'use client';

import type { EndpointId, ResponseOf } from '@logicpath/contracts';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ApiClient, ApiError, InputFor } from './client';

const ClientContext = createContext<ApiClient | null>(null);

/** Provides the API client and a query cache to the app. */
export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) => count < 2 && ((error as ApiError).status ?? 500) >= 500,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <ClientContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ClientContext.Provider>
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useApiClient needs <ApiProvider>');
  return client;
}

/** Cache key for an endpoint call: the id first, so invalidating an id hits every input. */
export const apiKey = (id: EndpointId, input?: unknown) =>
  input === undefined ? [id] : [id, input];

type Input<K extends EndpointId> = InputFor<K>;

/** Reads (GET endpoints) through the query cache. */
export function useApi<K extends EndpointId>(
  id: K,
  input?: Input<K>,
  options?: Omit<UseQueryOptions<ResponseOf<K>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  const client = useApiClient();
  return useQuery<ResponseOf<K>, ApiError>({
    queryKey: apiKey(id, input),
    queryFn: ({ signal }) =>
      (client.call as (id: K, input: unknown) => Promise<ResponseOf<K>>)(id, {
        ...(input ?? {}),
        signal,
      }),
    ...options,
  });
}

/**
 * Writes. `invalidates` lists the reads that change as a result, so screens refresh on their own.
 */
export function useApiMutation<K extends EndpointId>(
  id: K,
  options?: Omit<UseMutationOptions<ResponseOf<K>, ApiError, Input<K>>, 'mutationFn'> & {
    invalidates?: EndpointId[];
  },
) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { invalidates = [], onSuccess, ...rest } = options ?? {};
  return useMutation<ResponseOf<K>, ApiError, Input<K>>({
    mutationFn: (input) =>
      (client.call as (id: K, input: unknown) => Promise<ResponseOf<K>>)(id, input),
    onSuccess: async (...args) => {
      await Promise.all(
        invalidates.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      await onSuccess?.(...args);
    },
    ...rest,
  });
}

export { useQueryClient };
