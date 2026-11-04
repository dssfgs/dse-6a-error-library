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

/** Stable bay Z centers along the right wall (matches buildWorld bay loop). */
export const BAY_ZS = (() => {
  const zs = [];
  for (let z = 6.2; z > Z0 + 1.2; z -= 1.85) {
    if (Math.abs(z - FEAT_Z) > 0.35) zs.push(Number(z.toFixed(2)));
  }
  zs.push(FEAT_Z);
  return zs.sort((a, b) => b - a);
})();

/** Each exam year lives on its own bay — walk the hall to discover them. */
export const YEAR_BAY_Z = {
  2012: 2.5,
  2013: 0.65,
  2014: -1.2,
  2018: -3.05,
  2022: -4.05,
  2023: -5.05,
  2024: -6.75,
  2025: -8.6,
  2026: -10.45,
};

/** Assign hallway bay Z for every year (uses BAY_ZS in order). */
export function syncYearBayZ(years) {
  const list = [...years].map(String).sort((a, b) => Number(a) - Number(b));
  const zs = BAY_ZS.length ? BAY_ZS : Object.values(YEAR_BAY_Z).sort((a, b) => b - a);
  list.forEach((y, i) => {
    YEAR_BAY_Z[y] = zs[Math.min(i, zs.length - 1)];
  });
  return YEAR_BAY_Z;
}

export function yearBayZ(year) {
  const z = YEAR_BAY_Z[String(year)];
  return z == null ? FEAT_Z : z;
}

let floorAccent = '#86afd8';
let plaqueMesh = null;
let plaqueBrass = null;
export let floorMesh = null;
export const board = {
  group: null, canvas: null, tex: null, face: null,
  rows: [], canvasH: 0,
  scroll: 0, maxScroll: 0, viewTop: 0, viewBot: 0,
  allRows: [], // full dataset for scroll
};

function makePlaqueTexture(year, color, count) {
  const [c, g] = cv(640, 320);
  g.fillStyle = '#f7ecda'; g.fillRect(0, 0, 640, 320);
  g.fillStyle = color; g.fillRect(0, 0, 640, 52);
  g.fillStyle = '#fffaf0'; g.font = '700 32px sans-serif'; g.textAlign = 'center';
  g.fillText('6A 錯題書架', 320, 36);
  g.fillStyle = '#3a2a20'; g.font = '900 128px Gaegu, cursive';
  g.fillText(String(year), 320, 175);
  g.fillStyle = '#8a705c'; g.font = '600 28px sans-serif';
  g.fillText(count ? `${count} 本個人錯題簿` : '暫時未有冊子', 320, 250);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dressFloor(year, color, count = 0, bayZ = null) {
  floorAccent = color;
  scene.background = new THREE.Color('#ffe9c8');
  const z = bayZ == null ? yearBayZ(year) : bayZ;
  if (plaqueMesh) {
    const old = plaqueMesh.material.map;
    plaqueMesh.material.map = makePlaqueTexture(year, color, count);
    plaqueMesh.material.needsUpdate = true;
    old?.dispose();
    plaqueMesh.position.set(SHELF_FRONT + 0.03, rowY(3) + 0.28, z + 0.55);
  }
  if (plaqueBrass) plaqueBrass.position.set(SHELF_FRONT + 0.08, rowY(3) + 0.05, z + 0.55);
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
  // Aspect matched to face plane (1.48 x 3.05 ≈ 0.485).
  const [c, g] = cv(1024, 2110);
  g.fillStyle = '#fbf3e4'; g.fillRect(0, 0, 1024, 2110);
  g.fillStyle = '#2a221c'; g.fillRect(0, 0, 1024, 140);
  g.fillStyle = '#fff8ec'; g.font = '900 72px Gaegu, "Noto Sans TC", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('年份總表', 512, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

const BOARD_MIN_ROW = 92;
const BOARD_HEADER = 188;
const BOARD_FOOTER = 70;

/** Paint left-wall 總表. rows: [{year, you, median, hasPdf, accent}] — scrollable if needed. */
export function paintSummaryBoard(title, subtitle, rows, scrollY = null) {
  if (!board.canvas || !board.tex) return;
  const c = board.canvas;
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const list = rows || board.allRows || [];
  board.allRows = list;

  const viewTop = BOARD_HEADER;
  const viewBot = H - BOARD_FOOTER;
  const viewH = viewBot - viewTop;
  // Prefer fitting all years; only shrink toward MIN_ROW then scroll.
  let rowH = list.length ? Math.min(150, viewH / list.length) : 150;
  let needScroll = false;
  if (list.length && rowH < BOARD_MIN_ROW) {
    rowH = BOARD_MIN_ROW;
    needScroll = true;
  }
  const contentH = list.length * rowH;
  const maxScroll = Math.max(0, contentH - viewH);
  if (scrollY == null) scrollY = board.scroll || 0;
  scrollY = Math.max(0, Math.min(maxScroll, scrollY));
  board.scroll = scrollY;
  board.maxScroll = maxScroll;
  board.viewTop = viewTop;
  board.viewBot = viewBot;
  board.rowH = rowH;

  // Cream panel
  g.fillStyle = '#fbf3e4'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#241c16'; g.fillRect(0, 0, W, 150);
  g.fillStyle = '#fff8ec';
  g.font = '900 72px Gaegu, "Noto Sans TC", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(title || '年份總表', W / 2, 82);
  g.fillStyle = '#d8c4a8';
  g.font = '700 26px "Noto Sans TC", system-ui, sans-serif';
  const sub = subtitle || '撳年份睇成績 · 右邊撳書開 PDF';
  const scrollHint = maxScroll > 0 ? ' · 轆輪／拖曳睇晒' : ` · 共 ${list.length} 年`;
  g.fillText(sub + (maxScroll > 0 ? ' · 轆輪／拖曳睇晒' : ''), W / 2, 128);

  // Column headers (sticky)
  g.fillStyle = '#e9d7bc';
  roundRect(g, 28, viewTop - 34, W - 56, 32, 10); g.fill();
  g.fillStyle = '#5a4638';
  g.font = '800 22px "Noto Sans TC", system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText('年份', 56, viewTop - 10);
  g.fillText('你等級', 250, viewTop - 10);
  g.fillText('班中位', 480, viewTop - 10);
  g.textAlign = 'right';
  g.fillText('PDF', W - 56, viewTop - 10);

  // Clip row area
  g.save();
  g.beginPath();
  g.rect(0, viewTop, W, viewH);
  g.clip();

  const hit = [];
  list.forEach((r, i) => {
    const y0 = viewTop + i * rowH - scrollY;
    const y1 = y0 + rowH - 8;
    if (y1 < viewTop - 4 || y0 > viewBot + 4) return; // culled but still need hit only for visible
    const mid = y0 + (rowH - 8) / 2;

    g.fillStyle = i % 2 ? '#f0e2cc' : '#f7ecda';
    roundRect(g, 28, y0, W - 56, rowH - 8, 14); g.fill();

    g.fillStyle = r.accent || '#86afd8';
    roundRect(g, 28, y0, 20, rowH - 8, 14); g.fill();
    g.fillRect(40, y0, 8, rowH - 8);

    g.fillStyle = '#2a1e16';
    g.font = `900 ${Math.min(58, rowH * 0.55)}px Gaegu, "Noto Sans TC", sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(String(r.year), 58, mid);

    const youTxt = r.you != null ? String(r.you) : '—';
    g.fillStyle = r.you != null ? (r.accent || '#3a2a20') : '#9a8570';
    g.font = `900 ${Math.min(48, rowH * 0.45)}px Gaegu, "Noto Sans TC", sans-serif`;
    g.fillText(youTxt, 250, mid);

    g.fillStyle = '#5a4638';
    g.font = `800 ${Math.min(42, rowH * 0.4)}px Gaegu, "Noto Sans TC", sans-serif`;
    g.fillText(String(r.median || '—'), 500, mid);

    const pdfOk = !!r.hasPdf;
    const badgeW = 140, badgeH = Math.min(48, rowH - 24);
    const bx = W - 52 - badgeW, by = mid - badgeH / 2;
    g.fillStyle = pdfOk ? '#2f5b55' : '#a89078';
    roundRect(g, bx, by, badgeW, badgeH, 12); g.fill();
    g.fillStyle = '#fff8ec';
    g.font = '800 24px "Noto Sans TC", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(pdfOk ? '有 PDF' : '無 PDF', bx + badgeW / 2, mid);

    if (y1 >= viewTop && y0 <= viewBot) {
      hit.push({ year: String(r.year), y0: Math.max(y0, viewTop), y1: Math.min(y1, viewBot), hasPdf: pdfOk });
    }
  });
  g.restore();

  if (!list.length) {
    g.fillStyle = '#8a705c';
    g.font = '700 36px "Noto Sans TC", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('暫時未有年份資料', W / 2, H / 2);
  }

  // Footer: year count + scroll controls
  g.fillStyle = '#efe0c8';
  g.fillRect(0, viewBot, W, H - viewBot);
  g.fillStyle = '#5a4638';
  g.font = '700 24px "Noto Sans TC", system-ui, sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const first = list.length ? list[Math.min(list.length - 1, Math.floor(scrollY / rowH))]?.year : '—';
  const lastIdx = list.length ? Math.min(list.length - 1, Math.floor((scrollY + viewH - 1) / rowH)) : 0;
  const last = list.length ? list[lastIdx]?.year : '—';
  g.fillText(maxScroll > 0 ? `顯示 ${first}–${last} · 共 ${list.length} 年` : `全部 ${list.length} 年均可撳`, 40, (viewBot + H) / 2);

  // ▲ ▼ hit zones (pixel space)
  const btn = 56;
  const up = { x0: W - 140, y0: viewBot + 8, x1: W - 78, y1: H - 8, dir: -1 };
  const dn = { x0: W - 70, y0: viewBot + 8, x1: W - 16, y1: H - 8, dir: 1 };
  board.scrollBtns = maxScroll > 0 ? [up, dn] : [];
  if (maxScroll > 0) {
    g.fillStyle = scrollY > 0 ? '#2a221c' : '#c4b09a';
    roundRect(g, up.x0, up.y0, btn, btn - 8, 10); g.fill();
    g.fillStyle = scrollY < maxScroll - 0.5 ? '#2a221c' : '#c4b09a';
    roundRect(g, dn.x0, dn.y0, btn, btn - 8, 10); g.fill();
    g.fillStyle = '#fff8ec';
    g.font = '900 28px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('▲', (up.x0 + up.x1) / 2, (up.y0 + up.y1) / 2);
    g.fillText('▼', (dn.x0 + dn.x1) / 2, (dn.y0 + dn.y1) / 2);
  }

  board.tex.needsUpdate = true;
  if (board.face?.material) {
    board.face.material.map = board.tex;
    board.face.material.needsUpdate = true;
  }
  board.rows = hit;
  board.canvasH = H;
  board.needScroll = maxScroll > 0;
}

export function scrollSummaryBoard(deltaPx) {
  if (!board.canvas) return false;
  const next = (board.scroll || 0) + deltaPx;
  const clamped = Math.max(0, Math.min(board.maxScroll || 0, next));
  if (Math.abs(clamped - (board.scroll || 0)) < 0.5) return false;
  paintSummaryBoard(board._title, board._subtitle, board.allRows, clamped);
  return true;
}

export function setSummaryBoardLabels(title, subtitle) {
  board._title = title;
  board._subtitle = subtitle;
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
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
    new THREE.PlaneGeometry(1.15, 0.58),
    new THREE.MeshStandardMaterial({ map: makePlaqueTexture('—', floorAccent, 0), roughness: 0.85 })
  );
  plaqueMesh.rotation.y = -Math.PI / 2;
  plaqueMesh.position.set(SHELF_FRONT + 0.03, rowY(3) + 0.28, FEAT_Z + 0.55);
  scene.add(plaqueMesh);
  plaqueBrass = box(0.1, 0.025, 0.42, M.brass, SHELF_FRONT + 0.08, rowY(3) + 0.05, FEAT_Z + 0.55, scene, 0.008);

  // Left corridor wall: tall year 總表 (all years; scrolls if needed).
  // Cream face IN FRONT of wood frame (MeshBasicMaterial = readable).
  board.tex = makeBoardTexture();
  board.canvas = board.tex.image;
  board.rows = [];
  board.canvasH = board.canvas.height;
  board.scroll = 0;
  board.maxScroll = 0;
  const g = new THREE.Group();
  const faceH = 3.05, faceW = faceH * (1024 / 2110);
  const frame = box(faceW + 0.22, faceH + 0.22, 0.08, M.woodDark, 0, 0, 0, g, 0.02);
  frame.castShadow = true;
  frame.receiveShadow = true;
  box(faceW + 0.1, faceH + 0.1, 0.04, M.wood, 0, 0, 0.05, g, 0.01, false);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(faceW, faceH),
    new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false })
  );
  face.position.set(0, 0, 0.078);
  face.name = 'summaryFace';
  face.userData.boardFace = true;
  g.add(face);
  // Centered on left wall, facing hallway (+X)
  g.position.set(X0 + 0.28, 1.75, -1.6);
  g.rotation.y = Math.PI / 2;
  g.userData.board = true;
  scene.add(g);
  board.group = g;
  board.face = face;
  const boardLamp = new THREE.PointLight('#ffe6c4', 12, 8, 2);
  boardLamp.position.set(X0 + 1.5, 2.0, -1.6);
  scene.add(boardLamp);

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
  sg.fillText('左邊總表 · 右邊撳書', 256, 160);
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
