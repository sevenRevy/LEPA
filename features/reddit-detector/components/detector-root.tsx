import { useState, type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { createQueryClient } from '@/lib/create-query-client';

export function DetectorProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
