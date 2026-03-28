import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 15_000,
        retry: 1,
        staleTime: 15_000,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}
