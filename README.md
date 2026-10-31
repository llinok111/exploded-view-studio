# Exploded View Studio

**Same displacement budget (2.3907 units), the standard radial explode leaves 18 AABB collisions in a 24-part gearbox; this constraint solver reaches 0 collisions in 7 passes, max part travel 0.621, minimum clearance 0.060.**

Upstream: none — the layout kernel, sample assembly and baseline are original to this repo.

## Run it

```bash
python3 -m http.server 4173   # then open http://localhost:4173
```

One command proves the numbers (no browser needed):

```bash
node bench/verify.mjs
```

## What it is

A 24-part gearbox (housing plates, two shafts, four gears, bearings, seals, collar, bolts) is generated deterministically by `tools/gen-sample.mjs`. `src/core.mjs` treats an exploded view as a constrained packing problem: every part is an AABB, and colliding pairs are pushed apart along their minimum-penetration axis until each pair keeps a 0.06 air gap. The bulkiest part is pinned so the assembly cannot drift. The same kernel runs in node and in the browser.

The page has one interaction: drag `explode t`, and switch between the solver layout and the naive radial baseline. The collision counter is recomputed live by `src/core.mjs` — flip to the baseline at `t=1` and it reads 18, matching `bench/result.json`.

## Evidence

`bench/result.json` (node v24.19.0, 15 samples × 100 pipeline passes, median quoted):

| metric | value | how |
| --- | --- | --- |
| parts | 24 | `data/assembly.json` |
| collisions in assembled state | 18 | `node bench/verify.mjs` |
| collisions after solver, t=1 | **0** | `node bench/verify.mjs` |
| collisions of baseline at equal displacement | **18** | `baseline/naive-explode.mjs`, same 2.3907 budget |
| solver passes | 7 | fixed pair order, Gauss–Seidel |
| total displacement | 2.3907 | sum over parts |
| max single-part displacement | 0.6213 | |
| minimum separation after solve | 0.0600 | gap target 0.06 |
| median layout time | 0.0844 ms | 15 samples, 100 calls each |
| cold start (first call) | 7.49 ms | includes first-call JIT |
| p95 / stddev | 0.1168 ms / 0.0115 ms | relative stddev 13.0% |

Reproduce:

```bash
node tools/gen-sample.mjs   # deterministic sample, sha256 a6d3a879…
node bench/verify.mjs       # 16 behavioural assertions, exit 0
node bench/bench.mjs        # rewrites bench/result.json
```

The baseline is deliberately not handicapped: it is the classic radial explode, and its scale is chosen so its total displacement equals the solver's. Both layouts therefore spend exactly the same movement budget; only the collision count differs.

## 本轮创新

**把爆炸视图当成带约束的 AABB 排布问题，而不是一个缩放动画。** 常见做法（包括本仓库的基线）是让所有零件绕质心按同一比例散开；当零件同轴嵌套（轴穿过齿轮和轴承）时，它们在径向缩放中几乎不动，碰撞一直存在。这里改成逐对沿最小穿透轴分离、钉住最大件、并强制 0.06 间隙，7 轮收敛。更关键的是**对照基线被配平到同一总位移**，且浏览器里的实时碰撞数与 `node bench/verify.mjs` 走同一份 `src/core.mjs`——所见即所验，不是一张截图。此前台账里的 LOD/剖切/点云工作都没有涉及装配体布局，这一条是新方向。

## Known limits

- Collision is AABB-only. Rotated parts use their axis-aligned extents, so the solver is conservative, not exact for oriented geometry.
- All-pairs O(n²) with 24 parts; a 10k-part scene needs a broadphase (grid/BVH), which is out of scope here.
- The 0.06 gap is a layout aesthetic, not a manufacturing tolerance.
- Timing noise: in the committed run (`bench/result.json`) the relative stddev is 13.0%, above the 10% guideline. The first two samples (0.1168 and 0.1145 ms) carry residual V8/GC cost; the remaining 13 sit between 0.0776 and 0.0967 ms. Median 0.0844 vs min 0.0776 differ by 8.8%, so the quoted figure is the median, and the outlier is reported rather than hidden.
- Cold start (7.49 ms) is the first `analyze()` call in a fresh process; it is reported separately and never mixed into the median.
