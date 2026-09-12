import { vi } from "vitest";

// Shared jsdom shims for canvas tests (PBI-066 established, PBI-067
// centralized here so later builder suites don't copy-paste them):
// - React Flow measures via ResizeObserver (absent in jsdom); nodes
//   carry explicit dimensions so a noop observer suffices for node
//   rendering. (Edge DOM needs measured handle bounds — untestable in
//   jsdom by design; edge topology lives in unit-tested pure helpers.)
// - cmdk scrolls the highlighted option into view (absent in jsdom).
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);

Element.prototype.scrollIntoView = function () {};
