import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { Providers } from './app/providers'

// No <StrictMode>: its intentional dev-only double-invoke of effects double-
// MOUNTS every component, which makes echarts-for-react init + play its
// entrance animation twice on first paint (prod, with a single mount, is fine).
// Dropping it lets the chart paint animation run exactly once in dev too —
// matching production behaviour.
createRoot(document.getElementById('root')!).render(<Providers />)
