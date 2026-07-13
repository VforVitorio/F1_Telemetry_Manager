import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

// App-wide providers: TanStack Query (server-state cache) wraps TanStack Router
// (typed routing). Race telemetry is immutable/historical, so a generous default
// staleTime and no refetch-on-focus keep the UI from re-hitting the backend on
// every window blur; explicit re-run actions invalidate per key.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  },
})

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
