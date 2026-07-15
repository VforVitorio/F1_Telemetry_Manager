import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { TooltipProvider } from '@/components/Tooltip'
import { ToastProvider } from '@/components/Toast'
import { useUiStore } from '@/stores/ui'

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
  // Single source of truth for the active theme: mirror the persisted store
  // onto <html data-theme>, which every token reads via :root[data-theme].
  // The FOUC guard in index.html sets this before React mounts; this effect
  // keeps it in sync on toggle.
  const theme = useUiStore((state) => state.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
