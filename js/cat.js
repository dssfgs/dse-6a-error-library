import * as THREE from 'three';

// 길잡이 검은 고양이: 카툰 셰이딩 + 외곽선. 걷기·돌아보기·앉기·뛰어오르기
function toonGradient() {
  const t = new THREE.DataTexture(new Uint8Array([40, 95, 165]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
const lerpAngle = (a, b, k) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * k;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ---------- 얼굴: 반짝이는 하얀 렌즈 동그란 안경(크림색 테·다리) + ω 입 (코는 그리지 않는다) ---------- */
const EYE_X = 0.045, EYE_Y = 0.012;
const MUZZLE = { c: [0, -0.035, -0.07], r: [0.06, 0.0375, 0.05] }; // 주둥이 타원체
const LENS = { r: 0.038, y: EYE_Y + 0.004, z: -0.13 };
const CREAM = new THREE.MeshBasicMaterial({ color: '#f6e2b0' });

// 타원체 앞면에 (x, y) 점들을 올려 선을 긋는다 (끝은 둥글게)
function surfaceLine(parent, pts, ell, mat, radius = 0.003, lift = 0.0022) {
  const [cx, cy, cz] = ell.c, [rx, ry, rz] = ell.r;
  const v = pts.map(([x, y]) => new THREE.Vector3(x, y, cz - rz * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2)) - lift));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v, false, 'centripetal'), 64, radius, 8), mat));
  [v[0], v[v.length - 1]].forEach((p) => { const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), mat); cap.position.copy(p); g.add(cap); });
  parent.add(g);
  return g;
}
const arc = (cx, cy, w, h, a0, a1, n = 20) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + w * Math.cos(a), cy + h * Math.sin(a)]; });

// 안경 렌즈 그림: 하얀(빛번짐이 안 나는 밝기) 바탕에 반사 사선 둘. shut: 감은 눈 선 ‿ 을 렌즈 위에
function lensTexture(shut) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(128, 128, 126, 0, 7); g.clip();
  const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#e6e4dc'); gr.addColorStop(1, '#c9d4de');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#f4f6f8'; g.lineCap = 'round';
  g.lineWidth = 22; g.beginPath(); g.moveTo(70, 150); g.lineTo(150, 70); g.stroke();
  g.lineWidth = 11; g.beginPath(); g.moveTo(110, 178); g.lineTo(178, 110); g.stroke();
  if (shut) { g.strokeStyle = '#2a2226'; g.lineWidth = 14; g.beginPath(); g.arc(128, 112, 46, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 눈 감기 정도(0 뜸 ~ 1 감음)를 받는 함수를 돌려준다.
// 하얀 렌즈가 눈을 가리므로 눈은 따로 그리지 않고(비스듬히 볼 때 렌즈 밖으로 삐져나오지 않게),
// 깜빡이거나 쓰다듬어 감을 땐 렌즈 그림을 감은 눈 선이 있는 쪽으로 바꾼다
function drawFace(head, fur) {
  const basic = (o) => new THREE.MeshBasicMaterial(o);
  const open = basic({ map: lensTexture(false) }), shut = basic({ map: lensTexture(true) });
  const frame = basic({ color: '#efe9dc' }), bridgeMat = basic({ color: '#ece8de' });
  const { r, y, z } = LENS;
  const lenses = [-1, 1].map((sd) => {
    // 머리 곡면을 따라 바깥으로 살짝 돌리고, 원판 앞면이 얼굴 앞(-z)을 보게 뒤집는다
    const p = new THREE.Group(); p.position.set(sd * EYE_X, y, z); p.rotation.y = Math.PI - sd * 0.25; head.add(p);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 40), open); p.add(lens);
    p.add(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.075, 8, 40), frame));
    return lens;
  });
  // 두 알을 잇는 다리: 끝은 렌즈 안쪽(렌즈 뒤에 숨음)에서 시작해 낮은 아치로
  const bx = EYE_X - r * 0.8, by = y + 0.01;
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-bx, by, z + 0.003), V(0, by + 0.005, z - 0.002), V(bx, by, z + 0.003)]), 24, 0.0072, 8), bridgeMat));
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), fur);
  muzzle.position.set(...MUZZLE.c); muzzle.scale.set(1.2, 0.75, 1); muzzle.castShadow = true; head.add(muzzle);
  // ω 입: 코 바로 아래 크림색 ‿ 두 개
  [-1, 1].forEach((sd) => surfaceLine(head, arc(sd * 0.0085, -0.031, 0.0085, 0.008, Math.PI, Math.PI * 2, 16), MUZZLE, CREAM, 0.0024, 0.0015));
  return (k) => { const m = k >= 0.5 ? shut : open; lenses.forEach((l) => { l.material = m; }); };
}

// 콩 뛰기: 웅크림 → 뜀(늘었다 줄었다) → 착지 눌림. [시각(초), 세로 비율]
const HOP_KEYS = [[0, 1], [0.1, 0.93], [0.17, 1.05], [0.26, 1], [0.36, 1.03], [0.42, 1], [0.48, 0.94], [0.55, 1]];
const HOP_AIR = [0.1, 0.42], HOP_HEIGHT = 0.08, HOP_END = 0.55;
function hopPose(h) {
  let i = 1;
  while (i < HOP_KEYS.length - 1 && h > HOP_KEYS[i][0]) i++;
  const [t0, s0] = HOP_KEYS[i - 1], [t1, s1] = HOP_KEYS[i];
  const u = Math.min(1, Math.max(0, (h - t0) / (t1 - t0)));
  const a = (h - HOP_AIR[0]) / (HOP_AIR[1] - HOP_AIR[0]);
  return [a > 0 && a < 1 ? 4 * a * (1 - a) * HOP_HEIGHT : 0, s0 + (s1 - s0) * u * u * (3 - 2 * u)];
}

function darkenHex(hex, factor = 0.38) {
  const raw = String(hex || '#1e1a21').replace('#', '');
  const n = parseInt(raw.slice(0, 6), 16);
  if (Number.isNaN(n)) return 0x120d12;
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

export const DEFAULT_FUR = '#1e1a21';

export function createCat(scene, still = false, furHex = DEFAULT_FUR) {
  const grad = toonGradient();
  const startFur = furHex || DEFAULT_FUR;
  const fur = new THREE.MeshToonMaterial({ color: startFur, gradientMap: grad });
  const line = new THREE.MeshBasicMaterial({ color: darkenHex(startFur), side: THREE.BackSide });
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig); // 통통 튀는 반응은 rig에만
  const add = (geo, mat, x, y, z, parent, outline = true, s = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(...s); m.rotation.set(...rot); m.castShadow = true; parent.add(m);
    if (outline) { const o = new THREE.Mesh(geo, line); o.position.copy(m.position); o.rotation.copy(m.rotation); o.scale.set(s[0] * 1.07, s[1] * 1.07, s[2] * 1.07); parent.add(o); }
    return m;
  };
  // 몸통은 앉을 때 앞이 들리도록 피벗 그룹에
  const body = new THREE.Group(); body.position.set(0, 0.21, 0.02); rig.add(body);
  add(new THREE.CapsuleGeometry(0.115, 0.24, 8, 16), fur, 0, 0, -0.02, body, true, [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.12, 20, 16), fur, 0, 0.04, -0.17, body, true, [0.95, 1.05, 1]);
  // 다리: 어깨·엉덩이에서 흔들리는 피벗
  const legs = [];
  [[-0.07, -0.15], [0.07, -0.15], [-0.07, 0.14], [0.07, 0.14]].forEach(([x, z], i) => {
    const pv = new THREE.Group(); pv.position.set(x, 0.17, z); rig.add(pv);
    add(new THREE.CapsuleGeometry(0.032, 0.12, 6, 10), fur, 0, -0.085, 0, pv);
    legs.push(pv);
  });
  // 머리
  const head = new THREE.Group(); head.position.set(-0.01, 0.38, -0.2); rig.add(head);
  add(new THREE.SphereGeometry(0.105, 24, 18), fur, 0, 0, 0, head, true, [1.12, 0.95, 1]);
  const ears = [];
  [-1, 1].forEach((sd) => {
    // 귀: 겉·외곽선·속귀를 한 피벗에 묶어서 귀를 눕힐 때 같이 돈다.
    // 회전 순서 ZYX: 사각뿔 면을 앞으로 돌린 뒤 머리 기준으로 옆으로 눕혀야 두 귀가 대칭으로 눕는다
    const ear = new THREE.Group(); ear.position.set(sd * 0.062, 0.1, 0); ear.rotation.order = 'ZYX'; ear.rotation.set(0, Math.PI / 4, sd * -0.3); head.add(ear);
    add(new THREE.ConeGeometry(0.045, 0.09, 4), fur, 0, 0, 0, ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 4), new THREE.MeshToonMaterial({ color: '#c77b84', gradientMap: grad }));
    inner.position.set(0, -0.007, -0.012).applyQuaternion(ear.quaternion.clone().invert()); ear.add(inner);
    ears.push(ear);
  });
  const shutEyes = drawFace(head, fur);
  // 목걸이: 턱 밑에 딱 맞는 주황 고리(앞이 살짝 내려가 정면에서 띠로 보임) + 앞에 작은 금방울.
  // 머리에 붙여서 앉든 서든 고개를 돌리든 늘 턱 밑에 있다
  const collar = new THREE.Group(); collar.position.set(0, -0.094, 0.02); head.add(collar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.012, 8, 28), new THREE.MeshToonMaterial({ color: '#e0745a', gradientMap: grad }));
  ring.rotation.x = Math.PI / 2 - 0.35; collar.add(ring);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), new THREE.MeshToonMaterial({ color: '#d9a84a', gradientMap: grad }));
  bell.position.set(0, -0.042, -0.07); collar.add(bell);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0025, 0.004), new THREE.MeshBasicMaterial({ color: '#8a6420' }));
  slit.position.set(0, -0.045, -0.086); collar.add(slit);
  // 꼬리: 얼굴을 가리지 않게 옆으로 세워 끝을 만다
  const tail = new THREE.Group(); tail.position.set(0, 0.25, 0.17); tail.rotation.order = 'YXZ'; rig.add(tail);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.02, 0), new THREE.Vector3(0.08, 0.15, 0.09), new THREE.Vector3(0.17, 0.28, 0.08), new THREE.Vector3(0.24, 0.35, 0), new THREE.Vector3(0.22, 0.38, -0.07)]);
  add(new THREE.TubeGeometry(curve, 30, 0.028, 10), fur, 0, 0, 0, tail, false);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.036, 10), line));
  // 츄르 먹을 때 내미는 분홍 혀 (평소엔 숨김)
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), new THREE.MeshToonMaterial({ color: '#ec8f9c', gradientMap: grad }));
  tongue.scale.set(1, 0.35, 1.5); tongue.position.set(0, -0.07, -0.105); tongue.visible = false; head.add(tongue);
  scene.add(root);

  const cat = {
    root, yaw: 0, yawTarget: 0, look: 1, lookTarget: 1, sit: 0, sitTarget: 0, phase: 0, moving: false,
    path: null, hopState: null, hopT: null, purr: 0, calm: 0, tilt: 0, lick: false,
    furHex: startFur,
    setFur(hex) {
      const h = hex || DEFAULT_FUR;
      this.furHex = h;
      fur.color.set(h);
      line.color.setHex(darkenHex(h));
    },
    get pos() { return root.position; },
    headPos(v) { return head.getWorldPosition(v); },
    mouthPos(v) { return head.localToWorld(v.set(0, -0.065, -0.13)); },
    // 쓰다듬기: 골골 수치가 오를수록 눈을 감고 귀를 옆으로 눕히고 고개를 기울여 살랑인다
    pet(amount) { this.purr = Math.min(1, this.purr + amount); },
    set({ pos, yaw, sit, look }) {
      if (pos) root.position.copy(pos);
      if (yaw != null) { this.yaw = this.yawTarget = yaw; root.rotation.y = yaw; }
      if (sit != null) this.sit = this.sitTarget = sit;
      if (look != null) this.look = this.lookTarget = look;
      this.path = null; this.moving = false;
    },
    // 점들을 지나는 길을 따라 걷는다 (속도 m/s)
    walk(points, speed = 1.1) {
      const pts = points.map((p) => p.clone().setY(0));
      const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3);
      const len = c.getLength();
      this.sitTarget = 0;
      if (still) { this.set({ pos: pts[pts.length - 1] }); const t = c.getTangentAt(1); this.set({ yaw: Math.atan2(-t.x, -t.z) }); return Promise.resolve(); }
      return new Promise((res) => { this.path = { c, len, s: 0, speed, res }; this.moving = true; });
    },
    stop() { if (this.path) { const r = this.path.res; this.path = null; r(); } this.moving = false; },
    face(yaw) { this.yawTarget = yaw; if (still) { this.yaw = yaw; root.rotation.y = yaw; } },
    hop(to, ms = 650) {
      if (still) { root.position.copy(to); return Promise.resolve(); }
      return new Promise((res) => { this.hopState = { from: root.position.clone(), to: to.clone(), t: 0, ms, res }; });
    },
    jiggle() { if (this.hopT == null) this.hopT = 0; }, // 뛰는 중에 또 눌러도 처음부터 다시 뛰지 않는다
    update(dt, t) {
      // 길 따라가기
      if (this.path) {
        const p = this.path;
        p.s = Math.min(p.len, p.s + p.speed * dt);
        const u = p.s / p.len;
        root.position.copy(p.c.getPointAt(u));
        const tg = p.c.getTangentAt(Math.min(u, 0.999));
        this.yawTarget = Math.atan2(-tg.x, -tg.z);
        this.phase += (p.speed * dt) / 0.16;
        if (p.s >= p.len) { this.path = null; this.moving = false; p.res(); }
      }
      // 뛰어오르기 (포물선)
      if (this.hopState) {
        const h = this.hopState;
        h.t = Math.min(1, h.t + (dt * 1000) / h.ms);
        const e = ease(h.t);
        root.position.lerpVectors(h.from, h.to, e);
        root.position.y += Math.sin(h.t * Math.PI) * (0.35 + Math.abs(h.to.y - h.from.y) * 0.25);
        if (h.t >= 1) { this.hopState = null; h.res(); }
      }
      const k = 1 - Math.exp(-dt * 8);
      this.yaw = lerpAngle(this.yaw, this.yawTarget, k);
      root.rotation.y = this.yaw;
      this.look += ((this.moving ? 0 : this.lookTarget) - this.look) * (1 - Math.exp(-dt * 4));
      this.sit += (this.sitTarget - this.sit) * (1 - Math.exp(-dt * 6));
      const walking = this.moving || this.hopState;
      // 다리: 대각선끼리 같이
      const sw = this.moving ? Math.sin(this.phase) * 0.55 : 0;
      legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
      // 앉기: 앞이 들리고 뒷다리를 접는다
      body.rotation.x = 0.42 * this.sit;
      body.position.set(0, 0.21 - 0.04 * this.sit + (this.moving ? Math.abs(Math.sin(this.phase)) * 0.012 : 0), 0.02 + 0.03 * this.sit);
      legs[2].rotation.x += -1.25 * this.sit; legs[3].rotation.x += -1.25 * this.sit;
      legs[2].position.y = legs[3].position.y = 0.17 - 0.05 * this.sit;
      head.position.set(-0.01, 0.38 + 0.07 * this.sit, -0.2 + 0.03 * this.sit);
      // 돌아보기 + 갸웃
      head.rotation.set(-0.12 + (walking ? 0.1 : 0), Math.PI * 0.88 * this.look, 0.1 * this.look + (still ? 0 : Math.sin(t * 0.7) * 0.05));
      // 앉으면 꼬리를 바닥에 눕혀 옆으로 감는다 (앞에서 보면 손 든 것처럼 보이지 않게)
      tail.rotation.z = Math.sin(t * (this.moving ? 3.2 : 1.4)) * (this.moving ? 0.2 : 0.12) * (1 - 0.6 * this.sit);
      tail.rotation.x = 1.45 * this.sit; tail.rotation.y = 1.0 * this.sit;
      tail.position.set(0, 0.25 - 0.19 * this.sit, 0.17 + 0.02 * this.sit);
      // 골골 수치를 바로 쓰지 않고 calm이 따라가게 해서 표정이 0.3초쯤에 걸쳐 바뀐다
      const pr = Math.min(1, this.purr * 2.5); // 조금만 쓰다듬어도 눈부터 감긴다
      this.calm += (pr - this.calm) * (1 - Math.exp(-dt * 9));
      const calm = this.calm;
      const blink = !still && (t % 4.2) < 0.12;
      const twitch = !still && (t % 6.5) < 0.15 ? 0.25 : 0;
      shutEyes(Math.max(blink ? 1 : 0, calm));
      if (!still || calm > 0.001) ears.forEach((e, i) => { e.rotation.z = (i ? -0.3 : 0.3) + twitch + (i ? -0.4 : 0.4) * calm; }); // 기분 좋을 땐 살짝만 (확 눕히면 화난 귀)
      tail.rotation.z += Math.sin(t * 5) * 0.2 * calm;
      if (this.purr > 0) this.purr = Math.max(0, this.purr - dt * 0.35);
      // 콩 뛰기: 몸은 발끝을 기준으로 눌렸다 늘어나고(부피는 그대로), 머리는 모양을 지킨 채 몸 위에 얹혀 간다
      let hy = 0, sy = 1;
      if (this.hopT != null) {
        this.hopT += dt;
        if (this.hopT >= HOP_END) this.hopT = null;
        else [hy, sy] = hopPose(this.hopT);
      }
      rig.position.y = hy;
      rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      head.scale.set(Math.sqrt(sy), 1 / sy, Math.sqrt(sy));
      head.rotation.x += (1 - sy) * 0.8; // 눌릴 땐 살짝 끄덕, 늘어날 땐 살짝 듦
      // 고개 기울이기는 뛰는 동안 멈췄다가 착지한 뒤 천천히 (몸은 위로 뛰는데 머리만 옆으로 꺾이지 않게)
      this.tilt += ((this.hopT != null ? 0 : calm) - this.tilt) * (1 - Math.exp(-dt * (this.hopT != null ? 12 : 5)));
      head.rotation.z += (0.3 + Math.sin(t * 2.6) * 0.08) * this.tilt; // 기울인 채 천천히 살랑
      // 츄르 핥기: 혀가 날름날름 나왔다 들어간다
      tongue.visible = this.lick;
      if (this.lick) { const l = still ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * 9)); tongue.scale.z = 1.5 * l; tongue.position.z = -0.105 - 0.012 * l; }
    },
  };
  return cat;
}
