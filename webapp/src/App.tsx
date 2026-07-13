/**
 * App root: foundations scaffold (migration issue #30).
 *
 * Intentionally minimal: this is the strangler-pattern entry point for the
 * React SPA that replaces the Streamlit UI (epic #25). Routing, the design
 * system and the six feature screens land in later issues (#31-#43).
 */
export default function App() {
  return (
    <main className="app-shell">
      <h1>F1 StratLab</h1>
      <p>Telemetry SPA scaffold, built with React + Vite + TypeScript.</p>
      <p className="muted">
        Migration epic #25, replacing the Streamlit UI. This is the foundations scaffold (issue
        #30); the feature screens arrive in later sprints.
      </p>
    </main>
  )
}
