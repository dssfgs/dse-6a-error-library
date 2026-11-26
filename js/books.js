import * as THREE from 'three';
import {
  SHELF_FRONT, rowY, rgeo, yearBayZ, FEAT_Z,
  isYearKey, compareYearKeys, yearShortName, yearDisplayName, yearFloorTitle,
} from './world.js';
export const RIGHT_SHELF_Z = FEAT_Z;

/** Class-median representative grade per exam year (same year → same colour for all). */
export const YEAR_GRADES = {
  '2012': '3',
  '2013': '4',
  '2014': '5',
  '2018': null, // not enough data
  '2022': '4',
  '2023': '4',
  '2024': '4',
  '2025': '4',
  '2026': '4',
};

export const LEVEL_COLORS = {
  '5**': '#d4af37', // gold
  '5*': '#c5ccd6',  // silver
  '5': '#cd7f32',   // bronze
  '4': '#6fa8c9',   // soft sky teal
  '3': '#9b7bb8',   // soft violet
  '2': '#c4785a',   // warm clay
  '1': '#6b6e76',   // slate
};
export const LEVEL_FALLBACK = '#c9b8a0'; // warm stone / unknown
export const LEVEL_LABELS = {
  '5**': '5**',
  '5*': '5*',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2',
  '1': '1',
};

export function colorForGrade(grade) {
  if (grade == null || grade === '' || grade === 'unknown') return LEVEL_FALLBACK;
  return LEVEL_COLORS[String(grade)] || LEVEL_FALLBACK;
}

export function gradeForYear(year) {
  const key = String(year);
  if (!(key in YEAR_GRADES)) return null;
  return YEAR_GRADES[key];
}

export function colorForYear(year) {
  const g = gradeForYear(year);
  if (g === null && String(year) in YEAR_GRADES) return LEVEL_FALLBACK; // explicitly unknown
  if (g == null) return LEVEL_FALLBACK;
  return colorForGrade(g);
}

/** Optional per-student table (shipped for future use; wall colour uses year medians). */
let gradeTable = null;
export function setGradeTable(data) {
  gradeTable = data && typeof data === 'object' ? data : null;
}
export function getGradeTable() {
  return gradeTable;
}
export function gradeOf(studentId, year) {
  if (!gradeTable) return null;
  const sid = String(studentId).padStart(2, '0');
  const row = gradeTable[sid];
  if (!row?.years) return null;
  const g = row.years[String(year)];
  return g == null ? null : String(g);
}

export const GRADE_RANK = { '5**': 7, '5*': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1 };

export function studentRow(studentId) {
  if (!gradeTable) return null;
  const sid = String(studentId).padStart(2, '0');
  return gradeTable[sid] || null;
}

export function yearDetailOf(studentId, year) {
  const row = studentRow(studentId);
  if (!row) return null;
  const y = String(year);
  return row.yearDetails?.[y] || null;
}

/** Comparable 0–1 score from a yearDetails string, or null if unknown.
 *  Prefers combined marks like (168/179); falls back to PII% / PI% estimates.
 */
export function detailScore(detail) {
  if (detail == null || detail === '') return null;
  const s = String(detail);
  const frac = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (frac) {
    const den = Number(frac[2]);
    if (den > 0) return Number(frac[1]) / den;
  }
  const pii = s.match(/PII\s*(\d+(?:\.\d+)?)%/i);
  if (pii) return Number(pii[1]) / 100;
  const pi = s.match(/PI\s*(\d+(?:\.\d+)?)%/i);
  if (pi) return Number(pi[1]) / 100;
  return null;
}

/** Class roster + median + counts for one exam year.
 *  Order: higher grade first, then higher marks within the same grade
 *  (so a 5** with 177 ranks above a 5** with 168). ID is only a last tie-break.
 */
export function yearResults(year) {
  const y = String(year);
  const median = gradeForYear(y);
  const roster = [];
  const counts = {};
  if (gradeTable) {
    for (const [sid, row] of Object.entries(gradeTable)) {
      const g = row?.years?.[y];
      if (g == null || g === '') continue;
      const grade = String(g);
      counts[grade] = (counts[grade] || 0) + 1;
      const id = String(sid).padStart(2, '0');
      const detail = row.yearDetails?.[y] || null;
      roster.push({
        id,
        name: row.name || `#${id}`,
        grade,
        detail,
        score: detailScore(detail),
        pred: row.pred || null,
        mean: row.mean ?? null,
      });
    }
  }
  roster.sort((a, b) => {
    const ra = GRADE_RANK[a.grade] || 0;
    const rb = GRADE_RANK[b.grade] || 0;
    if (rb !== ra) return rb - ra;
    const sa = a.score, sb = b.score;
    if (sa != null && sb != null && sa !== sb) return sb - sa;
    if (sa != null && sb == null) return -1;
    if (sa == null && sb != null) return 1;
    return a.id.localeCompare(b.id);
  });
  return { year: y, median, roster, counts, n: roster.length };
}

/** 'student' = colour books by that item's student year-grade; 'median' = class median. */
let bookColorMode = 'student';
export function setBookColorMode(mode) {
  bookColorMode = mode === 'median' ? 'median' : 'student';
}
export function getBookColorMode() {
  return bookColorMode;
}

export function colorForItem(item) {
  // Student mode (default): whole-book colour = that student's Maths Analysis grade for the year.
  // Teacher / median mode: class-median colour. Plates always use colorForYear separately.
  if (bookColorMode !== 'median' && item?.student_id != null && item?.year != null) {
    const g = gradeOf(item.student_id, item.year);
    if (g) return colorForGrade(g);
  }
  return colorForYear(item?.year);
}

function yearAccent(year) {
  return colorForYear(year);
}

const BASE_YEAR_ORDER = ['2012', '2013', '2014', '2015', '2018', '2021', '2022', '2023', '2024', '2025', '2026', '2026S'];

function floorEntry(year) {
  const y = String(year);
  const title = yearFloorTitle(y);
  const name = yearShortName(y);
  return { key: y, year: y, name, title, color: yearAccent(y) };
}

/** Mutable floor list — rebuilt after catalog/grades load so every dataset year appears. */
export let YEAR_FLOORS = BASE_YEAR_ORDER.map(floorEntry);
export let FLOOR = Object.fromEntries(YEAR_FLOORS.map((f) => [f.key, f]));

/** Collect every year from grades table + catalog items + known YEAR_GRADES. */
export function collectAllYears(catalog, grades) {
  const set = new Set(BASE_YEAR_ORDER);
  for (const y of Object.keys(YEAR_GRADES || {})) set.add(String(y));
  const items = catalog?.items || (Array.isArray(catalog) ? catalog : []);
  for (const it of items) {
    if (it?.year != null && String(it.year).trim()) set.add(String(it.year));
  }
  if (grades && typeof grades === 'object') {
    for (const row of Object.values(grades)) {
      for (const y of Object.keys(row?.years || {})) set.add(String(y));
      for (const y of Object.keys(row?.yearDetails || {})) set.add(String(y));
    }
  }
  return [...set].filter((y) => isYearKey(y)).sort(compareYearKeys);
}

/** Rebuild YEAR_FLOORS / FLOOR so the left 總表 + floor sheet list every year. */
export function rebuildYearFloors(years) {
  const list = (years && years.length ? years : BASE_YEAR_ORDER).map(String);
  const uniq = [...new Set(list)].filter((y) => isYearKey(y)).sort(compareYearKeys);
  YEAR_FLOORS.length = 0;
  for (const y of uniq) YEAR_FLOORS.push(floorEntry(y));
  FLOOR = Object.fromEntries(YEAR_FLOORS.map((f) => [f.key, f]));
  return YEAR_FLOORS;
}

const CLOTH_FALLBACK = ['#2f5b55', '#c9744f', '#e2b85c', '#6b3d5a', '#7d9a6a', '#2f3e63', '#efe0c2', '#a44a3f',
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
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function shade(hex, k) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
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
  // Chunkier hallway targets. Height stays inside one shelf row (rowH ≈ 0.712, clear ≈ 0.65).
  return {
    t: Math.min(0.20, Math.max(0.14, 0.14 + Math.min(pages, 16) * 0.002 + ((h0 >>> 2) % 3) * 0.012)),
    h: 0.58 + ((h0 >>> 4) % 4) * 0.016, // 0.58–0.628
    d: 0.36 + ((h0 >>> 6) % 3) * 0.03,  // 0.36–0.42; cabinet depth 0.48
  };
}

/** Whole-book cloth colour = class-median grade colour for that year. */
const clothOf = (item) => colorForItem(item) || CLOTH_FALLBACK[hash(bookId(item)) % CLOTH_FALLBACK.length];

function spineTexture(item, dims, yearColor) {
  const W = 160;
  const H = Math.round((W * dims.h) / dims.t);
  const [c, g] = canvas(W, H);
  const bg = clothOf(item);
  const light = lum(bg) > 0.55;
  const ink = light ? INK : '#fffaf0';
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  grain(g, W, H, 2.5);

  // Accent band at top (same grade colour — subtle darker stripe).
  g.fillStyle = shade(yearColor, -0.18);
  g.fillRect(0, 0, W, 28);

  const footH = 96;
  const footY = H - footH - 14;
  g.fillStyle = light ? 'rgba(120,85,55,.45)' : 'rgba(255,248,232,.75)';
  rrect(g, 16, 40, W - 32, 5, 2); g.fill();
  rrect(g, 16, footY - 16, W - 32, 5, 2); g.fill();

  const yearGlyph = yearShortName(item.year); // 「校本」 for 2026S, never "2026S"
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const span = footY - 56;
  const step = span / Math.max(1, yearGlyph.length);
  const glyphPx = yearGlyph.length <= 2 ? 110 : 96;
  g.font = `900 ${glyphPx}px ${SANS}`;
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.lineWidth = yearGlyph.length <= 2 ? 10 : 8;
  g.strokeStyle = light ? 'rgba(255,250,240,.92)' : 'rgba(32,22,16,.82)';
  g.fillStyle = ink;
  let y = 56 + step / 2;
  [...yearGlyph].forEach((ch) => {
    g.strokeText(ch, W / 2, y);
    g.fillText(ch, W / 2, y);
    y += step;
  });

  g.fillStyle = '#fffaf0';
  rrect(g, 10, footY, W - 20, footH, 12); g.fill();
  g.save(); rrect(g, 10, footY, W - 20, footH, 12); g.clip();
  g.fillStyle = yearColor; g.fillRect(10, footY, W - 20, 14);
  g.restore();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const sid = String(item.student_id).padStart(2, '0');
  g.font = `800 28px ${SANS}`; g.fillText(`學號 ${sid}`, W / 2, footY + 42);
  g.font = `700 20px ${SANS}`; g.fillText(item.class, W / 2, footY + 68);
  const grade = gradeOf(item.student_id, item.year) || gradeForYear(item.year);
  const gradeTxt = grade ? `級 ${LEVEL_LABELS[grade] || grade}` : `${item.pages || '?'}頁`;
  g.font = `600 18px ${SANS}`; g.fillText(gradeTxt, W / 2, footY + 88);

  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(90,60,40,.18)');
  grd.addColorStop(0.22, 'rgba(90,60,40,0)');
  grd.addColorStop(0.78, 'rgba(90,60,40,0)');
  grd.addColorStop(1, 'rgba(90,60,40,.18)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  return tex(c);
}

/** Floating bay plaque: year + big class-median grade (readable a few metres away). */
function perfPlateTexture(year, yearColor) {
  const W = 640, H = 360;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(32, 26, 22, 0.88)';
  rrect(g, 12, 12, W - 24, H - 24, 36); g.fill();
  g.fillStyle = yearColor;
  rrect(g, 12, 12, W - 24, 54, [36, 36, 0, 0]); g.fill();
  g.fillStyle = '#fffaf0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const plateYear = yearDisplayName(year);
  g.font = `800 ${plateYear.length > 6 ? 28 : 36}px ${SANS}`;
  g.fillText(plateYear, W / 2, 40);

  const grade = gradeForYear(year);
  const gradeTxt = grade ? (LEVEL_LABELS[grade] || grade) : '—';
  g.fillStyle = yearColor;
  g.font = `900 ${gradeTxt.length >= 3 ? 130 : 168}px ${SANS}`;
  g.fillText(gradeTxt, W / 2, H * 0.52);

  g.fillStyle = '#fffaf0';
  g.font = `700 42px ${SANS}`;
  g.fillText(grade ? '班中位' : '班中位未定', W / 2, H - 58);

  const t = tex(c);
  t.premultiplyAlpha = true;
  return t;
}

function makePerfPlate(year, yearColor) {
  const map = perfPlateTexture(year, yearColor);
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.44), mat);
  mesh.userData.perfPlate = true;
  mesh.userData.year = String(year);
  return mesh;
}

/** @deprecated kept for callers; now a performance plate. */
function makeYearTag(year, yearColor) {
  return makePerfPlate(year, yearColor);
}

function coverTexture(item, dims, yearColor) {
  const W = 512, Hh = Math.round((W * dims.h) / dims.d);
  const [c, g] = canvas(W, Hh);
  const bg = clothOf(item);
  const light = lum(bg) > 0.55;
  const ink = light ? INK : '#fffaf0';
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  grain(g, W, Hh, 2);
  g.strokeStyle = light ? 'rgba(120,85,55,.4)' : 'rgba(255,248,232,.6)';
  g.lineWidth = 3;
  rrect(g, 34, 34, W - 68, Hh - 68, 20); g.stroke();
  g.fillStyle = yearColor;
  rrect(g, 56, 56, W - 112, 78, 20); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center';
  const coverYear = yearDisplayName(item.year);
  g.font = `900 ${coverYear.length > 6 ? 36 : 52}px ${SANS}`;
  g.fillText(coverYear, W / 2, 108);
  const grade = gradeOf(item.student_id, item.year) || gradeForYear(item.year);
  g.font = `700 26px ${SANS}`;
  g.fillText(grade ? `錯題簿 · ${LEVEL_LABELS[grade] || grade}` : '錯題簿', W / 2, 140);
  g.fillStyle = ink; g.font = `800 56px ${SANS}`;
  g.fillText(`學號 ${String(item.student_id).padStart(2, '0')}`, W / 2, Hh * 0.42);
  g.font = `600 26px ${SANS}`;
  g.fillText(`${item.class} · ${item.pages || '?'} 頁`, W / 2, Hh * 0.55);
  g.globalAlpha = 0.75; g.font = `500 20px ${SANS}`;
  g.fillText('個人錯題書架', W / 2, Hh - 90);
  g.globalAlpha = 1;
  return tex(c);
}

/** Page-edge texture tinted to grade colour so hallway silhouette reads from afar. */
function pageTexture(baseColor) {
  const [c, g] = canvas(64, 256);
  const bg = shade(baseColor, 0.28); // lighter tint of same hue
  g.fillStyle = bg; g.fillRect(0, 0, 64, 256);
  const dark = shade(baseColor, -0.22);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = dark;
    g.globalAlpha = 0.18 + (i % 3) * 0.06;
    g.fillRect(0, 8 + i * 13, 64, 1);
  }
  g.globalAlpha = 1;
  return tex(c);
}

export function makeBookMesh(item, yearColor) {
  const dims = bookDims(item);
  const { t, h, d } = dims;
  const accent = yearColor || colorForItem(item);
  const body = clothOf(item) || accent; // whole-book silhouette = grade colour
  const spine = spineTexture(item, dims, accent);
  const cover = coverTexture(item, dims, accent);
  const pages = pageTexture(body);
  // BoxGeometry faces: +x -x +y -y +z -z. Shelf on +X wall → spine on -x toward aisle.
  // Top/bottom + page edges also grade-tinted so the colour blob reads from far down the hall.
  const mesh = new THREE.Mesh(rgeo(d, h, t, 0.008), [
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: spine, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: shade(body, 0.12), roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: shade(body, -0.08), roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: pages, roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: pages, roughness: 1 }),
  ]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { item, dims, id: bookId(item), gradeColor: accent };
  // Invisible larger hit volume so near-miss clicks still count.
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(d + 0.1, h + 0.12, Math.max(t * 2.4, t + 0.16)),
    new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.userData.hitProxy = true;
  mesh.add(hit);
  return mesh;
}

/**
 * Right corridor wall: one coloured book per year at that year's bay.
 * Left wall 總表 (world.board) lists years; tap book → PDF.
 */
export function placeWallBooks(items, parent) {
  const meshes = [];
  const byYear = Object.fromEntries(
    [...items].map((it) => [String(it.year), it]),
  );
  for (const floor of YEAR_FLOORS) {
    const year = String(floor.year);
    const item = byYear[year];
    if (!item) continue;
    const z0 = yearBayZ(year);
    const m = makeBookMesh(item, colorForItem(item));
    const { h, d } = m.userData.dims;
    const row = 1 + (hash(year) % 3);
    const y = rowY(row) + 0.01;
    const proud = 0.07; // spine sits slightly proud of the cabinet front
    m.position.set(SHELF_FRONT - proud + d / 2, y + h / 2, z0);
    m.userData.bayZ = z0;
    m.userData.year = year;
    parent.add(m);
    meshes.push(m);
  }
  return meshes;
}

/** @deprecated alias */
export function placeYearBooks(items, yearColor, parent) {
  return placeWallBooks(items, parent);
}

export function pdfUrl(item) {
  return `library/${item.path}`;
}

export function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
