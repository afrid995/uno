import '@testing-library/jest-dom';

// Global ResizeObserver mock for Radix UI primitives (e.g. Slider)
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // Global matchMedia mock for framer-motion useReducedMotion
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // Global PointerEvent polyfill for JSDOM
  if (!window.PointerEvent) {
    class PointerEvent extends MouseEvent {
      pointerId?: number;
      pointerType?: string;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId;
        this.pointerType = params.pointerType;
      }
    }
    window.PointerEvent = PointerEvent as unknown as typeof window.PointerEvent;
  }
}
