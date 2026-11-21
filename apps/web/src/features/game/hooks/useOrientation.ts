import { useState, useEffect } from 'react';

export interface ViewportOrientation {
  isPortrait: boolean;
  isLandscape: boolean;
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  isMobile: boolean;
  isSmallMobile: boolean;
  isCompactHeight: boolean;
}

function getOrientationState(fallbackWidth?: number, fallbackHeight?: number): ViewportOrientation {
  if (typeof window === 'undefined') {
    return {
      isPortrait: false,
      isLandscape: true,
      orientation: 'landscape',
      width: 1280,
      height: 720,
      isMobile: false,
      isSmallMobile: false,
      isCompactHeight: false,
    };
  }

  const width = fallbackWidth ?? window.innerWidth;
  const height = fallbackHeight ?? window.innerHeight;

  // Determine portrait based on media query or aspect ratio
  let isPortrait = false;
  if (window.matchMedia) {
    const mql = window.matchMedia('(orientation: portrait)');
    if (mql && typeof mql.matches === 'boolean') {
      isPortrait = mql.matches;
    }
  }

  // Fallback to aspect ratio check (vital if window resized or matchMedia is neutral)
  if (!isPortrait && height > width) {
    isPortrait = true;
  }

  const isLandscape = !isPortrait;
  const isMobile = width < 768 || height < 500;
  const isSmallMobile = width <= 375;
  const isCompactHeight = height < 520;

  return {
    isPortrait,
    isLandscape,
    orientation: isPortrait ? 'portrait' : 'landscape',
    width,
    height,
    isMobile,
    isSmallMobile,
    isCompactHeight,
  };
}

/**
 * React hook that dynamically detects screen orientation and viewport dimensions.
 * Seamlessly updates state on rotation and window resize without page reloads or socket reconnections.
 */
export function useOrientation(): ViewportOrientation {
  const [state, setState] = useState<ViewportOrientation>(() => getOrientationState());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUpdate = () => {
      setState(getOrientationState());
    };

    // Standard resize and orientationchange listeners
    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    // screen.orientation API if available
    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', handleUpdate);
    }

    // MediaQueryList change listener
    let mql: MediaQueryList | null = null;
    if (window.matchMedia) {
      mql = window.matchMedia('(orientation: portrait)');
      if (mql.addEventListener) {
        mql.addEventListener('change', handleUpdate);
      } else if ('addListener' in mql) {
        // Legacy Safari support
        (mql as unknown as { addListener: (cb: () => void) => void }).addListener(handleUpdate);
      }
    }

    // Initial check
    handleUpdate();

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.removeEventListener('change', handleUpdate);
      }
      if (mql) {
        if (mql.removeEventListener) {
          mql.removeEventListener('change', handleUpdate);
        } else if ('removeListener' in mql) {
          (mql as unknown as { removeListener: (cb: () => void) => void }).removeListener(handleUpdate);
        }
      }
    };
  }, []);

  return state;
}
