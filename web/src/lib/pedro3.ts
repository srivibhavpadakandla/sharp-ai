import { round2, chainIdent, parseJava, type Chain, type ImportResult } from './pedro.ts';

const RESERVED = new Set(['class', 'public', 'private', 'static', 'final', 'return', 'int', 'double', 'void', 'new', 'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'this', 'super', 'null', 'true', 'false', 'package', 'import', 'try', 'catch', 'throw', 'throws', 'boolean', 'long', 'float', 'short', 'byte', 'char', 'do', 'break', 'continue', 'interface', 'enum', 'instanceof', 'abstract', 'protected', 'extends', 'implements', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'assert', 'const', 'goto']);
function unique(raw: string, fallback: string, taken: Set<string>): string {
  const base = /^[A-Za-z_$][\w$]*$/.test(raw) && !RESERVED.has(raw) ? raw : fallback;
  let name = base; let i = 2;
  while (taken.has(name)) name = `${base}${i++}`;
  taken.add(name); return name;
}

/** Pedro 3 API, checked against the official Paths, PoseFactory, and Follower sources. */
export function generatePedro3(chains: Pick<Chain, 'points' | 'segments' | 'name' | 'action'>[], className = 'GeneratedAuto'): string {
  const taken = new Set(['p', 'follower', 'pause', 'runOpMode', 'init', 'start', 'loop', 'stop', 'idle', 'sleep', 'waitForStart', 'getClass', 'wait', 'notify', 'notifyAll', 'toString', 'hashCode', 'equals']);
  const poses: string[] = [];
  const paths: string[] = [];
  const follows: string[] = [];
  const actions: string[] = [];
  let start = 'p.of(0, 0, 0)';
  for (const [chainIndex, chain] of chains.entries()) {
    const names = chain.points.map((point, i) => {
      const name = unique(point.name || '', `pose${chainIndex + 1}_${i + 1}`, taken);
      poses.push(`    private final Pose ${name} = p.of(${round2(point.x)}, ${round2(point.y)}, ${round2(point.heading)});`);
      return name;
    });
    if (!chainIndex && names[0]) start = names[0];
    let group: string[] = []; let part = 0;
    for (const [i, seg] of chain.segments.entries()) {
      const a = names[i]; const b = names[i + 1];
      const controls = seg.control.map((c) => `p.of(${round2(c.x)}, ${round2(c.y)}, 0)`);
      const geometry = controls.length ? `curve(${[a, ...controls, b].join(', ')})` : `line(${a}, ${b})`;
      const interpolation = seg.interp === 'constant' ? `.constant(${a})` : seg.interp === 'tangent' ? '.tangent()'
        : `.linear(${a}, ${b}${seg.endTime < 1 ? `, ${round2(seg.endTime)}` : ''})`;
      group.push(geometry + interpolation);
      if ((seg.waitAfter || 0) > 0 || i === chain.segments.length - 1) {
        const base = chainIdent(chain.name, chainIndex, new Set());
        const name = unique(`${base}${++part > 1 ? `Part${part}` : ''}`, `route${chainIndex + 1}_${part}`, taken);
        const expression = group.length === 1 ? group[0] : `path(\n        ${group.join(',\n        ')}\n    )`;
        paths.push(`    private Path ${name}() {\n        return ${expression};\n    }`);
        follows.push(`        follower.follow(${name}());\n        while (opModeIsActive() && follower.isBusy()) { follower.update(); idle(); }\n        if (!opModeIsActive()) return;`
          + ((seg.waitAfter || 0) > 0 ? `\n        pause(${round2(seg.waitAfter || 0)});` : ''));
        group = [];
      }
    }
    if (chain.action?.trim()) {
      const action = chain.action.trim().replace(/[\r\n\\]/g, ' ');
      const name = unique(chainIdent(action, chainIndex, new Set()), `action${chainIndex + 1}`, taken);
      follows.push(`        ${name}();`);
      actions.push(`    private void ${name}() {\n        // TODO: ${action}\n        throw new IllegalStateException("Implement ${name} before running this autonomous");\n    }`);
    }
  }
  const safeClass = unique(className, 'GeneratedAuto', new Set());
  return `package org.firstinspires.ftc.teamcode.autos;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import static com.pedropathing.api.Paths.*;
import org.firstinspires.ftc.teamcode.pedro.Constants;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

@Autonomous(name = "${safeClass}")
public class ${safeClass} extends LinearOpMode {
    private final PoseFactory p = PoseFactory.degrees();
    private Follower follower;
${poses.join('\n')}

${paths.join('\n\n')}

    @Override
    public void runOpMode() {
        follower = Constants.create(hardwareMap);
        follower.setPose(${start});
        waitForStart();
        if (isStopRequested()) return;
${follows.join('\n\n')}
    }

    private void pause(double seconds) {
        long end = System.nanoTime() + (long) (seconds * 1_000_000_000L);
        while (opModeIsActive() && System.nanoTime() < end) { follower.update(); idle(); }
    }
${actions.join('\n\n')}
}
`;
}

function closing(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')' && --depth === 0) return i;
  }
  return -1;
}
function args(source: string): string[] {
  let depth = 0; let start = 0; const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')') depth--;
    if (source[i] === ',' && depth === 0) { out.push(source.slice(start, i).trim()); start = i + 1; }
  }
  out.push(source.slice(start).trim()); return out;
}
/** Reads literal PoseFactory and Paths expressions; it never executes pasted Java. */
export function parsePedro3(source: string): ImportResult {
  const degrees = /PoseFactory\.degrees\(\)/.test(source);
  const converted = source.replace(/\bp\.of\(([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\)/g,
    (_, x, y, h) => `new Pose(${x}, ${y}, ${degrees ? `Math.toRadians(${h})` : h})`);
  const legs: string[] = [];
  const pattern = /\b(?:Paths\.)?(line|curve)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(converted))) {
    const open = converted.indexOf('(', match.index); const end = closing(converted, open);
    if (end < 0) break;
    const geometry = converted.slice(open + 1, end).replace(/new Pose\(([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*(?:Math\.toRadians\(([-\d.]+)\)|[-\d.]+)\)/g, 'new Pose($1, $2)');
    const interp = converted.slice(end + 1).match(/^\s*\.(linear|constant|tangent)\s*\(/);
    let heading = '.setTangentHeadingInterpolation()';
    if (interp) {
      const headOpen = end + 1 + interp[0].lastIndexOf('(');
      const headEnd = closing(converted, headOpen);
      const values = args(converted.slice(headOpen + 1, headEnd));
      const angle = (v: string) => /^[A-Za-z_$][\w$]*$/.test(v) ? `${v}.getHeading()` : v;
      if (interp[1] === 'linear') heading = `.setLinearHeadingInterpolation(${angle(values[0])}, ${angle(values[1])}${values[2] ? `, ${values[2]}` : ''})`;
      if (interp[1] === 'constant') heading = `.setConstantHeadingInterpolation(${angle(values[0])})`;
    }
    legs.push(`.addPath(new ${match[1] === 'line' ? 'BezierLine' : 'BezierCurve'}(${geometry}))${heading}`);
    pattern.lastIndex = end + 1;
  }
  if (!legs.length) return { model: null, note: 'No supported Pedro 3 line or curve expressions found.' };
  const result = parseJava(converted + '\n' + legs.join('\n') + '\n.build();');
  return { ...result, note: result.model ? `${result.note} Imported Pedro 3 geometry and headings; actions and pauses require manual review.` : result.note };
}
