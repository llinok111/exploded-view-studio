import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  listCollisions,
  minSeparation,
  radialExplodeWithBudget,
  solveExplode,
  totalDisplacement,
} from './src/core.mjs';

const COLORS = {
  housing: 0x7d8ea3,
  shaft: 0xd9b26a,
  gear: 0xe0684b,
  bearing: 0x4fa3a5,
  seal: 0x9a7fd1,
  collar: 0xc9c9c9,
  bolt: 0x8a8f98,
};

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e13);
scene.fog = new THREE.Fog(0x0b0e13, 12, 26);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5.4, 4.0, 6.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 2.5;
controls.maxDistance = 20;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x151a22, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(6, 9, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6ea8fe, 0.9);
rim.position.set(-7, 2, -6);
scene.add(rim);

const grid = new THREE.GridHelper(18, 36, 0x1d2734, 0x141b24);
grid.position.y = -1.55;
scene.add(grid);

const root = new THREE.Group();
scene.add(root);

const doc = await (await fetch('./data/assembly.json')).json();
const parts = doc.parts;
const solved = solveExplode(parts);
const assembledCollisions = listCollisions(parts, parts.map((p) => p.center)).length;

// Build one mesh per part, plus edge lines so silhouettes stay readable.
const objects = parts.map((part) => {
  const color = COLORS[part.group] ?? 0xcccccc;
  let geo;
  if (part.shape === 'box') {
    geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
  } else if (part.shape === 'cylinder') {
    geo = new THREE.CylinderGeometry(part.size[0], part.size[0], part.size[1], 40, 1);
    if (part.axis === 'x') geo.rotateZ(Math.PI / 2);
    if (part.axis === 'z') geo.rotateX(Math.PI / 2);
  } else {
    geo = new THREE.TorusGeometry(part.size[0], part.size[1], 16, 48);
    if (part.axis === 'x') geo.rotateY(Math.PI / 2);
    if (part.axis === 'y') geo.rotateX(Math.PI / 2);
  }
  const isHousing = part.group === 'housing';
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: part.group === 'gear' ? 0.55 : 0.75,
    roughness: part.group === 'housing' ? 0.55 : 0.32,
    transparent: isHousing,
    opacity: isHousing ? 0.16 : 1,
    depthWrite: !isHousing,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.fromArray(part.center);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 28),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: isHousing ? 0.55 : 0.35 })
  );
  mesh.add(edges);
  root.add(mesh);
  return mesh;
});

// Both target layouts are computed once, by the same kernel node runs.
const solverTargets = solved.positions;
const naive = radialExplodeWithBudget(parts, solved.totalDisplacement);
const naiveTargets = naive.positions;

const state = { t: 1, mode: 'solver' };

const ui = {
  collisions: document.getElementById('collisions'),
  mode: document.getElementById('mode'),
  disp: document.getElementById('disp'),
  sep: document.getElementById('sep'),
  iters: document.getElementById('iters'),
  baseline: document.getElementById('baseline'),
  nodeMedian: document.getElementById('nodeMedian'),
  assembled: document.getElementById('assembled'),
  tval: document.getElementById('tval'),
  t: document.getElementById('t'),
  btnSolver: document.getElementById('btn-solver'),
  btnNaive: document.getElementById('btn-naive'),
  btnReset: document.getElementById('btn-reset'),
};

const lerp = (a, b, t) => a + (b - a) * t;

function currentCenters() {
  const targets = state.mode === 'solver' ? solverTargets : naiveTargets;
  return parts.map((p, i) => [
    lerp(p.center[0], targets[i][0], state.t),
    lerp(p.center[1], targets[i][1], state.t),
    lerp(p.center[2], targets[i][2], state.t),
  ]);
}

function refresh() {
  const centers = currentCenters();
  objects.forEach((o, i) => o.position.fromArray(centers[i]));
  const collisions = listCollisions(parts, centers).length;
  const disp = totalDisplacement(parts, centers);
  const sep = minSeparation(parts, centers);

  ui.collisions.textContent = String(collisions);
  ui.collisions.className = `v big ${collisions === 0 ? 'ok' : 'bad'}`;
  ui.mode.textContent = state.mode === 'solver' ? 'solver (constraint)' : 'naive radial';
  ui.disp.textContent = disp.toFixed(3);
  ui.sep.textContent = collisions === 0 ? sep.toFixed(3) : '0.000 (overlap)';
  ui.assembled.textContent = `${assembledCollisions} collisions`;
  ui.iters.textContent = String(solved.iterations);
  ui.baseline.textContent = `${naive.collisions} collisions`;
  ui.tval.textContent = state.t.toFixed(2);
}

ui.t.addEventListener('input', () => {
  state.t = Number(ui.t.value) / 100;
  refresh();
});

function setMode(mode) {
  state.mode = mode;
  ui.btnSolver.classList.toggle('active', mode === 'solver');
  ui.btnNaive.classList.toggle('active', mode === 'naive');
  refresh();
}
ui.btnSolver.addEventListener('click', () => setMode('solver'));
ui.btnNaive.addEventListener('click', () => setMode('naive'));
ui.btnReset.addEventListener('click', () => {
  camera.position.set(5.4, 4.0, 6.6);
  controls.target.set(0, 0, 0);
  controls.update();
});

// Bench numbers are read from the artifact node produced, never hardcoded.
fetch('./bench/result.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((bench) => {
    if (bench) ui.nodeMedian.textContent = `${bench.medianMs.toFixed(3)} ms · ${bench.sampleCount} samples`;
  })
  .catch(() => {});

refresh();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
