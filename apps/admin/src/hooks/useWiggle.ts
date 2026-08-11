import { useCallback, useRef } from 'react';

/**
 * Apple-style wiggle animation for required fields.
 * Returns a ref to attach to the element and a trigger function.
 * 
 * Usage:
 *   const [ref, wiggle] = useWiggle();
 *   <input ref={ref} ... />
 *   if (!value) { wiggle(); return; }
 */
export function useWiggle<T extends HTMLElement = HTMLElement>(): [React.RefObject<T | null>, () => void] {
  const ref = useRef<T | null>(null);

  const wiggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    el.style.animation = 'none';
    // Force reflow
    void el.offsetWidth;
    el.style.animation = 'wiggle 0.4s ease';
    el.focus?.();

    setTimeout(() => {
      if (el) el.style.animation = '';
    }, 400);
  }, []);

  return [ref, wiggle];
}

// Inject keyframes once
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes wiggle {
      0%, 100% { transform: translateX(0); }
      15% { transform: translateX(-6px); }
      30% { transform: translateX(5px); }
      45% { transform: translateX(-4px); }
      60% { transform: translateX(3px); }
      75% { transform: translateX(-2px); }
    }
  `;
  document.head.appendChild(style);
}
