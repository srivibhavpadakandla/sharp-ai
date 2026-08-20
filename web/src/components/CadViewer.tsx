import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './cadviewer.css';

/**
 * A CAD viewer for the team's own exports.
 *
 * Deliberately not an embedded Onshape: Onshape is proprietary and supports
 * putting an app *inside* Onshape, not the reverse. What is ours to show is the
 * geometry, so a model is exported to glTF and viewed here under our own
 * branding. See docs/cad.md.
 *
 * Everything runs in the browser. A dropped file is never uploaded — there is
 * no storage to pay for and no way for a private design to leave the machine.
 */

interface ModelRef { name: string; file: string; note?: string }

const UNITS_PER_INCH = 0.0254;      // glTF is metres; FTC thinks in inches

export default function CadViewer() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<THREE.Scene | null>(null);
  const camera = useRef<THREE.PerspectiveCamera | null>(null);
  const controls = useRef<OrbitControls | null>(null);
  const current = useRef<THREE.Object3D | null>(null);

  const [models, setModels] = useState<ModelRef[]>([]);
  const [label, setLabel] = useState('Sample chassis');
  const [dims, setDims] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // ---- scene ---------------------------------------------------------------
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
    cam.position.set(0.9, 0.7, 1.1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    // Three lights, not one: a single source makes every face the same value
    // and the geometry stops reading as solid.
    sc.add(new THREE.HemisphereLight(0xdfeaff, 0x0b0e12, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2, 3, 2);
    sc.add(key);
    const rim = new THREE.DirectionalLight(0x6edb9a, 0.7);
    rim.position.set(-2, 1, -2);
    sc.add(rim);

    // A 12ft field tile grid, so the model has a sense of scale.
    const grid = new THREE.GridHelper(3.6576, 12, 0x2a3a44, 0x1a242b);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    sc.add(grid);

    const orbit = new OrbitControls(cam, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.495;   // never orbit under the floor

    scene.current = sc; camera.current = cam; controls.current = orbit;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    let raf = 0;
    const tick = () => { orbit.update(); renderer.render(sc, cam); raf = requestAnimationFrame(tick); };
    tick();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose();
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []);

  // ---- placing a model -----------------------------------------------------
  const frame = useCallback((obj: THREE.Object3D, name: string) => {
    const sc = scene.current, cam = camera.current, orbit = controls.current;
    if (!sc || !cam || !orbit) return;

    if (current.current) {
      sc.remove(current.current);
      current.current.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
    }

    // Sit it on the floor, centred, whatever units it arrived in.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    obj.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
    sc.add(obj);
    current.current = obj;

    const reach = Math.max(size.x, size.y, size.z) || 1;
    cam.position.set(reach * 1.15, reach * 0.85, reach * 1.4);
    orbit.target.set(0, size.y / 2, 0);
    orbit.update();

    setLabel(name);
    setDims(`${(size.x / UNITS_PER_INCH).toFixed(1)} × ${(size.z / UNITS_PER_INCH).toFixed(1)} × ${(size.y / UNITS_PER_INCH).toFixed(1)} in`);
  }, []);

  /** An 18in chassis, so the page is not empty before a real export exists. */
  const sample = useCallback(() => {
    const g = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4a90e2, metalness: 0.35, roughness: 0.45 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1d2b33, metalness: 0.2, roughness: 0.8 });
    const s = 18 * UNITS_PER_INCH, t = 1.5 * UNITS_PER_INCH, h = 4 * UNITS_PER_INCH;
    for (const [x, z, w, d] of [[0, -s / 2, s, t], [0, s / 2, s, t], [-s / 2, 0, t, s], [s / 2, 0, t, s]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), railMat);
      rail.position.set(x, h, z); g.add(rail);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(s - t, t * 0.4, s - t), railMat);
    plate.position.set(0, h - t * 0.7, 0); g.add(plate);
    const r = 2 * UNITS_PER_INCH;
    for (const [x, z] of [[-s / 2, -s / 2], [s / 2, -s / 2], [-s / 2, s / 2], [s / 2, s / 2]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t * 1.4, 20), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, r, z); g.add(wheel);
    }
    frame(g, 'Sample chassis');
    setDims('18.0 × 18.0 × 4.8 in — placeholder, not your robot');
  }, [frame]);

  useEffect(() => {
    fetch('/cad/manifest.json')
      .then((r) => r.json())
      .then((j) => setModels(Array.isArray(j.models) ? j.models : []))
      .catch(() => setModels([]));
    sample();
  }, [sample]);

  const load = useCallback(async (url: string, name: string, isStl: boolean, revoke = false) => {
    setBusy(true); setError(null);
    try {
      if (isStl) {
        const geo = await new STLLoader().loadAsync(url);
        geo.computeVertexNormals();
        frame(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: 0x9fb3c0, metalness: 0.25, roughness: 0.6,
        })), name);
      } else {
        const gltf = await new GLTFLoader().loadAsync(url);
        frame(gltf.scene, name);
      }
    } catch (e: any) {
      setError(`Could not read ${name}. ${e?.message?.slice(0, 90) || ''}`);
    } finally {
      setBusy(false);
      if (revoke) URL.revokeObjectURL(url);
    }
  }, [frame]);

  const take = useCallback((file: File) => {
    const n = file.name.toLowerCase();
    if (!/\.(glb|gltf|stl)$/.test(n)) { setError('Needs a .glb, .gltf or .stl file.'); return; }
    load(URL.createObjectURL(file), file.name, n.endsWith('.stl'), true);
  }, [load]);

  return (
    <div className="cad">
      <div
        className={`cad__stage${dragging ? ' cad__stage--drop' : ''}`}
        ref={host}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) take(f); }}
      >
        <div className="cad__hud">
          <strong>{label}</strong>
          {dims && <span>{dims}</span>}
        </div>
        {busy && <p className="cad__busy">Reading the model…</p>}
        {dragging && <p className="cad__drophint">Drop to view</p>}
      </div>

      {error && <p className="cad__error">{error}</p>}

      <div className="cad__bar">
        <label className="cad__pick">
          <input
            type="file" accept=".glb,.gltf,.stl"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); e.target.value = ''; }}
          />
          Open a model
        </label>
        <button type="button" onClick={sample}>Sample chassis</button>
        {models.map((m) => (
          <button key={m.file} type="button"
            onClick={() => load(`/cad/${m.file}`, m.name, m.file.toLowerCase().endsWith('.stl'))}
            title={m.note}>
            {m.name}
          </button>
        ))}
      </div>

      <p className="cad__note">
        Drag a <code>.glb</code>, <code>.gltf</code> or <code>.stl</code> straight onto the
        view. Nothing is uploaded — the file is read in this browser and never leaves it,
        so an unreleased design stays private. To publish one for the team, commit it to{' '}
        <code>web/public/cad/</code> and add it to the manifest.
      </p>
    </div>
  );
}
