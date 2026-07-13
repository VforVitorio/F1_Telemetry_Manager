// Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.) and
// augments Vitest's `expect` types. Referenced by vite.config.ts `test.setupFiles`.
import '@testing-library/jest-dom/vitest'

// jsdom polyfills for headless UI libraries (cmdk, Radix) exercised in component
// tests. jsdom implements neither, and the libs call them during layout effects.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
