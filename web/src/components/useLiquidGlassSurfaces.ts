import { useEffect, useMemo, useRef } from 'react';

export default function useLiquidGlassSurfaces(surfaceCount: number) {
  const rootRef = useRef<HTMLDivElement>(null);
  const surfacesRef = useRef<Array<HTMLElement | null>>([]);
  const surfaceCallbacks = useMemo(
    () => Array.from({ length: surfaceCount }, (_, index) => (element: HTMLElement | null) => {
      surfacesRef.current[index] = element;
    }),
    [surfaceCount],
  );

  useEffect(() => {
    const root = rootRef.current;
    const glassElements = surfacesRef.current.slice(0, surfaceCount).filter((element): element is HTMLElement => element !== null);
    if (!root || glassElements.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let destroy: (() => void) | undefined;

    void import('@ybouane/liquidglass')
      .then(({ LiquidGlass }) => LiquidGlass.init({
        root,
        glassElements,
        defaults: {
          blurAmount: 0.2,
          refraction: 0.26,
          chromAberration: 0.012,
          edgeHighlight: 0.1,
          specular: 0.06,
          cornerRadius: 18,
          opacity: 0.92,
          tintStrength: 0.1,
          shadowOpacity: 0.2,
        },
      }))
      .then((instance) => {
        if (disposed) instance.destroy();
        else destroy = () => instance.destroy();
      })
      .catch((error: unknown) => {
        console.warn('Liquid Glass could not be initialized; using the CSS glass fallback.', error);
      });

    return () => {
      disposed = true;
      destroy?.();
    };
  }, [surfaceCount]);

  return { rootRef, surfaceCallbacks };
}
