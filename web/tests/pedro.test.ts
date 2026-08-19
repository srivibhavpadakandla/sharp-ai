import { bezierAt, bezierTangent, sampleChain, poseAtLength, generateJava, starterPath, validate, shortestDelta, robotCorners } from '../src/lib/pedro';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); fail++; } else console.log('ok  ', m); };

// straight line: midpoint and length
const line = [{x:0,y:0},{x:10,y:0}];
ok(Math.abs(bezierAt(line, 0.5).x - 5) < 1e-9, 'line midpoint');
const m = starterPath();
const { table, total } = sampleChain(m);
// leg1 is a straight line 9,60 -> 60,84
const l1 = Math.hypot(60-9, 84-60);
ok(total > l1, `total length ${total.toFixed(1)} exceeds first leg ${l1.toFixed(1)}`);
// arc-length parameterisation: equal distance steps must be equal spatial steps
const a = poseAtLength(m, table, total*0.25), b = poseAtLength(m, table, total*0.5), c = poseAtLength(m, table, total*0.75);
const d1 = Math.hypot(b.x-a.x,b.y-a.y), d2 = Math.hypot(c.x-b.x,c.y-b.y);
ok(Math.abs(d1-d2)/Math.max(d1,d2) < 0.25, `even spacing ${d1.toFixed(1)} vs ${d2.toFixed(1)}`);
// endpoints
const start = poseAtLength(m, table, 0), end = poseAtLength(m, table, total);
ok(Math.hypot(start.x-9,start.y-60) < 0.2, 'starts at first waypoint');
ok(Math.hypot(end.x-108,end.y-60) < 0.5, `ends at last waypoint (${end.x.toFixed(1)},${end.y.toFixed(1)})`);
// heading: linear interp reaches target by endTime
ok(Math.abs(start.heading - 0) < 1e-6, 'start heading 0');
// shortest turn wraps: 350deg -> 10deg is +20deg not -340
ok(Math.abs(shortestDelta(350*Math.PI/180, 10*Math.PI/180) - 20*Math.PI/180) < 1e-9, 'shortest turn wraps');
// tangent
const tg = bezierTangent([{x:0,y:0},{x:10,y:0}], 0.5);
ok(Math.abs(Math.atan2(tg.y,tg.x)) < 1e-9, 'tangent of a line is 0 rad');
// robot corners rotate
const cs = robotCorners({x:72,y:72,heading:Math.PI/2}, 18, 18);
ok(cs.every(p => Math.abs(Math.hypot(p.x-72,p.y-72) - Math.hypot(9,9)) < 1e-9), 'corners keep radius under rotation');
// validation catches the documented degenerate case
const deg = { points:[{x:10,y:10,heading:0},{x:20,y:20,heading:0}], segments:[{control:[{x:0,y:0}],interp:'linear' as const,endTime:1}] };
ok(validate(deg,18,18).some(w=>/degenerate/.test(w.text)), 'flags collinear-out-of-order control point');
const dup = { points:[{x:10,y:10,heading:0},{x:20,y:20,heading:0}], segments:[{control:[{x:10,y:10}],interp:'linear' as const,endTime:1}] };
ok(validate(dup,18,18).some(w=>/repeats/.test(w.text)), 'flags repeated control point');
ok(validate(m,18,18).filter(w=>w.level==='error').length === 0, 'starter path is clean');

const java = generateJava(m, 'DemoPath');
for (const frag of ['new BezierLine(startPose, scorePose)','new BezierCurve(scorePose, new Pose(84, 96), pickupPose)','Math.toRadians(90)','follower.pathBuilder()','.build();','!follower.isBusy()','setLinearHeadingInterpolation(startPose.getHeading(), scorePose.getHeading(), 0.8)'])
  ok(java.includes(frag), `java contains ${frag}`);
console.log(fail ? `\n${fail} FAILED` : '\nall passed');

// --- sharing round-trip -----------------------------------------------------
import { encodePath, decodePath } from '../src/lib/pedro';
{
  let f2 = 0;
  const ok2 = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); f2++; } else console.log('ok  ', m); };
  const src = starterPath();
  const round = decodePath('#' + encodePath(src))!;
  ok2(!!round, 'round-trips');
  ok2(JSON.stringify(round.points) === JSON.stringify(src.points), 'waypoints survive');
  ok2(round.segments[1].control.length === 1 && round.segments[1].control[0].x === 84, 'control point survives');
  ok2(round.segments[0].endTime === 0.8, 'endTime survives');
  // hostile input must not escape the field or blow up
  const evil = decodePath('#p=99999,-500,1e9,__proto___0,0,0&s=x,55,1,2,3,4,5,6,7,8');
  ok2(!!evil, 'hostile input still parses');
  ok2(evil!.points.every(p => p.x >= 0 && p.x <= 144 && p.y >= 0 && p.y <= 144), 'coords clamped to field');
  ok2(evil!.points[0].name === undefined, 'rejects __proto__ as a name');
  ok2(evil!.segments[0].interp === 'linear', 'unknown interp falls back');
  ok2(evil!.segments[0].endTime <= 1 && evil!.segments[0].endTime >= 0.1, 'endTime clamped');
  ok2(evil!.segments[0].control.length <= 2, 'control points capped at 2');
  ok2(decodePath('#p=1,2,3') === null, 'single waypoint rejected');
  ok2(decodePath('#nonsense') === null, 'garbage rejected');
  console.log(f2 ? `${f2} SHARE FAILED` : 'sharing ok');
}

// --- java import ------------------------------------------------------------
import { parseJava } from '../src/lib/pedro';
{
  let f3 = 0;
  const ok3 = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); f3++; } else console.log('ok  ', m); };

  // Round-trip: generate from a model, parse it back, expect the same geometry.
  const src = starterPath();
  const back = parseJava(generateJava(src));
  ok3(!!back.model, 'round-trips generated code: ' + back.note);
  const m2 = back.model!;
  ok3(m2.points.length === 3, `3 waypoints, got ${m2.points.length}`);
  ok3(Math.abs(m2.points[1].x - 60) < 0.01 && Math.abs(m2.points[1].y - 84) < 0.01, 'waypoint 2 coords');
  ok3(Math.abs(m2.points[1].heading - 90) < 0.01, `heading converted from radians, got ${m2.points[1].heading}`);
  ok3(m2.segments[1].control.length === 1 && m2.segments[1].control[0].x === 84, 'curve control point read');
  ok3(Math.abs(m2.segments[0].endTime - 0.8) < 0.01, 'endTime read');

  // The shape from Pedro's own example page.
  const example = `
    private final Pose startPose = new Pose(9, 60, Math.toRadians(0));
    private final Pose scorePose = new Pose(37, 65, Math.toRadians(180));
    pathChain = follower.pathBuilder()
        .addPath(new BezierLine(startPose, scorePose))
        .setLinearHeadingInterpolation(startPose.getHeading(), scorePose.getHeading())
        .addPath(new BezierCurve(scorePose, new Pose(60, 54), startPose))
        .setConstantHeadingInterpolation(scorePose.getHeading())
        .build();`;
  const ex = parseJava(example);
  ok3(!!ex.model, 'parses the documented example shape');
  ok3(ex.model!.segments.length === 2, `2 legs, got ${ex.model!.segments.length}`);
  ok3(ex.model!.segments[1].interp === 'constant', 'constant interpolation detected');
  ok3(ex.model!.segments[1].control.length === 1, 'inline control Pose read');
  ok3(ex.model!.points.some(p => Math.abs(p.heading - 180) < 0.01), '180 degree heading read');

  // Tangent + failure reporting
  ok3(parseJava('.addPath(new BezierLine(a,b)).setTangentHeadingInterpolation()').model === null,
      'undefined poses are not invented');
  ok3(/no pathBuilder chain|no .addPath/i.test(parseJava('int x = 3;').note), 'says why it failed');
  ok3(parseJava('').note.length > 0, 'empty input handled');
  // out-of-field coordinates get clamped, not trusted
  const wild = parseJava('p = new Pose(9999, -40, Math.toRadians(0)); q = new Pose(10,10);\n.addPath(new BezierLine(p, q))');
  ok3(!wild.model || wild.model.points.every(pt => pt.x <= 144 && pt.x >= 0 && pt.y >= 0), 'imported coords clamped');
  console.log(f3 ? `${f3} IMPORT FAILED` : 'import ok');
}

// --- timing and obstacles ---------------------------------------------------
import { runTime, schedule, hitsObstacle, DEFAULT_LIMITS, robotCorners as rc2 } from '../src/lib/pedro';
{
  let f4 = 0;
  const ok4 = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); f4++; } else console.log('ok  ', m); };

  // Trapezoid: long enough to reach cruise. accel time 1s, decel 1s, plus cruise.
  const L = { xVel: 50, yVel: 50, maxAccel: 50, maxDecel: 50 };
  ok4(Math.abs(runTime(50, L) - 2) < 1e-6, `50in at 50/50 => 2s, got ${runTime(50,L).toFixed(3)}`);
  // Triangular: too short to reach maxVel. d=25 -> ramp distance is 25 so exactly triangular.
  ok4(Math.abs(runTime(25, L) - 2 * Math.sqrt(25 / 50)) < 1e-9, 'short run uses a triangular profile');
  ok4(runTime(0, L) === 0, 'zero distance takes no time');
  ok4(runTime(100, L) > runTime(50, L), 'further takes longer');
  ok4(runTime(50, { xVel: 100, yVel: 100, maxAccel: 100, maxDecel: 100 }) < runTime(50, L), 'a faster robot is quicker');

  const m = starterPath();
  const sch = schedule(m, DEFAULT_LIMITS);
  ok4(sch.legs.length === 2, '2 legs scheduled');
  ok4(Math.abs(sch.totalInches - 115.6) < 1.5, `total length ~115.6, got ${sch.totalInches.toFixed(1)}`);
  ok4(sch.totalSeconds > 0 && sch.totalSeconds < 20, `plausible duration ${sch.totalSeconds.toFixed(2)}s`);
  ok4(Math.abs(sch.legs.reduce((n,l)=>n+l.seconds,0) - sch.driveSeconds) < 1e-6, 'leg times sum to drive time');

  // A wait stops the robot, so the same path takes longer and splits the runs.
  const withWait = { ...m, segments: m.segments.map((s,i)=> i===0 ? {...s, waitAfter: 2} : s) };
  const sw = schedule(withWait, DEFAULT_LIMITS);
  ok4(Math.abs(sw.waitSeconds - 2) < 1e-9, 'wait counted');
  ok4(sw.totalSeconds > sch.totalSeconds + 2 - 1e-6, 'stopping mid-path costs more than the wait alone');

  // Obstacles
  const box = { id:'a', name:'goal', x: 60, y: 60, w: 20, h: 20 };
  ok4(hitsObstacle(rc2({x:70,y:70,heading:0}, 18, 18), box), 'robot inside the obstacle is a hit');
  ok4(!hitsObstacle(rc2({x:10,y:10,heading:0}, 18, 18), box), 'robot far away is not a hit');
  // Corner case a bounding-box test would get wrong: rotated robot just clear of a corner
  ok4(!hitsObstacle(rc2({x:44,y:44,heading:Math.PI/4}, 18, 18), box), 'rotated robot clear of the corner is not a hit');
  ok4(hitsObstacle(rc2({x:56,y:56,heading:Math.PI/4}, 18, 18), box), 'rotated robot overlapping the corner is a hit');
  console.log(f4 ? `${f4} TIMING FAILED` : 'timing ok');
}

import { distanceAtTime } from '../src/lib/pedro';
{
  let f5 = 0;
  const ok5 = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); f5++; } else console.log('ok  ', m); };
  const m = starterPath();
  const withWait = { ...m, segments: m.segments.map((s,i)=> i===0 ? {...s, waitAfter: 2} : s) };
  const sw = schedule(withWait, DEFAULT_LIMITS);
  ok5(distanceAtTime(sw, 0) === 0, 'starts at zero');
  ok5(Math.abs(distanceAtTime(sw, sw.totalSeconds) - sw.totalInches) < 0.5, 'ends at full length');
  // during the wait the robot must not advance
  const tIn = sw.legs[0].seconds + 0.5;
  const tOut = sw.legs[0].seconds + 1.5;
  ok5(Math.abs(distanceAtTime(sw, tIn) - distanceAtTime(sw, tOut)) < 1e-9, 'holds position through a wait');
  ok5(Math.abs(distanceAtTime(sw, tIn) - sw.legs[0].length) < 1e-9, 'waits at the end of leg 1');
  ok5(distanceAtTime(sw, sw.totalSeconds + 5) <= sw.totalInches + 1e-9, 'never overruns the path');
  console.log(f5 ? `${f5} TIME MAP FAILED` : 'time map ok');
}

// --- directional velocity (ported model) ------------------------------------
import { speedAt, DEFAULT_LIMITS as DL } from '../src/lib/pedro';
{
  let f6 = 0;
  const ok6 = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); f6++; } else console.log('ok  ', m); };
  ok6(Math.abs(speedAt(0, DL) - DL.xVel) < 1e-9, 'straight forward uses the forward limit');
  ok6(Math.abs(speedAt(Math.PI / 2, DL) - DL.yVel) < 1e-9, 'pure strafe uses the strafe limit');
  const diag = speedAt(Math.PI / 4, DL);
  ok6(diag < DL.xVel && diag > DL.yVel, `diagonal sits between the two, got ${diag.toFixed(1)}`);
  ok6(Math.abs(speedAt(Math.PI, DL) - DL.xVel) < 1e-9, 'backwards matches forwards');

  // A sideways route must take longer than the same distance driven forward.
  const fwd = { points: [{x:20,y:70,heading:0},{x:120,y:70,heading:0}], segments:[{control:[],interp:'linear' as const,endTime:1}] };
  const side = { points: [{x:70,y:20,heading:0},{x:70,y:120,heading:0}], segments:[{control:[],interp:'linear' as const,endTime:1}] };
  const snappy = { ...DL, maxAccel: 150, maxDecel: 150 };
  const tf = schedule(fwd, snappy).totalSeconds;
  const ts = schedule(side, snappy).totalSeconds;
  ok6(ts > tf, `100in sideways (${ts.toFixed(2)}s) costs more than forward (${tf.toFixed(2)}s)`);
  // And with ordinary acceleration the two match, because neither reaches cruise.
  ok6(Math.abs(schedule(side, DL).totalSeconds - schedule(fwd, DL).totalSeconds) < 1e-9,
      'at 30 in/s^2 a 100in leg is acceleration-limited either way');

  // Asymmetric braking must change the answer.
  const slowStop = { ...DL, maxDecel: 10 };
  ok6(schedule(fwd, slowStop).totalSeconds > tf, 'weaker braking takes longer');
  console.log(f6 ? `${f6} DIRECTIONAL FAILED` : 'directional ok');
}

// --- multiple path chains ---------------------------------------------------
import { generateJavaChains, chainIdent, CHAIN_COLORS, type Chain } from '../src/lib/pedro';
{
  let f7 = 0;
  const ok7 = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); f7++; } else console.log('ok  ', m); };
  const mk = (name: string, x: number): Chain => ({
    id: name, name, color: CHAIN_COLORS[0],
    points: [{ x, y: 20, heading: 0, name: `${name}Start` }, { x: x + 30, y: 90, heading: 90, name: `${name}End` }],
    segments: [{ control: [], interp: 'linear', endTime: 0.8 }],
  });
  const chains = [mk('score preload', 10), mk('cycle', 60), mk('park', 100)];
  const java = generateJavaChains(chains, 'MyAuto');

  ok7(java.includes('private PathChain scorePreload, cycle, park;'), 'declares every chain');
  ok7((java.match(/pathBuilder\(\)/g) || []).length === 3, 'one builder per chain');
  ok7((java.match(/followPath\(/g) || []).length === 3, 'follows each in order');
  ok7(java.indexOf('followPath(scorePreload)') < java.indexOf('followPath(cycle)'), 'keeps declared order');
  ok7(java.includes('while (follower.isBusy())'), 'waits for each to finish');
  ok7(java.includes('LinearOpMode'), 'a sequence needs a LinearOpMode');

  // names must survive collision and bad input
  const taken = new Set<string>();
  ok7(chainIdent('score preload', 0, taken) === 'scorePreload', 'camel-cases a name');
  ok7(chainIdent('score preload', 1, taken) === 'scorePreload2', 'de-duplicates');
  ok7(/^chain3$/.test(chainIdent('123', 2, taken)), 'falls back when a name is not an identifier');
  ok7(/^[a-zA-Z_$]/.test(chainIdent('!!!', 3, taken)), 'never emits an invalid identifier');
  console.log(f7 ? `${f7} CHAINS FAILED` : 'chains ok');
}
