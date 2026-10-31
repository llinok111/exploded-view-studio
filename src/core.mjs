/**
 * core.mjs — pure geometry/layout kernel for exploded-view assembly layouts.
 *
 * No three.js, no DOM, no I/O. Every function is a deterministic pure function
 * of its arguments, so bench/verify.mjs and the browser renderer run exactly
 * the same code on exactly the same data.
 *
 * Units are abstract (the sample assembly is ~4 x 3 x 3).
 */

const EPS = 1e-9;

/** Half-extents of a part's local axis-aligned bounding box. */
export function partHalfExtents(part) {
  const s = part.size;
  if (!Array.isArray(s) || s.length < 2) throw new Error(`part ${part.id}: bad size`);
  const ax = part.axis || 'x';
  if (part.shape === 'box') {
    if (s.length !== 3) throw new Error(`part ${part.id}: box needs size[3]`);
    return [s[0] / 2, s[1] / 2, s[2] / 2];
  }
  if (part.shape === 'cylinder') {
    const [r, len] = s;
    return [ax === 'x' ? len / 2 : r, ax === 'y' ? len / 2 : r, ax === 'z' ? len / 2 : r];
  }
  if (part.shape === 'torus') {
    const [R, r] = s;
    const p = R + r;
    return [ax === 'x' ? r : p, ax === 'y' ? r : p, ax === 'z' ? r : p];
  }
  throw new Error(`part ${part.id}: unknown shape ${part.shape}`);
}

/** Axis-aligned bounds of a part placed at `center` (defaults to its rest center). */
export function partAABB(part, center = part.center) {
  const h = partHalfExtents(part);
  return {
    min: [center[0] - h[0], center[1] - h[1], center[2] - h[2]],
    max: [center[0] + h[0], center[1] + h[1], center[2] + h[2]],
  };
}

/** Per-axis overlap depth. Positive on every axis means the boxes intersect. */
export function overlapDepth(a, b) {
  return [
    Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]),
    Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]),
    Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]),
  ];
}

/** Euclidean AABB separation (0 when intersecting). */
export function aabbDistance(a, b) {
  let sq = 0;
  for (let k = 0; k < 3; k++) {
    const gap = Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k], 0);
    sq += gap * gap;
  }
  return Math.sqrt(sq);
}

/**
 * All colliding pairs for the given centers.
 * `margin` > 0 treats pairs closer than `margin` on every axis as colliding,
 * which is how the solver enforces a visible air gap.
 */
export function listCollisions(parts, centers, margin = 0) {
  const boxes = parts.map((p, i) => partAABB(p, centers[i]));
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const d = overlapDepth(boxes[i], boxes[j]);
      const depth = Math.min(d[0], d[1], d[2]);
      if (depth > margin) {
        let axis = 0;
        if (d[1] <= d[axis]) axis = 1;
        if (d[2] <= d[axis]) axis = 2;
        out.push({ a: i, b: j, axis, depth });
      }
    }
  }
  return out;
}

/** Smallest AABB-to-AABB separation over all pairs (0 if anything intersects). */
export function minSeparation(parts, centers) {
  const boxes = parts.map((p, i) => partAABB(p, centers[i]));
  let best = Infinity;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const d = aabbDistance(boxes[i], boxes[j]);
      if (d < best) best = d;
    }
  }
  return best;
}

export function assemblyBounds(parts, centers = parts.map((p) => p.center)) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < parts.length; i++) {
    const b = partAABB(parts[i], centers[i]);
    for (let k = 0; k < 3; k++) {
      if (b.min[k] < min[k]) min[k] = b.min[k];
      if (b.max[k] > max[k]) max[k] = b.max[k];
    }
  }
  return { min, max };
}

export function centroid(parts) {
  const c = [0, 0, 0];
  for (const p of parts) for (let k = 0; k < 3; k++) c[k] += p.center[k];
  for (let k = 0; k < 3; k++) c[k] /= parts.length;
  return c;
}

/**
 * Baseline: classic radial explosion. Every part is scaled away from the
 * assembly centroid by the same factor — the standard "explode" trick used by
 * most viewers. Deterministic, O(n).
 */
export function radialExplode(parts, scale, origin = centroid(parts)) {
  return parts.map((p) => [
    origin[0] + (p.center[0] - origin[0]) * scale,
    origin[1] + (p.center[1] - origin[1]) * scale,
    origin[2] + (p.center[2] - origin[2]) * scale,
  ]);
}

export function totalDisplacement(parts, centers) {
  let sum = 0;
  for (let i = 0; i < parts.length; i++) {
    const dx = centers[i][0] - parts[i].center[0];
    const dy = centers[i][1] - parts[i].center[1];
    const dz = centers[i][2] - parts[i].center[2];
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return sum;
}

export function maxDisplacement(parts, centers) {
  let best = 0;
  for (let i = 0; i < parts.length; i++) {
    const dx = centers[i][0] - parts[i].center[0];
    const dy = centers[i][1] - parts[i].center[1];
    const dz = centers[i][2] - parts[i].center[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > best) best = d;
  }
  return best;
}

/**
 * Displacement-matched baseline: pick the radial scale whose total displacement
 * equals `budget`. This is the only fair comparison — both layouts spend the
 * same amount of movement.
 */
export function radialExplodeWithBudget(parts, budget, origin = centroid(parts)) {
  let unit = 0;
  for (const p of parts) {
    const dx = p.center[0] - origin[0];
    const dy = p.center[1] - origin[1];
    const dz = p.center[2] - origin[2];
    unit += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const scale = unit > EPS ? 1 + budget / unit : 1;
  const positions = radialExplode(parts, scale, origin);
  return {
    scale,
    positions,
    collisions: listCollisions(parts, positions).length,
    totalDisplacement: totalDisplacement(parts, positions),
  };
}

/**
 * Constraint solver: push colliding AABB pairs apart along their minimum
 * penetration axis until every pair keeps at least `gap` of clearance.
 *
 * The largest part is pinned so the assembly does not drift. Jacobi-style
 * accumulation + deterministic pair order keeps the result reproducible.
 */
export function solveExplode(parts, { gap = 0.06, maxIter = 400 } = {}) {
  const n = parts.length;
  const pos = parts.map((p) => p.center.slice());
  const half = parts.map((p) => partHalfExtents(p));

  // Pin the bulkiest part so the whole assembly cannot drift.
  let anchor = 0;
  let anchorVol = -1;
  for (let i = 0; i < n; i++) {
    const v = 8 * half[i][0] * half[i][1] * half[i][2];
    if (v > anchorVol + EPS) { anchorVol = v; anchor = i; }
  }

  let iterations = 0;
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;
    let hits = 0;
    // Gauss-Seidel: resolve each pair immediately, in a fixed order.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j][0] - pos[i][0];
        const dy = pos[j][1] - pos[i][1];
        const dz = pos[j][2] - pos[i][2];
        const ox = half[i][0] + half[j][0] + gap - Math.abs(dx);
        if (ox <= 0) continue;
        const oy = half[i][1] + half[j][1] + gap - Math.abs(dy);
        if (oy <= 0) continue;
        const oz = half[i][2] + half[j][2] + gap - Math.abs(dz);
        if (oz <= 0) continue;
        hits++;
        let axis = 0;
        let ov = ox;
        if (oy < ov) { axis = 1; ov = oy; }
        if (oz < ov) { axis = 2; ov = oz; }
        const d = [dx, dy, dz][axis];
        // Deterministic tie-break when two centers coincide on the axis.
        const sign = d > EPS ? 1 : d < -EPS ? -1 : ((i * 31 + j * 17) % 2 === 0 ? 1 : -1);
        const need = ov + 1e-4;
        if (i !== anchor && j !== anchor) {
          pos[i][axis] -= sign * need * 0.5;
          pos[j][axis] += sign * need * 0.5;
        } else if (i !== anchor) {
          pos[i][axis] -= sign * need;
        } else if (j !== anchor) {
          pos[j][axis] += sign * need;
        }
      }
    }
    if (hits === 0) break;
  }

  const collisions = listCollisions(parts, pos);
  return {
    positions: pos,
    anchor,
    collisions: collisions.length,
    gapSatisfied: listCollisions(parts, pos, gap * 0.5).length,
    iterations,
    totalDisplacement: totalDisplacement(parts, pos),
    maxDisplacement: maxDisplacement(parts, pos),
    minSeparation: minSeparation(parts, pos),
  };
}

/** Full report used by both the bench and the page overlay. */
export function analyze(parts) {
  const assembledCenters = parts.map((p) => p.center.slice());
  const assembled = listCollisions(parts, assembledCenters);
  const solved = solveExplode(parts);
  const naive = radialExplodeWithBudget(parts, solved.totalDisplacement);
  const solvedCollisions = listCollisions(parts, solved.positions);
  return {
    parts: parts.length,
    assembledCollisions: assembled.length,
    solvedCollisions: solvedCollisions.length,
    solverIterations: solved.iterations,
    solverTotalDisplacement: solved.totalDisplacement,
    solverMaxDisplacement: solved.maxDisplacement,
    solverMinSeparation: solved.minSeparation,
    baselineScale: naive.scale,
    baselineCollisions: naive.collisions,
    baselineTotalDisplacement: naive.totalDisplacement,
    displacementRatio: solved.totalDisplacement / naive.totalDisplacement,
  };
}
