import { useEffect, useState } from 'react';
import Strands from './vendor/Strands';
import './herostrands.css';

/**
 * The Strands field behind the hero, in the site's own gradient.
 *
 * The shader is additive: it computes light and derives alpha from luminance.
 * That reads beautifully on the near-black ground and almost disappears on
 * paper, so light mode does not just dim it — it composites with multiply and
 * leans on saturation, so the strands tint the page instead of glowing on it.
 */
const BRAND = ['#4a90e2', '#4fc3e8', '#6edb9a', '#9be870'];

export default function HeroStrands() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const read = () => setLight(document.documentElement.dataset.theme === 'light');
    read();
    addEventListener('themechange', read);
    return () => removeEventListener('themechange', read);
  }, []);

  return (
    <div className={`herostrands${light ? ' herostrands--light' : ''}`} aria-hidden="true">
      <Strands
        colors={BRAND}
        count={5}
        speed={0.34}
        amplitude={1.05}
        waviness={0.85}
        thickness={light ? 0.42 : 0.5}
        glow={light ? 1.25 : 1.85}
        taper={2.6}
        spread={1.3}
        intensity={light ? 0.5 : 0.5}
        saturation={light ? 2.2 : 1.35}
        opacity={light ? 0.5 : 0.62}
        scale={1.9}
      />
    </div>
  );
}
