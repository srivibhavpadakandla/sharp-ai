import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FIELD_IN, TILE_IN } from '../lib/pedro';
import { check, extents, graspSpan, STARTERS, type Element, type Shape } from '../lib/elements';
import './lab.css';

/** Inches to scene units. The field is 12ft; working in metres keeps it sane. */
const U = 0.0254;

function geometryFor(el: Element): THREE.BufferGeometry {
  const d = el.dims;
  switch (el.shape) {
    case 'box':
      return new THREE.BoxGeometry((d.w ?? 4) * U, (d.h ?? 4) * U, (d.d ?? 4) * U);
    case 'cylinder':
      return new THREE.CylinderGeometry((d.diameter ?? 4) / 2 * U, (d.diameter ?? 4) / 2 * U, (d.height ?? 4) * U, 32);
    case 'cone':
      return new THREE.ConeGeometry((d.diameter ?? 4) / 2 * U, (d.height ?? 4) * U, 28);
    case 'sphere':
      return new THREE.SphereGeometry((d.diameter ?? 4) / 2 * U, 28, 18);
    case 'ring':
      return new THREE.TorusGeometry((d.diameter ?? 6) / 2 * U, (d.tube ?? 1) * U, 16, 40);
    case 'hex-prism':
      // Six sides, flat-to-flat is the quoted dimension, so the radius to a
      // corner is af/2 / cos(30deg).
      return new THREE.CylinderGeometry(
        (d.acrossFlats ?? 4) / 2 / Math.cos(Math.PI / 6) * U,
        (d.acrossFlats ?? 4) / 2 / Math.cos(Math.PI / 6) * U,
        (d.height ?? 2) * U, 6,
      );
  }
}

export default function Lab() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<THREE.Scene | null>(null);
  const group = useRef<THREE.Group | null>(null);
  const [elements, setElements] = useState<Element[]>(STARTERS);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    gl.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(gl.domElement);

    const light = document.documentElement.dataset.theme === 'light';
    const hemi = new THREE.HemisphereLight(0xdfeaff, light ? 0xd9d5cc : 0x0b0e12, 1.6);
    sc.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(2, 4, 2); sc.add(key);

    // The real field: 6x6 tiles of 24in, drawn to scale.
    const span = FIELD_IN * U;
    const grid = new THREE.GridHelper(span, FIELD_IN / TILE_IN,
      light ? 0xb9c2cc : 0x2a3a44, light ? 0xd8dee5 : 0x1a242b);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = light ? 0.9 : 0.55;
    sc.add(grid);
    const wall = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(span, 12 * U, span)),
      new THREE.LineBasicMaterial({ color: light ? 0x9aa5b1 : 0x3a4a55 }),
    );
    wall.position.y = 6 * U; sc.add(wall);

    const g = new THREE.Group(); sc.add(g); group.current = g;

    cam.position.set(span * 0.75, span * 0.6, span * 0.9);
    const orbit = new OrbitControls(cam, gl.domElement);
    orbit.enableDamping = true; orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.target.set(0, 0, 0); orbit.update();

    scene.current = sc;
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      cam.aspect = w / h; cam.updateProjectionMatrix(); gl.setSize(w, h, false);
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

  // Rebuild the placed elements whenever the schema changes. Geometry is
  // derived, never edited by hand, so what is drawn is what was declared.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    while (g.children.length) {
      const c = g.children.pop() as THREE.Mesh;
      c.geometry?.dispose();
      (c.material as THREE.Material)?.dispose?.();
    }
    const half = FIELD_IN / 2;
    for (const el of elements) {
      const mesh = new THREE.Mesh(geometryFor(el), new THREE.MeshStandardMaterial({
        color: el.colour, metalness: 0.15, roughness: 0.55,
      }));
      mesh.position.set((el.x - half) * U, el.z * U, (el.y - half) * U);
      mesh.rotation.y = (el.rot * Math.PI) / 180;
      g.add(mesh);
    }
  }, [elements]);

  const patch = useCallback((i: number, next: Partial<Element>) => {
    setElements((prev) => prev.map((e, n) => (n === i ? { ...e, ...next } : e)));
  }, []);
  const patchDim = useCallback((i: number, key: string, v: number) => {
    setElements((prev) => prev.map((e, n) => (n === i ? { ...e, dims: { ...e.dims, [key]: v } } : e)));
  }, []);

  const findings = check(elements);
  const cur = elements[sel];
  const DIMS: Record<Shape, [string, string][]> = {
    box: [['w', 'Width'], ['d', 'Depth'], ['h', 'Height']],
    cylinder: [['diameter', 'Diameter'], ['height', 'Height']],
    cone: [['diameter', 'Diameter'], ['height', 'Height']],
    sphere: [['diameter', 'Diameter']],
    ring: [['diameter', 'Diameter'], ['tube', 'Tube']],
    'hex-prism': [['acrossFlats', 'Across flats'], ['height', 'Height']],
  };

  return (
    <div className="lab">
      <div className="lab__stage" ref={host} />

      <div className="lab__side">
        <section className="lab__card">
          <h2>Elements</h2>
          <ul className="lab__list">
            {elements.map((e, i) => (
              <li key={e.id}>
                <button type="button" className={i === sel ? 'is-on' : ''} onClick={() => setSel(i)}>
                  <span className="lab__dot" style={{ background: e.colour }} />
                  {e.name}
                  <em>{graspSpan(e).toFixed(1)}in</em>
                </button>
              </li>
            ))}
          </ul>
          <div className="lab__row">
            <button type="button" onClick={() => setElements((p) => [...p, {
              ...STARTERS[0], id: `e${Date.now()}`, name: `Element ${p.length + 1}`,
              x: 24 + (p.length * 12) % 96, y: 24, z: 0.75,
            }])}>Add</button>
            <button type="button" disabled={elements.length < 2}
              onClick={() => { setElements((p) => p.filter((_, n) => n !== sel)); setSel(0); }}>Remove</button>
          </div>
        </section>

        {cur && (
          <section className="lab__card">
            <h2>{cur.name}</h2>
            <label className="lab__f"><span>Name</span>
              <input value={cur.name} onChange={(e) => patch(sel, { name: e.target.value })} /></label>
            <label className="lab__f"><span>Shape</span>
              <select value={cur.shape} onChange={(e) => patch(sel, { shape: e.target.value as Shape })}>
                {Object.keys(DIMS).map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
            <label className="lab__f"><span>Role</span>
              <select value={cur.kind} onChange={(e) => patch(sel, { kind: e.target.value as Element['kind'] })}>
                <option value="scoring-element">Scoring element</option>
                <option value="field-element">Field element</option>
              </select></label>
            {DIMS[cur.shape].map(([k, label]) => (
              <label className="lab__f" key={k}><span>{label}</span>
                <input type="number" step="0.25" min="0.25" value={(cur.dims as any)[k] ?? 4}
                  onChange={(e) => patchDim(sel, k, Number(e.target.value))} />
                <em>in</em></label>
            ))}
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label className="lab__f" key={axis}><span>{axis.toUpperCase()}</span>
                <input type="number" step="1" value={cur[axis]}
                  onChange={(e) => patch(sel, { [axis]: Number(e.target.value) })} />
                <em>in</em></label>
            ))}
          </section>
        )}

        <section className="lab__card">
          <h2>Physical checks</h2>
          <ul className="lab__checks">
            {findings.map((f, i) => (
              <li key={i} className={`is-${f.level}`}>
                <strong>{f.what}</strong>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
          <p className="lab__note">
            Every check is a measurement against a stated rule or a fact about the
            field — the 18in cube is R102 — so a pass means the thing could exist.
            Nothing here judges whether the game is any good.
          </p>
        </section>
      </div>
    </div>
  );
}
