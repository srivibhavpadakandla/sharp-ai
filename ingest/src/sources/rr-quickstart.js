/**
 * Road Runner quickstart source.
 *
 * The Road Runner *docs* site publishes no licence, so it stays link-only. The
 * quickstart repository is BSD 3-Clause Clear (Copyright FIRST), the same
 * licence as the SDK samples this site already quotes, so its code is fully
 * excerptable.
 *
 * This is the code teams actually run to tune: the drive classes carry the
 * gains and physical constants in named fields, and the tuning OpModes are the
 * procedure itself. "How do I tune Road Runner" was the second most refused
 * question in the query log, behind only Pedro Pathing — and unlike Pedro, the
 * licence here permits quoting.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'https://github.com/acmerobotics/road-runner-quickstart';
const BASE = `${REPO}/blob/master/TeamCode/src/main/java/org/firstinspires/ftc/teamcode`;

/** What each file is for, so a chunk says why it matters rather than only what it is. */
const PURPOSE = {
  'MecanumDrive': ['odometry', 'Mecanum drive class. Holds the tuned feedforward, PID gains, track width and inches-per-tick constants that the tuning procedure produces.'],
  'TankDrive': ['odometry', 'Tank drive class, with the same tuned constants a mecanum robot keeps in MecanumDrive.'],
  'ThreeDeadWheelLocalizer': ['odometry', 'Three dead wheel localizer. Carries the encoder tick-per-revolution, wheel radius and pod offsets.'],
  'TwoDeadWheelLocalizer': ['odometry', 'Two dead wheel plus IMU localizer, and its pod offsets.'],
  'PinpointLocalizer': ['odometry', 'goBILDA Pinpoint localizer configuration.'],
  'OTOSLocalizer': ['odometry', 'SparkFun OTOS localizer configuration.'],
  'Localizer': ['odometry', 'The localizer interface every localization option implements.'],
  'Drawing': ['programming', 'Draws the robot and its pose onto the FTC Dashboard field overlay.'],
  'TuningOpModes': ['odometry', 'Registers every tuning OpMode. This is the entry point for the whole tuning procedure.'],
  'ManualFeedbackTuner': ['odometry', 'Manual feedback tuner: drives a straight line back and forth so the translational and heading PID gains can be tuned against the dashboard.'],
  'LocalizationTest': ['odometry', 'Localization test: drive the robot by hand and confirm the estimated pose tracks reality before tuning anything else.'],
  'SplineTest': ['odometry', 'Spline test: the end-to-end check that a tuned robot follows a curved trajectory.'],
};

export const rrQuickstart = {
  meta: {
    sourceId: 'rr-quickstart',
    sourceName: 'Road Runner Quickstart',
    homepage: REPO,
    license: 'BSD 3-Clause Clear',
    licenseUrl: `${REPO}/blob/master/LICENSE`,
    attribution: 'Road Runner Quickstart — Copyright (c) 2014-2022 FIRST — BSD 3-Clause Clear',
    canExcerpt: true,
    priority: 7,
  },

  loadChunks() {
    const root = path.join(process.cwd(), 'vendor', 'rr-quickstart',
      'TeamCode/src/main/java/org/firstinspires/ftc/teamcode');
    if (!fs.existsSync(root)) throw new Error(`Road Runner quickstart not found at ${root}`);

    // The drive classes and the tuning OpModes. The messages/ directory is
    // telemetry plumbing — no tuning value, and it would dilute retrieval.
    const files = [];
    for (const f of fs.readdirSync(root)) {
      if (f.endsWith('.java')) files.push({ rel: f, dir: '' });
    }
    const tuning = path.join(root, 'tuning');
    if (fs.existsSync(tuning)) {
      for (const f of fs.readdirSync(tuning)) {
        if (f.endsWith('.java')) files.push({ rel: f, dir: 'tuning/' });
      }
    }

    const out = [];
    for (const { rel, dir } of files.sort((a, b) => (a.dir + a.rel).localeCompare(b.dir + b.rel))) {
      const name = rel.replace(/\.java$/, '');
      const raw = fs.readFileSync(path.join(root, dir, rel), 'utf8');
      // Drop the licence header from the stored body; the notice lives in meta.
      const code = raw.replace(/\/\*[\s\S]*?Redistribution and use[\s\S]*?\*\//, '').trim();
      const [category, purpose] = PURPOSE[name] || ['odometry', `${name} from the Road Runner quickstart.`];

      out.push({
        sourceId: this.meta.sourceId,
        sourceName: this.meta.sourceName,
        docPath: `${dir}${name}`,
        pageTitle: name,
        sectionTitle: name,
        headingPath: `Road Runner Quickstart > ${name}`,
        anchor: '',
        sourceUrl: `${BASE}/${dir}${rel}`,
        category,
        license: this.meta.license,
        canExcerpt: 1,
        text: `# Road Runner Quickstart\n## ${name}\n\n${purpose}\n\n`
          + `\`\`\`java\n${code.slice(0, 7000)}\n\`\`\``,
        ordinal: out.length,
        part: 0,
        partCount: 1,
      });
    }
    return out;
  },
};
