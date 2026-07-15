import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { Providers } from './app/providers'

// No <StrictMode>. The chart double-paint is actually fixed by
// `charts/useFirstPaintAnimation` (a multi-driver session's telemetry lands per
// driver, and `notMerge` replayed the sweep on each arrival — the hook animates
// only the first data paint). StrictMode's dev-only double-mount was a red
// herring, but it's left off as belt-and-suspenders so no dev remount can
// re-trigger the entrance animation on top of the hook.
createRoot(document.getElementById('root')!).render(<Providers />)
