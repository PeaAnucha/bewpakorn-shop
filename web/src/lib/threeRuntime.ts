const THREE_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
let loadingThree: Promise<typeof import('three')> | null = null;

declare global {
  interface Window {
    THREE?: typeof import('three');
  }
}

/** Share the Three.js runtime already used by Vanta instead of loading a second copy. */
export function loadThree(): Promise<typeof import('three')> {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (loadingThree) return loadingThree;

  loadingThree = new Promise<typeof import('three')>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = THREE_SCRIPT;
    script.async = true;
    script.onload = () => window.THREE ? resolve(window.THREE) : reject(new Error('Three.js loaded without a global runtime.'));
    script.onerror = () => reject(new Error('Could not load Three.js.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loadingThree = null;
    throw error;
  });

  return loadingThree!;
}
