#!/usr/bin/env node
/**
 * bench/verify.mjs — behavioural assertions over the real sample assembly.
 * Every check prints the value it actually observed. Exit 0 only if all pass.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  analyze,
  listCollisions,
  solveExplode,
  radialExplodeWithBudget,
  totalDisplacement,
  partHalfExtents,
} from '../src/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const GAP = 0.06;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) failures++;
}

const doc = JSON.parse(readFileSync(join(root, 'data', 'assembly.json'), 'utf8'));
const parts = doc.parts;
const report = analyze(parts);

check('parts == 24', parts.length === 24, `observed=${parts.length}`);
check(
  'assembled assembly has real interpenetration',
  report.assembledCollisions > 0,
  `assembledCollisions=${report.assembledCollisions}`
);
check(
  'solver reaches zero AABB collisions',
  report.solvedCollisions === 0,
  `solvedCollisions=${report.solvedCollisions} after ${report.solverIterations} passes`
);
check(
  'solver keeps a visible air gap',
  report.solverMinSeparation >= GAP - 1e-3,
  `minSeparation=${report.solverMinSeparation.toFixed(6)} (gap=${GAP})`
);
check(
  'baseline is displacement-matched (not handicapped)',
  Math.abs(report.baselineTotalDisplacement - report.solverTotalDisplacement) < 1e-9,
  `solver=${report.solverTotalDisplacement.toFixed(9)} baseline=${report.baselineTotalDisplacement.toFixed(9)}`
);
check(
  'baseline still has collisions at the same budget',
  report.baselineCollisions > 0,
  `baselineCollisions=${report.baselineCollisions}`
);
check(
  'solver beats baseline on collisions',
  report.solvedCollisions < report.baselineCollisions,
  `${report.solvedCollisions} < ${report.baselineCollisions}`
);
check(
  'max part displacement stays small',
  report.solverMaxDisplacement < 1.0,
  `maxDisplacement=${report.solverMaxDisplacement.toFixed(4)}`
);

// Determinism: two independent solver runs must agree to 1e-12.
const a = solveExplode(parts);
const b = solveExplode(parts);
let maxDelta = 0;
for (let i = 0; i < parts.length; i++) {
  for (let k = 0; k < 3; k++) {
    maxDelta = Math.max(maxDelta, Math.abs(a.positions[i][k] - b.positions[i][k]));
  }
}
check('solver is deterministic', maxDelta < 1e-12, `maxDelta=${maxDelta}`);

// The layout must actually move the assembly: the pinned housing part plus
// isolated parts stay put, everything else is displaced.
const moved = parts.filter((p, i) => {
  const d = Math.hypot(
    a.positions[i][0] - p.center[0],
    a.positions[i][1] - p.center[1],
    a.positions[i][2] - p.center[2]
  );
  return d > 1e-9;
}).length;
check('layout moves at least 20 of 24 parts', moved >= 20, `moved=${moved}/${parts.length} anchor=${a.anchor}`);

// The generator must be byte-deterministic.
const before = createHash('sha256').update(readFileSync(join(root, 'data', 'assembly.json'))).digest('hex');
const gen = spawnSync(process.execPath, [join(root, 'tools', 'gen-sample.mjs')], { cwd: root, encoding: 'utf8' });
const after = createHash('sha256').update(readFileSync(join(root, 'data', 'assembly.json'))).digest('hex');
check('generator exits 0', gen.status === 0, `status=${gen.status}`);
check('generator is byte-deterministic', before === after, `sha256=${after.slice(0, 16)}…`);

// A hand-built known case: two unit boxes overlapping by exactly 0.5 on x.
const tiny = [
  { id: 'a', shape: 'box', size: [1, 1, 1], center: [0, 0, 0] },
  { id: 'b', shape: 'box', size: [1, 1, 1], center: [0.5, 0, 0] },
];
const tinySolved = solveExplode(tiny, { gap: 0.06 });
const tinyBoxes = tiny.map((p, i) => ({ p, i }));
void tinyBoxes;
const tinyDisp = totalDisplacement(tiny, tinySolved.positions);
check(
  'hand case: 0.5 overlap resolves to 0 collisions',
  tinySolved.collisions === 0 && tinySolved.positions[0][0] === 0,
  `collisions=${tinySolved.collisions} disp=${tinyDisp.toFixed(4)} anchorMoved=${tinySolved.positions[0][0]}`
);

// Half-extent sanity for the three supported primitives.
check(
  'cylinder half-extents are axis-aware',
  JSON.stringify(partHalfExtents({ id: 'c', shape: 'cylinder', size: [2, 6], axis: 'y' })) ===
    JSON.stringify([2, 3, 2]),
  'cylinder r=2 len=6 axis=y -> [2,3,2]'
);

// The reported collision count must match an independent recount.
const recount = listCollisions(parts, a.positions).length;
check('collision recount matches', recount === report.solvedCollisions, `recount=${recount}`);

// Baseline must spend the same budget within floating point noise.
const naive = radialExplodeWithBudget(parts, report.solverTotalDisplacement);
check(
  'baseline budget equality',
  Math.abs(totalDisplacement(parts, naive.positions) - report.solverTotalDisplacement) < 1e-9,
  `scale=${naive.scale.toFixed(6)}`
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
console.log(
  `summary parts=${parts.length} assembled=${report.assembledCollisions} solved=${report.solvedCollisions} ` +
    `baseline=${report.baselineCollisions} totalDisp=${report.solverTotalDisplacement.toFixed(4)} ` +
    `iters=${report.solverIterations} minGap=${report.solverMinSeparation.toFixed(4)}`
);
process.exit(failures === 0 ? 0 : 1);
