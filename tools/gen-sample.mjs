#!/usr/bin/env node
/**
 * Deterministic sample generator: a 24-part gearbox assembly.
 * Same seed => byte-identical data/assembly.json (asserted by bench/verify.mjs).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261031);
const jitter = (amp) => Math.round((rnd() * 2 - 1) * amp * 1000) / 1000;

const parts = [
  // housing: six thin plates, clearances chosen so plates touch nothing
  { id: 'base', shape: 'box', size: [3.2, 0.12, 2.2], center: [0, -1.02, 0], group: 'housing' },
  { id: 'lid', shape: 'box', size: [3.2, 0.12, 2.2], center: [0, 1.02, 0], group: 'housing' },
  { id: 'wall-x-', shape: 'box', size: [0.12, 1.88, 1.84], center: [-1.54, 0, 0], group: 'housing' },
  { id: 'wall-x+', shape: 'box', size: [0.12, 1.88, 1.84], center: [1.54, 0, 0], group: 'housing' },
  { id: 'wall-z-', shape: 'box', size: [2.9, 1.88, 0.12], center: [0, 0, -1.04], group: 'housing' },
  { id: 'wall-z+', shape: 'box', size: [2.9, 1.88, 0.12], center: [0, 0, 1.04], group: 'housing' },

  // shafts
  { id: 'shaft-a', shape: 'cylinder', size: [0.09, 2.8], axis: 'x', center: [0, 0, 0], group: 'shaft' },
  { id: 'shaft-b', shape: 'cylinder', size: [0.07, 2.4], axis: 'x', center: [0, 0.45, 0], group: 'shaft' },

  // gears (radii jittered deterministically)
  { id: 'gear-1', shape: 'cylinder', size: [0.62 + jitter(0.01), 0.22], axis: 'x', center: [-0.55, 0, 0], group: 'gear' },
  { id: 'gear-2', shape: 'cylinder', size: [0.5 + jitter(0.01), 0.22], axis: 'x', center: [0.55, 0, 0], group: 'gear' },
  { id: 'gear-3', shape: 'cylinder', size: [0.34 + jitter(0.01), 0.2], axis: 'x', center: [0.55, 0.45, 0], group: 'gear' },
  { id: 'gear-4', shape: 'cylinder', size: [0.42 + jitter(0.01), 0.2], axis: 'x', center: [-0.6, 0.45, 0], group: 'gear' },

  // bearings and seals
  { id: 'bearing-a1', shape: 'cylinder', size: [0.22, 0.18], axis: 'x', center: [-1.35, 0, 0], group: 'bearing' },
  { id: 'bearing-a2', shape: 'cylinder', size: [0.22, 0.18], axis: 'x', center: [1.35, 0, 0], group: 'bearing' },
  { id: 'bearing-b1', shape: 'cylinder', size: [0.18, 0.16], axis: 'x', center: [-1.15, 0.45, 0], group: 'bearing' },
  { id: 'bearing-b2', shape: 'cylinder', size: [0.18, 0.16], axis: 'x', center: [1.15, 0.45, 0], group: 'bearing' },
  { id: 'seal-in', shape: 'torus', size: [0.2, 0.05], axis: 'x', center: [-1.46, 0, 0], group: 'seal' },
  { id: 'seal-out', shape: 'torus', size: [0.2, 0.05], axis: 'x', center: [1.46, 0, 0], group: 'seal' },

  // collar
  { id: 'collar', shape: 'cylinder', size: [0.16, 0.12], axis: 'x', center: [0.15, 0, 0], group: 'collar' },
];

// five M6 bolts through the housing
const bolts = [
  [1.3, 0.9], [1.3, -0.9], [-1.3, 0.9], [-1.3, -0.9], [0, -0.9],
];
bolts.forEach(([x, z], i) => {
  parts.push({
    id: `bolt-${i + 1}`,
    shape: 'cylinder',
    size: [0.055, 0.36],
    axis: 'y',
    center: [x, 0, z],
    group: 'bolt',
  });
});

const doc = {
  name: 'gearbox-24',
  seed: 20261031,
  units: 'abstract',
  parts,
};

mkdirSync(outDir, { recursive: true });
const text = JSON.stringify(doc, null, 2) + '\n';
const file = join(outDir, 'assembly.json');
writeFileSync(file, text);
const sha = createHash('sha256').update(text).digest('hex');
console.log(`wrote ${file}`);
console.log(`parts=${parts.length} bytes=${Buffer.byteLength(text)} sha256=${sha}`);
