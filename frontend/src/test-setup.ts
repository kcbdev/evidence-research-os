import { vi } from "vitest";
// jest-dom v7: the /vitest entry both registers the matchers with
// vitest's expect and provides their types (the bare package root
// has no type entry — importing it passes runtime but fails tsc).
import "@testing-library/jest-dom/vitest";

// Shared jsdom shims for canvas tests (PBI-066 established, PBI-067
// centralized here so later builder suites don't copy-paste them):
// - React Flow measures via ResizeObserver (absent in jsdom); nodes
//   carry explicit dimensions so a noop observer suffices for node
//   rendering. (Edge DOM needs measured handle bounds — untestable in
//   jsdom by design; edge topology lives in unit-tested pure helpers.)
// - cmdk scrolls the highlighted option into view (absent in jsdom).
// - sonner Toaster uses window.matchMedia (absent in jsdom).
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);

Element.prototype.scrollIntoView = function () {};

// sonner Toaster needs window.matchMedia for dark mode detection
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
