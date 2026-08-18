import Masonry from './Masonry';
import './visualindex.css';

/**
 * The dense visual band on /browse: generated blueprint art for each robot
 * system, interleaved with real screenshots of the documentation pages
 * citations point at.
 *
 * Masonry is image-only by design, which is the right constraint here — the
 * questions stay in the text grid below, where they are readable. Varying the
 * heights is what stops a grid of same-ratio tiles reading as a spreadsheet.
 */
const CATS = [
  { id: 'drivetrains', label: 'Drivetrains', h: 520 },
  { id: 'odometry',    label: 'Odometry',    h: 420 },
  { id: 'intakes',     label: 'Intakes',     h: 480 },
  { id: 'electronics', label: 'Electronics', h: 400 },
  { id: 'programming', label: 'Programming', h: 500 },
  { id: 'rules',       label: 'Rules',       h: 430 },
  { id: 'errors',      label: 'Errors',      h: 380 },
  { id: 'build',       label: 'Build & CAD', h: 460 },
];

const DOC_PAGE: Record<string, string> = {
  drivetrains: 'common-mechanisms/drivetrains/holonomic',
  odometry:    'common-mechanisms/dead-wheels',
  intakes:     'common-mechanisms/active-intake/types-of-intakes',
  electronics: 'power-and-electronics/servo-guide/choosing-servo',
  programming: 'software/concepts/control-loops',
  rules:       'awards/award-types',
  build:       'common-mechanisms/linear-motion-guide/rigging',
};

export default function VisualIndex() {
  const items = [
    ...CATS.map((c) => ({
      id: `art-${c.id}`,
      img: `/art/cat-${c.id}.webp`,
      url: `/ask?q=${encodeURIComponent(`Tell me about ${c.label.toLowerCase()} on an FTC robot`)}`,
      height: c.h,
    })),
    ...Object.entries(DOC_PAGE).map(([cat, docPath], i) => ({
      id: `doc-${cat}`,
      img: `/shots/doc-${cat}.webp`,
      url: `https://gm0.org/en/latest/docs/${docPath}.html`,
      height: 300 + (i % 3) * 70,
    })),
  ];

  return (
    <div className="vindex">
      <Masonry
        items={items}
        animateFrom="bottom"
        duration={0.55}
        stagger={0.04}
        blurToFocus
        scaleOnHover
        hoverScale={0.975}
      />
    </div>
  );
}
