/**
 * baseline/naive-explode.mjs — the baseline every number is compared against.
 *
 * The standard exploded-view trick in most viewers: push every part radially
 * away from the assembly centroid by one shared scale factor. We give this
 * baseline the SAME total displacement budget as the solver, so it is never
 * handicapped by moving less.
 */
import { centroid, listCollisions, totalDisplacement } from '../src/core.mjs';

export function naiveExplode(parts, budget, origin = centroid(parts)) {
  let unit = 0;
  for (const p of parts) {
    const dx = p.center[0] - origin[0];
    const dy = p.center[1] - origin[1];
    const dz = p.center[2] - origin[2];
    unit += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const scale = unit > 0 ? 1 + budget / unit : 1;
  const positions = parts.map((p) => [
    origin[0] + (p.center[0] - origin[0]) * scale,
    origin[1] + (p.center[1] - origin[1]) * scale,
    origin[2] + (p.center[2] - origin[2]) * scale,
  ]);
  return {
    scale,
    positions,
    collisions: listCollisions(parts, positions).length,
    totalDisplacement: totalDisplacement(parts, positions),
  };
}
