/// <reference types="vite/client" />

// Custom env vars the app reads. VITE_API_BASE overrides the API origin; empty
// (the default) keeps requests same-origin so nginx/Vite proxy them to :8000.
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
