import { useEffect, useRef } from 'react';

type VantaEffect = (options: Record<string, unknown>) => { destroy: () => void };
type EffectName = 'waves' | 'net';

const THREE_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
const EFFECT_SCRIPTS: Record<EffectName, string> = {
  waves: 'https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.waves.min.js',
  net: 'https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js',
};
const scriptLoads = new Map<string, Promise<void>>();

function loadScript(src: string) {
  let loading = scriptLoads.get(src);
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
    scriptLoads.set(src, loading);
  }
  return loading;
}

declare global {
  interface Window {
    VANTA?: {
      WAVES?: VantaEffect;
      NET?: VantaEffect;
    };
  }
}

export default function VantaBackground({ effect }: { effect: EffectName }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sceneRef.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let instance: { destroy: () => void } | undefined;

    async function start() {
      try {
        await loadScript(THREE_SCRIPT);
        await loadScript(EFFECT_SCRIPTS[effect]);
        if (disposed) return;

        const initialize = effect === 'waves' ? window.VANTA?.WAVES : window.VANTA?.NET;
        if (!initialize) throw new Error(`Could not load the Vanta ${effect} effect.`);
        const common = {
          el: element,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: effect === 'waves' ? 1 : 0.8,
          color: effect === 'waves' ? 0x236923 : 0x1db954,
          backgroundColor: 0x121212,
        };

        instance = effect === 'waves'
          ? initialize({ ...common, shininess: 50, waveHeight: 40, zoom: 0.65 })
          : initialize({ ...common, points: 10, maxDistance: 22, spacing: 18 });
      } catch (error) {
        console.warn('Vanta background could not be initialized.', error);
      }
    }

    void start();
    return () => {
      disposed = true;
      instance?.destroy();
    };
  }, [effect]);

  return <div ref={sceneRef} className={`vanta-scene vanta-scene-${effect}`} aria-hidden="true" />;
}
