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
