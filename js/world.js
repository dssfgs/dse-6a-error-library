import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const QS = new URLSearchParams(location.search);
export const STILL = QS.has('still');
export const MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

export const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.6 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffe9c8');
scene.fog = new THREE.FogExp2('#efcfa2', 0.024);

export const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}
function shadeHex(hex, k) {
  const c = new THREE.Color(hex);
  return '#' + (k >= 0 ? c.lerp(new THREE.Color('#fff6e8'), k) : c.multiplyScalar(1 + k)).getHexString();
}
function painted(base, amt = 1, rx = 1, ry = 1) {
  const [c, g] = cv(512, 512);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 220 * amt; i++) {
    const r = 20 + Math.random() * 90;
    const x = Math.random() * 512, y = Math.random() * 512;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const col = shadeHex(base, Math.random() < 0.5 ? 0.12 : -0.08);
    grd.addColorStop(0, col + '30'); grd.addColorStop(1, col + '00');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return tex(c, rx, ry);
}
function planks() {
  const [c, g] = cv(512, 1024);
  const tones = ['#c48a58', '#bd8252', '#c99061', '#b97d4e', '#c58c5b'];
  const pw = 64;
  for (let col = 0; col < 8; col++) {
    let y = -((col * 211) % 400);
    while (y < 1024) {
      const len = 300 + ((col * 137 + Math.abs(y)) % 300);
      g.fillStyle = tones[(col + Math.abs(y)) % 5];
      g.fillRect(col * pw, y, pw, len);
      g.fillStyle = 'rgba(80,45,20,.28)';
      g.fillRect(col * pw, y, pw, 2);
      y += len;
    }
    g.fillStyle = 'rgba(80,45,20,.3)';
    g.fillRect(col * pw, 0, 2, 1024);
  }
  return tex(c, 1, 3);
}
function runner(base) {
  const [c, g] = cv(256, 1024);
  g.fillStyle = base; g.fillRect(0, 0, 256, 1024);
  g.fillStyle = '#e9d6b4'; g.fillRect(14, 0, 10, 1024); g.fillRect(232, 0, 10, 1024);
  g.fillStyle = '#c9744f'; g.fillRect(30, 0, 5, 1024); g.fillRect(221, 0, 5, 1024);
  return tex(c, 1, 6);
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
export const M = {
  plaster: std({ map: painted('#efdcc0', 1.2, 2, 1) }),
  plasterBack: std({ map: painted('#e9d2b2', 1.2, 1, 1) }),
  ceiling: std({ map: painted('#f2e2c8', 1, 2, 4) }),
  wood: std({ map: painted('#9a5f37', 1, 1, 2), roughness: 0.7 }),
  woodLight: std({ map: painted('#c08453', 1, 1, 1), roughness: 0.7 }),
  woodDark: std({ map: painted('#6e3f24', 1, 1, 2), roughness: 0.75 }),
  trim: std({ map: painted('#f6e9d4', 0.6) }),
  floor: std({ map: planks(), roughness: 0.75 }),
  rug: std({ map: runner('#2f5b55'), roughness: 1 }),
  brass: std({ color: '#c9a15a', metalness: 0.6, roughness: 0.35 }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffe4ae' }),
};

const geoCache = new Map();
export function rgeo(w, h, d, r) {
  r = Math.min(r, Math.min(w, h, d) / 2 - 0.0005);
  const k = [w, h, d, r].map((v) => v.toFixed(4)).join('|');
  if (!geoCache.has(k)) geoCache.set(k, r > 0.002 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
export function box(w, h, d, mat, x, y, z, parent = scene, r = 0.02, shadow = true) {
  const m = new THREE.Mesh(rgeo(w, h, d, r), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* Hallway scale closer to hyeok so walking feels good */
export const X0 = -3.5, X1 = 3.5, Z0 = -14, Z1 = 8, H = 5.8;
export const FEAT_Z = -5.05;
export const BAY = { d: 0.48, h: 3.9, w: 2.05, base: 0.14, rows: 5 };
BAY.rowH = (BAY.h - BAY.base - 0.2) / BAY.rows;
export const rowY = (r) => BAY.base + r * BAY.rowH + (r > 0 ? 0.02 : 0);
export const SHELF_FRONT = X1 - BAY.d;

let floorAccent = '#86afd8';
let plaqueMesh = null;
export let floorMesh = null;
export const board = { group: null, canvas: null, tex: null };

function makePlaqueTexture(year, color, count) {
  const [c, g] = cv(512, 256);
  g.fillStyle = '#f7ecda'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = color; g.fillRect(0, 0, 512, 42);
  g.fillStyle = '#fffaf0'; g.font = '700 28px sans-serif'; g.textAlign = 'center';
  g.fillText('6A 錯題書架', 256, 30);
  g.fillStyle = '#3a2a20'; g.font = '800 72px Gaegu, cursive';
  g.fillText(String(year), 256, 130);
  g.fillStyle = '#8a705c'; g.font = '600 26px sans-serif';
  g.fillText(count ? `${count} 本個人錯題簿` : '暫時未有冊子', 256, 190);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dressFloor(year, color, count = 0) {
  floorAccent = color;
  scene.background = new THREE.Color('#ffe9c8');
  if (plaqueMesh) {
    const old = plaqueMesh.material.map;
    plaqueMesh.material.map = makePlaqueTexture(year, color, count);
    plaqueMesh.material.needsUpdate = true;
    old?.dispose();
  }
}

function bay(z) {
  const x = X1 - BAY.d / 2;
  box(BAY.d, BAY.h, BAY.w, M.wood, x, BAY.h / 2, z, scene, 0.02);
  box(BAY.d + 0.04, 0.08, BAY.w + 0.06, M.woodDark, x, BAY.h + 0.02, z, scene, 0.01);
  for (let r = 0; r <= BAY.rows; r++) {
    const y = rowY(r) - 0.03;
    box(BAY.d - 0.04, 0.04, BAY.w - 0.08, M.woodLight, x, y, z, scene, 0.008, false);
  }
}

function makeBoardTexture() {
  const [c, g] = cv(512, 640);
  g.fillStyle = '#f7ecda'; g.fillRect(0, 0, 512, 640);
  g.fillStyle = '#2a2623'; g.fillRect(0, 0, 512, 72);
  g.fillStyle = '#fbf1df'; g.font = '700 36px Gaegu, cursive'; g.textAlign = 'center';
  g.fillText('年份書架', 256, 48);
  g.fillStyle = '#8a705c'; g.font = '600 22px sans-serif';
  g.fillText('撳我揀年份 · 跟住貓咪走', 256, 120);
  const years = ['2012', '2013', '2014', '2018', '2023', '2024', '2025', '2026'];
  years.forEach((y, i) => {
    const yy = 160 + i * 52;
    g.fillStyle = i % 2 ? '#efe0c8' : '#f4e8d4';
    g.fillRect(48, yy, 416, 44);
    g.fillStyle = '#3a2a20'; g.font = '800 28px Gaegu, cursive'; g.textAlign = 'left';
    g.fillText(y, 72, yy + 32);
    g.fillStyle = '#a8784f'; g.font = '600 18px sans-serif'; g.textAlign = 'right';
    g.fillText('DSE 錯題 →', 440, yy + 30);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 2, Z1 - Z0 + 2), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (Z0 + Z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  floorMesh = floor;

  box(1.2, 0.02, Z1 - Z0, M.rug, 0, 0.01, (Z0 + Z1) / 2 + 0.5, scene, 0.005, false);
  box(0.35, H, Z1 - Z0 + 1, M.plaster, X0 - 0.1, H / 2, (Z0 + Z1) / 2, scene, 0.01, false);
  box(0.35, H, Z1 - Z0 + 1, M.plasterBack, X1 + 0.1, H / 2, (Z0 + Z1) / 2, scene, 0.01, false);
  box(X1 - X0 + 1, 0.25, Z1 - Z0 + 1, M.ceiling, 0, H, (Z0 + Z1) / 2, scene, 0.01, false);
  box(X1 - X0 + 1, H, 0.3, M.plaster, 0, H / 2, Z0 - 0.1, scene, 0.01, false);

  box(0.08, H, Z1 - Z0, M.trim, X0 + 0.12, H / 2, (Z0 + Z1) / 2, scene, 0.01, false);
  box(0.08, H, Z1 - Z0, M.trim, X1 - 0.12, H / 2, (Z0 + Z1) / 2, scene, 0.01, false);

  for (let z = 6.2; z > Z0 + 1.2; z -= 1.85) {
    if (Math.abs(z - FEAT_Z) > 0.35) bay(z);
  }
  bay(FEAT_Z);

  plaqueMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.45),
    new THREE.MeshStandardMaterial({ map: makePlaqueTexture('—', floorAccent, 0), roughness: 0.85 })
  );
  plaqueMesh.rotation.y = -Math.PI / 2;
  plaqueMesh.position.set(SHELF_FRONT + 0.03, rowY(3) + 0.28, FEAT_Z + 0.55);
  scene.add(plaqueMesh);
  box(0.1, 0.025, 0.42, M.brass, SHELF_FRONT + 0.08, rowY(3) + 0.05, FEAT_Z + 0.55, scene, 0.008);

  // Year directory board (lobby left)
  board.tex = makeBoardTexture();
  board.canvas = board.tex.image;
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 1.15),
    new THREE.MeshStandardMaterial({ map: board.tex, roughness: 0.7 })
  );
  face.position.set(0, 0, 0.04);
  g.add(face);
  const frame = box(1.02, 1.25, 0.08, M.woodDark, 0, 0, 0, g, 0.02);
  frame.castShadow = true;
  g.position.set(-1.35, 1.35, 1.35);
  g.rotation.y = 0.55;
  g.userData.board = true;
  scene.add(g);
  board.group = g;

  // Stairs arch hint at far end
  box(2.4, 3.2, 0.2, M.woodDark, 0, 1.6, Z0 + 0.6, scene, 0.02);
  box(0.35, 3.2, 0.35, M.wood, -1.3, 1.6, Z0 + 0.6, scene, 0.02);
  box(0.35, 3.2, 0.35, M.wood, 1.3, 1.6, Z0 + 0.6, scene, 0.02);

  const hemi = new THREE.HemisphereLight('#fff4e4', '#c48a58', 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe7c0', 1.15);
  sun.position.set(-4.5, 7.5, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 32;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  scene.add(sun);
  const warm = new THREE.PointLight('#ffd9a8', 18, 16, 2);
  warm.position.set(-0.4, 3.2, FEAT_Z + 1.2);
  scene.add(warm);

  // Lobby hanging sign
  const [sc, sg] = cv(512, 256);
  sg.fillStyle = '#2a2623'; sg.fillRect(0, 0, 512, 256);
  sg.fillStyle = '#fbf1df'; sg.font = '700 42px Gaegu, cursive'; sg.textAlign = 'center';
  sg.fillText('6A 錯題書架', 256, 100);
  sg.font = '600 24px sans-serif'; sg.fillStyle = '#e2cdb2';
  sg.fillText('跟着貓咪 · 按年份翻錯題', 256, 160);
  const signTex = new THREE.CanvasTexture(sc);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0.2, 2.35, 4.6);
  scene.add(sign);
  box(1.7, 0.9, 0.08, M.woodDark, 0.2, 2.35, 4.55, scene, 0.02);

  return { sun };
}

export function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function updateWorld() {
  // reserved
}
