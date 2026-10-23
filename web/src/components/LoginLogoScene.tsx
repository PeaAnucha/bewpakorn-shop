import { useEffect, useRef, useState } from 'react';
import { loadThree } from '../lib/threeRuntime';

const SIZE = 96;

export default function LoginLogoScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const [cubeReady, setCubeReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    const image = logoRef.current;
    if (!mount || !image || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Capture the checked refs as non-null locals for use inside the async initializer.
    const mountElement: HTMLDivElement = mount;
    const logoImage: HTMLImageElement = image;

    let disposed = false;
    let renderer: import('three').WebGLRenderer | undefined;
    let scene: import('three').Scene | undefined;
    let cancelImageWait: (() => void) | undefined;
    const resources: { dispose: () => void }[] = [];

    async function start() {
      try {
        const THREE = await loadThree();
        if (disposed) return;
        if (!logoImage.complete) {
          const ready = await new Promise<boolean>((resolve) => {
            const finish = (loaded: boolean) => {
              logoImage.removeEventListener('load', onLoad);
              logoImage.removeEventListener('error', onError);
              cancelImageWait = undefined;
              resolve(loaded);
            };
            const onLoad = () => finish(true);
            const onError = () => finish(false);
            cancelImageWait = () => finish(false);
            logoImage.addEventListener('load', onLoad, { once: true });
            logoImage.addEventListener('error', onError, { once: true });
          });
          if (!ready || disposed) return;
        }
        if (!logoImage.naturalWidth) return;

        scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 20);
        camera.position.z = 2.5;
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(SIZE, SIZE, false);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.width = `${SIZE}px`;
        renderer.domElement.style.height = `${SIZE}px`;
        mountElement.appendChild(renderer.domElement);

        // Use a small GPU texture so the original high-resolution logo stays lightweight in WebGL.
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = 384;
        textureCanvas.height = 384;
        const context = textureCanvas.getContext('2d');
        if (!context) throw new Error('Could not prepare the logo texture.');
        context.drawImage(logoImage, 0, 0, textureCanvas.width, textureCanvas.height);
        const texture = new THREE.CanvasTexture(textureCanvas);
        const runtime = THREE as unknown as { sRGBEncoding?: number };
        if (runtime.sRGBEncoding !== undefined) (texture as unknown as { encoding: number }).encoding = runtime.sRGBEncoding;
        const sideMaterial = new THREE.MeshBasicMaterial({ map: texture });
        const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const cube = new THREE.Mesh(geometry, Array.from({ length: 6 }, () => sideMaterial));
        const edgeGeometry = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x9dff55, transparent: true, opacity: 0.9 });
        cube.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
        resources.push(texture, sideMaterial, geometry, edgeGeometry, edgeMaterial);
        scene.add(cube);

        const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x20ff42, transparent: true, opacity: 0.12 });
        const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x8dff42, transparent: true, opacity: 0.82 });
        const orbitMaterial = new THREE.MeshBasicMaterial({ color: 0x27e856, transparent: true, opacity: 0.52 });
        const glow = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.105, 8, 64), glowMaterial);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.022, 8, 64), ringMaterial);
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.009, 6, 64), orbitMaterial);
        resources.push(glow.geometry, glowMaterial, ring.geometry, ringMaterial, orbit.geometry, orbitMaterial);
        const halo = new THREE.Group();
        halo.rotation.x = 0.48;
        halo.rotation.y = -0.22;
        orbit.rotation.x = 0.92;
        orbit.rotation.y = 0.45;
        halo.add(glow, ring, orbit);
        scene.add(halo);

        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          if (!scene || !renderer) return;
          // Use elapsed time so the cube turns at the same speed on different displays.
          const delta = Math.min(clock.getDelta(), 0.05);
          cube.rotation.x += 0.40 * delta;
          cube.rotation.y += 0.40 * delta;
          halo.rotation.z -= 0.108 * delta;
          orbit.rotation.z += 0.18 * delta;
          renderer.render(scene, camera);
        });
        setCubeReady(true);
      } catch (error) {
        // The regular image logo remains visible when WebGL is unavailable.
        console.warn('Login cube animation could not be initialized.', error);
      }
    }

    void start();
    return () => {
      disposed = true;
      cancelImageWait?.();
      renderer?.setAnimationLoop(null);
      resources.forEach((resource) => resource.dispose());
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div ref={mountRef} className="pointer-events-none absolute inset-0 flex items-center justify-center" role="img" aria-label="Bewpakorn Shop logo">
      <img
        ref={logoRef}
        src="/brand-logo.png"
        alt=""
        className={`absolute z-10 h-16 w-16 rounded-xl object-cover shadow-lg transition-opacity duration-300 ${cubeReady ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  );
}
