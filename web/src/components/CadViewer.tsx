import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_LIMIT, LIMIT_SOURCE, checkSize, type AxisCheck, type Limit } from '../lib/inspect';
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
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const cage = useRef<THREE.LineSegments | null>(null);
  const raw = useRef<THREE.Vector3 | null>(null);   // model size in inches

  const [models, setModels] = useState<ModelRef[]>([]);
  const [label, setLabel] = useState('Sample chassis');
  const [dims, setDims] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [limit, setLimit] = useState<Limit>(DEFAULT_LIMIT);
  const [checks, setChecks] = useState<AxisCheck[] | null>(null);
  const [zUp, setZUp] = useState(false);

  // ---- scene ---------------------------------------------------------------
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
    cam.position.set(0.9, 0.7, 1.1);
    // preserveDrawingBuffer so the view can be saved as a PNG for the
    // engineering notebook; without it toDataURL comes back blank.
    const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    gl.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(gl.domElement);

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

    const orbit = new OrbitControls(cam, gl.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.495;   // never orbit under the floor

    scene.current = sc; camera.current = cam; controls.current = orbit; renderer.current = gl;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      gl.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    let raf = 0;
    const tick = () => { orbit.update(); gl.render(sc, cam); raf = requestAnimationFrame(tick); };
    tick();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose();
      gl.dispose(); el.removeChild(gl.domElement);
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
    const inches = new THREE.Vector3(size.x / UNITS_PER_INCH, size.y / UNITS_PER_INCH, size.z / UNITS_PER_INCH);
    raw.current = inches;
    setDims(`${inches.x.toFixed(1)} × ${inches.z.toFixed(1)} × ${inches.y.toFixed(1)} in`);
  }, []);

  // ---- the sizing cage -----------------------------------------------------
  //
  // Drawn as well as reported: a number tells you that you failed, the box
  // shows you which corner is sticking out.
  useEffect(() => {
    const sc = scene.current;
    if (!sc) return;
    if (cage.current) { sc.remove(cage.current); cage.current.geometry.dispose(); }
    const box = new THREE.BoxGeometry(
      limit.x * UNITS_PER_INCH, limit.y * UNITS_PER_INCH, limit.z * UNITS_PER_INCH,
    );
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x6edb9a, transparent: true, opacity: 0.5 }),
    );
    box.dispose();
    lines.position.y = (limit.y * UNITS_PER_INCH) / 2;
    sc.add(lines);
    cage.current = lines;
  }, [limit]);

  // Re-run whenever either side of the comparison changes.
  useEffect(() => {
    setChecks(raw.current ? checkSize(raw.current, limit) : null);
  }, [limit, dims]);

  /** Onshape exports Z-up; three.js is Y-up, so a robot can arrive on its side. */
  const flipUp = useCallback(() => {
    const obj = current.current;
    if (!obj) return;
    const next = !zUp;
    obj.rotation.x = next ? -Math.PI / 2 : 0;
    setZUp(next);
    frame(obj, label);
  }, [zUp, label, frame]);

  /** A PNG of the current view, for the engineering notebook. */
  const capture = useCallback(() => {
    const gl = renderer.current, sc = scene.current, cam = camera.current;
    if (!gl || !sc || !cam) return;
    gl.render(sc, cam);                       // guarantee a fresh frame
    const a = document.createElement('a');
    a.href = gl.domElement.toDataURL('image/png');
    a.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    a.click();
  }, [label]);

  /** An 18in chassis, so the page is not empty before a real export exists. */
  const sample = useCallback(() => {
    const g = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4a90e2, metalness: 0.35, roughness: 0.45 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1d2b33, metalness: 0.2, roughness: 0.8 });
    // 14in frame with 2in wheels at the corners, which puts the real bounding
    // box just inside 18. The first version used an 18in frame and I labelled
    // it "18.0 x 18.0" by hand — the wheels stuck out to 20.1 x 22.0 and the
    // check caught it, which is the whole point of the check.
    const s = 14 * UNITS_PER_INCH, t = 1.5 * UNITS_PER_INCH, h = 4 * UNITS_PER_INCH;
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
    frame(g, 'Sample chassis (placeholder, not your robot)');
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
        <button type="button" onClick={flipUp} aria-pressed={zUp}
          title="Onshape exports Z-up; three.js is Y-up. Use this if the robot arrives on its side.">
          {zUp ? 'Y-up' : 'Z-up'}
        </button>
        <button type="button" onClick={capture}>Save a PNG</button>
        {models.map((m) => (
          <button key={m.file} type="button"
            onClick={() => load(`/cad/${m.file}`, m.name, m.file.toLowerCase().endsWith('.stl'))}
            title={m.note}>
            {m.name}
          </button>
        ))}
      </div>

      {checks && (
        <section className="cad__check" aria-live="polite">
          <header>
            <h2>Sizing</h2>
            <span className={checks.every((c) => c.pass) ? 'cad__verdict cad__verdict--ok' : 'cad__verdict cad__verdict--bad'}>
              {checks.every((c) => c.pass) ? 'Fits' : 'Over'}
            </span>
          </header>

          <table>
            <thead><tr><th>Axis</th><th>Model</th><th>Limit</th><th>Margin</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.axis} className={c.pass ? '' : 'cad__row--bad'}>
                  <td>{c.label}</td>
                  <td>{c.actual.toFixed(2)} in</td>
                  <td>
                    <input
                      type="number" min={1} max={200} step={0.5} value={c.limit}
                      aria-label={`${c.label} limit in inches`}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v > 0) setLimit((l) => ({ ...l, [c.axis]: v }));
                      }}
                    />
                  </td>
                  <td>{c.pass ? `${(c.limit - c.actual).toFixed(2)} in spare` : `${c.over.toFixed(2)} in over`}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Never let this be mistaken for the rule itself. */}
          <p className="cad__prov">
            {LIMIT_SOURCE.provisional ? 'Checked against ' : 'Rule: '}
            <strong>{LIMIT_SOURCE.label}</strong>, editable above. {LIMIT_SOURCE.note}{' '}
            <a href="/ask?q=what%20are%20the%20robot%20sizing%20rules%20for%20inspection">
              Ask Sharp AI what the manual says →
            </a>
          </p>
        </section>
      )}

      <p className="cad__note">
        Drag a <code>.glb</code>, <code>.gltf</code> or <code>.stl</code> straight onto the
        view. Nothing is uploaded — the file is read in this browser and never leaves it,
        so an unreleased design stays private. To publish one for the team, commit it to{' '}
        <code>web/public/cad/</code> and add it to the manifest.
      </p>
    </div>
  );
}
