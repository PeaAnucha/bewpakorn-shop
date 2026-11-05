import { useEffect, useRef, useState } from 'react';
import { loadThree } from '../lib/threeRuntime';

const DEFAULT_ON = true;

function readSetting(key: string) {
  try { return localStorage.getItem(key) !== 'off'; } catch { return DEFAULT_ON; }
}

export default function HangingLight({ profileId }: { profileId?: string }) {
  const storageKey = `hanging-light:${profileId ?? 'default'}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const isOnRef = useRef(DEFAULT_ON);
  const [isOn, setIsOn] = useState(() => readSetting(storageKey));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    const on = readSetting(storageKey);
    isOnRef.current = on;
    setIsOn(on);
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try { localStorage.setItem(storageKey, isOn ? 'on' : 'off'); } catch { /* The light still works for this visit. */ }
  }, [isOn, loadedKey, storageKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const targetCanvas = canvas as HTMLCanvasElement;

    let disposed = false;
    let renderer: import('three').WebGLRenderer | undefined;
    const resources: Array<{ dispose: () => void }> = [];

    async function initialize() {
      try {
        const THREE = await loadThree();
        if (disposed) return;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-0.75, 0.75, 0.84, -0.84, 0.1, 10);
        camera.position.z = 5;
        renderer = new THREE.WebGLRenderer({ canvas: targetCanvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(96, 108, false);
        renderer.setClearColor(0x000000, 0);

        const glassMaterial = new THREE.MeshPhongMaterial({
          color: 0x55442e,
          emissive: 0x000000,
          specular: 0xffe1a3,
          shininess: 85,
        });
        const bulbGeometry = new THREE.SphereGeometry(0.34, 28, 22);
        const bulb = new THREE.Mesh(bulbGeometry, glassMaterial);
        bulb.position.y = 0.08;
        bulb.scale.y = 1.12;

        const metalMaterial = new THREE.MeshPhongMaterial({ color: 0x6f695a, specular: 0xd8caa8, shininess: 40 });
        const baseGeometry = new THREE.CylinderGeometry(0.12, 0.145, 0.2, 20);
        const base = new THREE.Mesh(baseGeometry, metalMaterial);
        base.position.y = -0.34;

        const tipGeometry = new THREE.CylinderGeometry(0.10, 0.12, 0.055, 20);
        const tip = new THREE.Mesh(tipGeometry, metalMaterial);
        tip.position.y = -0.47;

        const ambient = new THREE.AmbientLight(0xffffff, 0.55);
        const light = new THREE.PointLight(0xffc56a, 0, 2.8, 2);
        light.position.set(0, 0.03, 0.1);
        scene.add(bulb, base, tip, ambient, light);
        resources.push(glassMaterial, bulbGeometry, metalMaterial, baseGeometry, tipGeometry);

        drawRef.current = () => {
          if (!renderer) return;
          glassMaterial.color.setHex(isOnRef.current ? 0xffe2a1 : 0x4a4c49);
          glassMaterial.emissive.setHex(isOnRef.current ? 0xffa62e : 0x000000);
          glassMaterial.emissiveIntensity = isOnRef.current ? 1.2 : 0;
          light.intensity = isOnRef.current ? 1.1 : 0;
          renderer.render(scene, camera);
        };
        drawRef.current();
        setCanvasReady(true);
      } catch (error) {
        console.warn('Three.js hanging light could not be initialized; using the CSS bulb fallback.', error);
      }
    }

    void initialize();
    return () => {
      disposed = true;
      drawRef.current = null;
      resources.forEach((resource) => resource.dispose());
      renderer?.dispose();
    };
  }, []);

  useEffect(() => {
    isOnRef.current = isOn;
    drawRef.current?.();
  }, [isOn]);

  function toggleLight() {
    setIsOn((value) => !value);
  }

  return (
    <>
      <div className={`hanging-light-glow ${isOn ? 'is-on' : ''}`} aria-hidden="true" />
      <div className={`hanging-light ${isOn ? 'is-on' : ''}`}>
        <span className="hanging-light-cord" aria-hidden="true" />
        <button
          type="button"
          className={`hanging-light-toggle ${canvasReady ? 'has-three-bulb' : ''}`}
          onClick={toggleLight}
          aria-label={isOn ? 'ปิดไฟตกแต่ง' : 'เปิดไฟตกแต่ง'}
          aria-pressed={isOn}
          title={isOn ? 'ปิดไฟตกแต่ง' : 'เปิดไฟตกแต่ง'}
        >
          {!canvasReady && <span className="hanging-light-fallback" aria-hidden="true" />}
          <canvas ref={canvasRef} className="hanging-light-canvas" aria-hidden="true" />
          <span className="sr-only">ไฟตกแต่ง</span>
        </button>
      </div>
    </>
  );
}


