#!/usr/bin/env node
/**
 * bench/bench.mjs — cold start + 15 measured samples, median/p95/stddev.
 * Writes bench/result.json; README quotes exactly these numbers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze } from '../src/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const parts = JSON.parse(readFileSync(join(root, 'data', 'assembly.json'), 'utf8')).parts;

const now = () => Number(process.hrtime.bigint()) / 1e6;

// Cold start: the very first analyze() call in this process (module import
// already happened above; this measures the first real layout pass).
const coldStart = now();
const coldReport = analyze(parts);
const coldStartMs = now() - coldStart;

// Warmup (discarded), then 15 measured samples. Each sample runs 100 full
// pipeline passes and reports the per-pass cost: at ~0.08 ms/call a single
// pass is dominated by timer granularity, which would make the numbers noisy
// without making them more honest.
const CALLS_PER_SAMPLE = 100;
for (let i = 0; i < 200; i++) analyze(parts); // JIT warmup, discarded
const samples = [];
for (let s = 0; s < 15; s++) {
  const t = now();
  for (let i = 0; i < CALLS_PER_SAMPLE; i++) analyze(parts);
  samples.push((now() - t) / CALLS_PER_SAMPLE);
}

const sorted = [...samples].sort((x, y) => x - y);
const sum = samples.reduce((a, b) => a + b, 0);
const mean = sum / samples.length;
const median = sorted[Math.floor(sorted.length / 2)];
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
const stddev = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);

const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  parts: parts.length,
  coldStartMs: Number(coldStartMs.toFixed(4)),
  samplesMs: samples.map((x) => Number(x.toFixed(4))),
  minMs: Number(sorted[0].toFixed(4)),
  medianMs: Number(median.toFixed(4)),
  p95Ms: Number(p95.toFixed(4)),
  meanMs: Number(mean.toFixed(4)),
  stddevMs: Number(stddev.toFixed(4)),
  relativeStddev: Number((stddev / mean).toFixed(4)),
  sampleCount: samples.length,
  callsPerSample: CALLS_PER_SAMPLE,
  metrics: {
    assembledCollisions: coldReport.assembledCollisions,
    solvedCollisions: coldReport.solvedCollisions,
    baselineCollisions: coldReport.baselineCollisions,
    solverIterations: coldReport.solverIterations,
    solverTotalDisplacement: Number(coldReport.solverTotalDisplacement.toFixed(6)),
    solverMaxDisplacement: Number(coldReport.solverMaxDisplacement.toFixed(6)),
    solverMinSeparation: Number(coldReport.solverMinSeparation.toFixed(6)),
    baselineScale: Number(coldReport.baselineScale.toFixed(6)),
  },
};

writeFileSync(join(root, 'bench', 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
