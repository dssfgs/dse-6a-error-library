import * as THREE from 'three';
import { FEAT_Z, SHELF_FRONT, rowY, BAY, rgeo } from './world.js';

export const YEAR_FLOORS = [
  { key: '2012', year: '2012', name: '2012', title: 'DSE 2012 錯題', color: '#86b98f' },
  { key: '2013', year: '2013', name: '2013', title: 'DSE 2013 錯題', color: '#a5c786' },
  { key: '2014', year: '2014', name: '2014', title: 'DSE 2014 錯題', color: '#86afd8' },
  { key: '2018', year: '2018', name: '2018', title: 'DSE 2018 錯題', color: '#93bfdc' },
  { key: '2023', year: '2023', name: '2023', title: 'DSE 2023 錯題', color: '#c99fd0' },
  { key: '2024', year: '2024', name: '2024', title: 'DSE 2024 錯題', color: '#eda088' },
  { key: '2025', year: '2025', name: '2025', title: 'DSE 2025 錯題', color: '#e5bc62' },
  { key: '2026', year: '2026', name: '2026', title: '校本／2026 錯題', color: '#d88a6a' },
];
export const FLOOR = Object.fromEntries(YEAR_FLOORS.map((f) => [f.key, f]));

const CLOTH = ['#2f5b55', '#c9744f', '#e2b85c', '#6b3d5a', '#7d9a6a', '#2f3e63', '#efe0c2', '#a44a3f',
  '#d99a74', '#4f7f8a', '#8a6a4a', '#b8a3cc', '#3c4c3a', '#e7c9a4', '#9a3f4f', '#5d7a9a'];
const SANS = '"Pretendard Variable", Pretendard, "Noto Sans TC", system-ui, sans-serif';
const INK = '#4a3a32';

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function grain(g, w, h, amount = 1) {
  for (let i = 0; i < w * h * 0.003 * amount; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(120,80,50,${Math.random() * 0.04})` : `rgba(255,250,240,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1);
  }
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

export function bookId(item) {
  return `${item.class}-${item.student_id}-${item.year}`;
}

function bookDims(item) {
  const h0 = hash(bookId(item));
  const pages = item.pages || 4;
  return {
    t: Math.min(0.085, Math.max(0.04, 0.035 + pages * 0.0022 + ((h0 >>> 2) % 3) * 0.004)),
    h: 0.30 + ((h0 >>> 4) % 4) * 0.02,
    d: 0.22 + ((h0 >>> 6) % 3) * 0.01,
  };
}
const clothOf = (item) => CLOTH[hash(bookId(item)) % CLOTH.length];

function spineTexture(item, dims, yearColor) {
  const W = 128;
  const H = Math.round((W * dims.h) / dims.t);
  const [c, g] = canvas(W, H);
  const bg = clothOf(item);
  const light = lum(bg) > 0.6;
  const ink = light ? INK : '#fffaf0';
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  grain(g, W, H, 2.5);

  const labelH = 110, labelY = H - labelH - 18;
  g.fillStyle = light ? 'rgba(120,85,55,.45)' : 'rgba(255,248,232,.75)';
  rrect(g, 14, 22, W - 28, 4, 2); g.fill();
  rrect(g, 14, labelY - 18, W - 28, 4, 2); g.fill();

  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'top';
  g.font = `800 46px ${SANS}`;
  const sid = String(item.student_id).padStart(2, '0');
  const chars = [...sid];
  let y = 48;
  chars.forEach((ch) => { g.fillText(ch, W / 2, y); y += 52; });
  g.font = `700 22px ${SANS}`;
  g.fillText('學號', W / 2, y + 4);

  g.fillStyle = '#fffaf0';
  rrect(g, 10, labelY, W - 20, labelH, 10); g.fill();
  g.save(); rrect(g, 10, labelY, W - 20, labelH, 10); g.clip();
  g.fillStyle = yearColor; g.fillRect(10, labelY, W - 20, 16);
  g.restore();
  g.fillStyle = INK; g.textAlign = 'center';
  g.font = `800 24px ${SANS}`; g.fillText(item.year, W / 2, labelY + 28);
  g.font = `700 20px ${SANS}`; g.fillText(item.class, W / 2, labelY + 58);
  g.font = `600 18px ${SANS}`; g.fillText(`${item.pages || '?'}頁`, W / 2, labelY + 86);

  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(90,60,40,.18)');
  grd.addColorStop(0.22, 'rgba(90,60,40,0)');
  grd.addColorStop(0.78, 'rgba(90,60,40,0)');
  grd.addColorStop(1, 'rgba(90,60,40,.18)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  return tex(c);
}

function coverTexture(item, dims, yearColor) {
  const W = 512, Hh = Math.round((W * dims.h) / dims.d);
  const [c, g] = canvas(W, Hh);
  const bg = clothOf(item);
  const light = lum(bg) > 0.6;
  const ink = light ? INK : '#fffaf0';
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  grain(g, W, Hh, 2);
  g.strokeStyle = light ? 'rgba(120,85,55,.4)' : 'rgba(255,248,232,.6)';
  g.lineWidth = 3;
  rrect(g, 34, 34, W - 68, Hh - 68, 20); g.stroke();
  g.fillStyle = yearColor;
  rrect(g, 70, 70, W - 140, 42, 16); g.fill();
  g.fillStyle = '#fff'; g.font = `700 24px ${SANS}`; g.textAlign = 'center';
  g.fillText(`${item.year} 錯題簿`, W / 2, 98);
  g.fillStyle = ink; g.font = `800 56px ${SANS}`;
  g.fillText(`學號 ${String(item.student_id).padStart(2, '0')}`, W / 2, Hh * 0.42);
  g.font = `600 26px ${SANS}`;
  g.fillText(`${item.class} · ${item.pages || '?'} 頁`, W / 2, Hh * 0.55);
  g.globalAlpha = 0.75; g.font = `500 20px ${SANS}`;
  g.fillText('個人錯題書架', W / 2, Hh - 90);
  g.globalAlpha = 1;
  return tex(c);
}

function pageTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#f8efe0'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(180,150,120,${0.15 + (i % 3) * 0.05})`;
    g.fillRect(0, 8 + i * 13, 64, 1);
  }
  return tex(c);
}

export function makeBookMesh(item, yearColor) {
  const dims = bookDims(item);
  const { t, h, d } = dims;
  const spine = spineTexture(item, dims, yearColor);
  const cover = coverTexture(item, dims, yearColor);
  const pages = pageTexture();
  const mats = [
    new THREE.MeshStandardMaterial({ map: spine, roughness: 0.85 }), // +x spine facing out when rotated
    new THREE.MeshStandardMaterial({ color: shade(clothOf(item), -0.15), roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#f3e6d3', roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: '#e8d7c0', roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: pages, roughness: 1 }),
  ];
  // BoxGeometry faces: +x -x +y -y +z -z. We orient book so thickness is along Z (shelf row), height Y, depth X into shelf.
  const mesh = new THREE.Mesh(rgeo(d, h, t, 0.008), mats);
  // Remap: we want spine on +X (toward aisle). So thickness along Z, depth along X.
  // Recreate with correct dims: width(X)=depth of book into shelf, height=Y, depth(Z)=thickness
  mesh.geometry.dispose();
  mesh.geometry = rgeo(d, h, t, 0.008);
  // materials order for BoxGeometry: +x -x +y -y +z -z
  // +x = cover front? Actually for shelf books with spine facing aisle (-wait SHELF_FRONT is on +X wall, spines face -X toward aisle)
  // Reference places books with spine toward aisle. Shelf is on +X wall, so spine faces -X (negative X).
  // So -x face should be spine. BoxGeometry: index 1 is -x.
  mesh.material = [
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.85 }), // +x into shelf back
    new THREE.MeshStandardMaterial({ map: spine, roughness: 0.85 }), // -x spine to aisle
    new THREE.MeshStandardMaterial({ color: '#f3e6d3', roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: '#e8d7c0', roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: pages, roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: pages, roughness: 1 }),
  ];
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { item, dims, id: bookId(item) };
  return mesh;
}

/** Place books for one year on the feature bay. Returns meshes. */
export function placeYearBooks(items, yearColor, parent) {
  const list = [...items].sort((a, b) => a.student_id.localeCompare(b.student_id));
  // Eye-level first (hyeok: row 2, then 1). Cat sits on row 3; avoid row 4 so shelfPose sees spines.
  // Fill order prefers mid shelves; only spill to 0/4 when a year is huge.
  let rows;
  if (list.length <= 4) rows = [2];
  else if (list.length <= 7) rows = [2, 1];
  else if (list.length <= 24) rows = [2, 1, 3];
  else if (list.length <= 40) rows = [2, 1, 3, 0];
  else rows = [2, 1, 3, 0, 4];

  const meshes = [];
  const gap = 0.012;
  const per = Math.max(1, Math.ceil(list.length / rows.length));

  const placeOnRow = (slice, shelfRow) => {
    if (!slice.length) return;
    const y = rowY(shelfRow) + 0.01;
    const z0 = FEAT_Z;
    const totalT = slice.reduce((s, m) => s + m.userData.dims.t, 0) + gap * Math.max(0, slice.length - 1);
    let z = -totalT / 2;
    for (const m of slice) {
      const { t, h, d } = m.userData.dims;
      m.position.set(SHELF_FRONT - d / 2 - 0.01, y + h / 2, z0 + z + t / 2);
      parent.add(m);
      meshes.push(m);
      z += t + gap;
    }
  };

  const made = list.map((item) => makeBookMesh(item, yearColor));
  rows.forEach((r, i) => placeOnRow(made.slice(i * per, (i + 1) * per), r));
  return meshes;
}

export function pdfUrl(item) {
  // catalog path like 6A/01/2012.pdf → served under /library/
  return `library/${item.path}`;
}

export function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
