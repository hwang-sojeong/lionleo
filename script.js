/* ── 리온레오 건강수첩 ────────────────────────────
   기록(글자)은 localStorage, 사진은 IndexedDB에 저장한다.
   사진은 저장 전 4:3으로 자르고 캔버스로 축소·압축한다.
   ───────────────────────────────────────────────── */

const LS_CATS = 'lionleo.cats';
const LS_RECS = 'lionleo.records';
const LS_LISTS = 'lionleo.lists';   // 브랜드·제품·간식 이름 모음 (쓸수록 쌓임)

const PHOTO_MAX_PX = 1000;
const PHOTO_QUALITY = 0.75;
const PHOTO_RATIO = 4 / 3;

const DEFAULT_CATS = [
  { id: 'c1', name: '리온', emoji: '🐯' },
  { id: 'c2', name: '레오', emoji: '🦁' },
];

/* 이상 신호일수록 tone이 높다: ok < warn < alert */
const POOP_SHAPE = [
  { v: 'normal', t: '정상', tone: 'ok' },
  { v: 'soft', t: '무름', tone: 'warn' },
  { v: 'diarrhea', t: '설사', tone: 'alert' },
  { v: 'hard', t: '변비', tone: 'warn' },
];
const POOP_COLOR = [
  { v: 'brown', t: '갈색', tone: 'ok' },
  { v: 'black', t: '검정', tone: 'alert' },
  { v: 'red', t: '붉음', tone: 'alert' },
  { v: 'yellow', t: '노랑', tone: 'warn' },
  { v: 'pale', t: '연함', tone: 'warn' },
];
const POOP_AMOUNT = [
  { v: 'lots', t: '많음', tone: '' },
  { v: 'normal', t: '보통', tone: '' },
  { v: 'little', t: '적음', tone: '' },
];
/* 크기는 그림으로 비교해 고른다 — icons/poop/ 의 파일을 바꾸면 그림이 바뀐다 */
const POOP_SIZE = [
  { v: 'pellet', t: '염소똥', img: 'icons/poop/pellet.svg', tone: 'warn' },
  { v: 'short', t: '짧음', img: 'icons/poop/short.svg', tone: '' },
  { v: 'normal', t: '보통', img: 'icons/poop/normal.svg', tone: '' },
  { v: 'long', t: '긺', img: 'icons/poop/long.svg', tone: '' },
];
const POOP_SMELL = [
  { v: 'normal', t: '보통', tone: '' },
  { v: 'bad', t: '심함', tone: 'warn' },
];
const MEAL_KIND = [
  { v: 'dry', t: '건식' },
  { v: 'wet', t: '습식' },
  { v: 'mix', t: '혼합' },   // 옛 기록 표시용 — 이제는 사료를 여러 개 넣어 '혼합'을 나타낸다
];
/* 사료 한 종류에 고르는 값 (혼합은 사료를 여러 개 추가해서 만든다) */
const ITEM_KIND = MEAL_KIND.filter(k => k.v !== 'mix');
const LEVEL = [
  { v: 'lots', t: '많이', tone: 'ok' },
  { v: 'normal', t: '보통', tone: 'ok' },
  { v: 'little', t: '적게', tone: 'warn' },
  { v: 'none', t: '안 먹음', tone: 'alert' },
];
const EMOJI_SET = [
  '🐯','🦁','🐆','🐱','😺','😸','😻','🐈','🐈‍⬛','🐅',
  '🐰','🐹','🐭','🐶','🦊','🐻','🐼','🐨','🐨','🦝',
  '⭐','🌙','☀️','🌸','🌼','🍀','🔥','💧','🍑','🍊',
];

/* ── 상태 ── */
let records = migrate(load(LS_RECS, {}));
/* 처음 쓰는 사람은 빈 상태로 시작해 직접 등록한다.
   단, 예전 기본값(리온·레오)으로 기록만 쌓아온 기존 사용자는 그대로 지켜준다. */
let cats = load(LS_CATS, null)
  ?? (Object.keys(records).length ? structuredClone(DEFAULT_CATS) : []);
let lists = load(LS_LISTS, { brand: [], product: [], treat: [], flavor: [] });
lists.flavor ??= [];   // 예전 목록에 맛 칸이 없을 수 있으니 채운다
let avatars = [];
let viewDate = todayKey();
let calMonth = todayKey().slice(0, 7);   // 사진 달력이 보고 있는 달 (YYYY-MM)
let calCat = cats[0]?.id ?? null;        // 사진 달력에서 보고 있는 아이
let editing = null;
let cropping = null;
let objectUrls = [];
let calUrls = [];

/* ── 저장소 ── */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch { return structuredClone(fallback); }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { toast('저장 공간이 가득 찼어요. 백업 후 오래된 기록을 지워주세요'); return false; }
}

/* 옛 기록을 지금 형식으로 올린다. 이미 올린 기록은 건드리지 않는다.
   v1(하루 한 번) → v2(하루 여러 번) → v3(밥 한 끼에 사료 여러 종류) */
function migrate(recs) {
  let changed = false;
  for (const date of Object.keys(recs)) {
    for (const cid of Object.keys(recs[date])) {
      const r = recs[date][cid];

      // v1 → v2
      if (!r.poops && !r.meals) {
        const old = { ...r };
        r.poops = [];
        r.meals = [];
        r.treats = [];
        if (old.poopShape || old.poopColor) {
          r.poops.push({ t: '', shape: old.poopShape ?? null, color: old.poopColor ?? null,
                         amount: null, size: null, smell: null });
        }
        if (old.food) r.meals.push({ t: '', kind: null, brand: '', product: '', amount: old.food });
        delete r.poopShape; delete r.poopColor; delete r.food;
        changed = true;
      }

      // v2 → v3: 밥의 사료 한 종류(kind·brand·product)를 items 목록으로 옮긴다
      for (const m of (r.meals ?? [])) {
        if (m.items) continue;
        m.items = [{ kind: m.kind ?? null, brand: m.brand ?? '', product: m.product ?? '',
                     grams: m.grams ?? null }];
        delete m.kind; delete m.brand; delete m.product;
        changed = true;
      }
    }
  }
  if (changed) save(LS_RECS, recs);
  return recs;
}

/* ── 사진 저장소 (IndexedDB) ── */
const PhotoDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const req = indexedDB.open('lionleo', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = () => { this._db = req.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
  },
  async _tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  get(id) { return this._tx('readonly', s => s.get(id)); },
  put(id, blob) { return this._tx('readwrite', s => s.put(blob, id)); },
  del(id) { return this._tx('readwrite', s => s.delete(id)); },
  keys() { return this._tx('readonly', s => s.getAllKeys()); },
};

/* ── 날짜 ── */
function todayKey() { return toKey(new Date()); }
function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return toKey(new Date(y, m - 1, d + days));
}
function labelDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const week = ['일','월','화','수','목','금','토'][dt.getDay()];
  const t = todayKey();
  if (key === t) return { main: '오늘', sub: `${m}월 ${d}일 (${week})` };
  if (key === shiftDate(t, -1)) return { main: '어제', sub: `${m}월 ${d}일 (${week})` };
  const sameYear = y === new Date().getFullYear();
  return { main: sameYear ? `${m}월 ${d}일 (${week})` : `${y}. ${m}. ${d}. (${week})`, sub: '' };
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ── 기록 접근 ── */
function getRec(date, catId) { return records[date]?.[catId] ?? null; }
function photoId(date, catId) { return `${date}__${catId}`; }
function isEmptyRec(r) {
  if (!r) return true;
  return !(r.poops?.length) && !(r.meals?.length) && !(r.treats?.length)
      && !r.water && !r.weight && !r.note && !r.med && !r.photo;
}
function blankRec() { return { poops: [], meals: [], treats: [] }; }

/* ── 도우미 ── */
const $ = s => document.querySelector(s);
const textOf = (list, v) => list.find(x => x.v === v)?.t ?? '';
const toneOf = (list, v) => list.find(x => x.v === v)?.tone ?? '';
const TONE_RANK = { alert: 3, warn: 2, ok: 1, '': 0 };
const worst = (...tones) => tones.reduce((a, b) => (TONE_RANK[a] >= TONE_RANK[b] ? a : b), '');
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function catIconHtml(cat, cls) {
  return cat.icon
    ? `<img src="icons/avatars/${esc(cat.icon)}" alt="">`
    : esc(cat.emoji ?? '🐱');
}

/* ── 렌더: 패널 ── */
function revokeAll() { objectUrls.forEach(URL.revokeObjectURL); objectUrls = []; }

async function renderPanels() {
  revokeAll();
  const box = $('#panels');
  box.innerHTML = '';

  // 등록된 고양이가 없으면(처음 쓰는 사람) 환영 안내를 보여준다
  if (!cats.length) {
    const w = document.createElement('div');
    w.className = 'card welcome';
    w.innerHTML = `<span class="welcome__emoji">🐱</span>
      <p class="welcome__title">우리 아이를 등록해 주세요</p>
      <p class="welcome__desc">고양이를 추가하면 오늘부터 건강 기록을 시작할 수 있어요.</p>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'primarybtn welcome__btn';
    btn.textContent = '＋ 고양이 추가하기';
    btn.addEventListener('click', openSettings);
    w.append(btn);
    box.append(w);
    return;
  }

  for (const cat of cats) {
    const rec = getRec(viewDate, cat.id);
    const filled = !isEmptyRec(rec);

    const el = document.createElement('button');
    el.className = 'card panel' + (filled ? ' panel--filled' : '');
    el.type = 'button';

    const top = document.createElement('div');
    top.className = 'panel__top';
    top.innerHTML = `<span class="panel__avatar">${catIconHtml(cat)}</span>
                     <span class="panel__name">${esc(cat.name)}</span>`;
    el.append(top);

    if (rec?.photo) {
      const img = document.createElement('img');
      img.className = 'panel__thumb';
      img.alt = `${cat.name} 사진`;
      el.append(img);
      PhotoDB.get(rec.photo).then(blob => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        objectUrls.push(u);
        img.src = u;
      }).catch(() => {});
    } else {
      const ph = document.createElement('div');
      ph.className = 'panel__thumb panel__thumb--empty';
      ph.textContent = '📷';
      el.append(ph);
    }

    if (filled) el.append(buildLog(rec));
    else {
      const em = document.createElement('div');
      em.className = 'panel__empty';
      em.textContent = '아직 기록이 없어요';
      el.append(em);
    }

    const cta = document.createElement('div');
    cta.className = 'panel__cta';
    cta.textContent = filled ? '기록 수정하기 →' : '기록하기 →';
    el.append(cta);

    el.addEventListener('click', () => openSheet(cat.id));
    box.append(el);
  }
}

/* 하루치를 클릭 없이 다 보여주는 요약 — 이 앱의 핵심 */
function buildLog(rec) {
  const log = document.createElement('div');
  log.className = 'log';

  (rec.poops ?? []).forEach(p => {
    const tone = worst(toneOf(POOP_SHAPE, p.shape), toneOf(POOP_COLOR, p.color),
                       toneOf(POOP_SIZE, p.size), toneOf(POOP_SMELL, p.smell));
    const main = [textOf(POOP_SHAPE, p.shape), textOf(POOP_COLOR, p.color)].filter(Boolean).join('·');
    const sub = [textOf(POOP_AMOUNT, p.amount), textOf(POOP_SIZE, p.size),
                 p.smell === 'bad' ? '냄새심함' : ''].filter(Boolean).join('·');
    log.append(logItem('💩', p.t, main || '기록', tone, sub));
  });

  (rec.meals ?? []).forEach(m => {
    const items = m.items ?? [];
    if (items.length) {
      items.forEach((it, idx) => {
        const main = [textOf(MEAL_KIND, it.kind), it.brand, it.product].filter(Boolean).join(' ') || '밥';
        const gram = it.grams ? `${it.grams}g` : '';
        log.append(logItem('🍚', idx === 0 ? m.t : '', main, '', gram));   // 시간은 첫 줄에만
      });
    } else {
      log.append(logItem('🍚', m.t, '밥', ''));
    }
    if (m.amount) log.append(logItem('🍽️', '', textOf(LEVEL, m.amount), toneOf(LEVEL, m.amount)));
  });

  (rec.treats ?? []).forEach(t => {
    const main = [t.name || '간식', t.flavor, t.amount].filter(Boolean).join(' ');
    log.append(logItem('🍬', t.t, main, ''));
  });

  if (rec.water) log.append(logItem('💧', '', textOf(LEVEL, rec.water), toneOf(LEVEL, rec.water)));
  if (rec.weight) log.append(logItem('⚖️', '', `${rec.weight}kg`, ''));

  if (rec.note || rec.med) log.append(Object.assign(document.createElement('div'), { className: 'log__sep' }));
  if (rec.note) log.append(logItem('📝', '', rec.note, '', '', '', true));
  if (rec.med) log.append(logItem('💊', '', rec.med, '', '', '', true));

  return log;
}

function logItem(icon, time, main, tone, sub = '', subTone = '', isNote = false) {
  const d = document.createElement('div');
  d.className = 'log__item';
  const cls = isNote ? 'log__note' : 'log__val' + (tone ? ' log__val--' + tone : '');
  d.innerHTML =
    `<span class="log__icon">${icon}</span>
     <span class="log__body">${time ? `<span class="log__time">${esc(time)}</span>` : ''}<span class="${cls}">${esc(main)}</span>${
       sub ? ` <span class="log__sub${subTone ? ' log__val--' + subTone : ''}">${esc(sub)}</span>` : ''}</span>`;
  return d;
}

/* ── 렌더: 날짜 ── */
function renderDate() {
  const { main, sub } = labelDate(viewDate);
  $('#dateText').textContent = main;
  $('#dateSub').textContent = sub;
  $('#btnNext').disabled = viewDate >= todayKey();

  // 달력의 현재 값·최대(미래 못 고름)를 맞추고, 오늘이 아니면 '오늘로' 버튼을 보인다
  const picker = $('#datePicker');
  picker.max = todayKey();
  picker.value = viewDate;
  $('#datejump').hidden = viewDate === todayKey();
}

/* ── 렌더: 몸무게 차트 ── */
function renderChart() {
  const box = $('#chart');
  const series = cats.map(cat => ({
    cat,
    pts: Object.keys(records).sort()
      .map(d => ({ d, w: Number(records[d]?.[cat.id]?.weight) }))
      .filter(p => p.w > 0).slice(-14),
  })).filter(s => s.pts.length > 0);

  if (series.length === 0) {
    box.innerHTML = '<div class="chart__empty">몸무게를 기록하면 추이가 나타나요</div>';
    $('#chartHint').textContent = '';
    return;
  }

  const all = series.flatMap(s => s.pts.map(p => p.w));
  const maxN = Math.max(...series.map(s => s.pts.length));
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max((hi - lo) * 0.25, 0.15);
  lo -= pad; hi += pad;

  const W = 300, H = 110, PL = 30, PR = 20, PT = 8, PB = 18;
  const x = i => PL + (maxN <= 1 ? (W - PL - PR) / 2 : (i / (maxN - 1)) * (W - PL - PR));
  const y = w => PT + (1 - (w - lo) / (hi - lo)) * (H - PT - PB);
  const colors = ['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--danger)'];

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="몸무게 추이 그래프">`;
  for (let i = 0; i <= 2; i++) {
    const w = lo + ((hi - lo) * i) / 2, yy = y(w);
    svg += `<line x1="${PL}" y1="${yy}" x2="${W-PR}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>
            <text x="${PL-5}" y="${yy+3}" text-anchor="end" font-size="7" fill="var(--text-dim)">${w.toFixed(1)}</text>`;
  }
  series.forEach((s, si) => {
    const c = colors[si % colors.length];
    const off = maxN - s.pts.length;
    if (s.pts.length > 1) {
      svg += `<polyline points="${s.pts.map((p,i) => `${x(i+off)},${y(p.w)}`).join(' ')}"
               fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    s.pts.forEach((p, i) => { svg += `<circle cx="${x(i+off)}" cy="${y(p.w)}" r="2.6" fill="${c}"/>`; });
    const last = s.pts[s.pts.length - 1];
    svg += `<text x="${x(maxN-1)+4}" y="${y(last.w)+2.5}" font-size="7" fill="${c}" font-weight="700">${last.w}</text>`;
  });
  svg += '</svg>';
  box.innerHTML = svg;
  $('#chartHint').textContent = series.map(s => `${s.cat.emoji ?? ''} ${s.pts.at(-1).w}kg`).join('  ');
}

/* ── 렌더: 사진 달력 ──────────────────────────────
   사진 올린 날에 그 사진의 작은 판을 달력 칸에 깔아
   언제 어떤 사진을 찍었는지 한눈에 보이게 한다.
   ───────────────────────────────────────────── */
function calShift(months) {
  const [y, m] = calMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  calMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderCalendar();
}

/* 아이가 둘 이상이면 골라 보는 탭을 그린다 (한 마리면 숨긴다) */
function renderCalCats() {
  const box = $('#calCats');
  box.hidden = cats.length < 2;
  box.innerHTML = '';
  if (cats.length < 2) return;
  cats.forEach(cat => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal__cat';
    b.setAttribute('aria-pressed', String(cat.id === calCat));
    b.innerHTML = `<span class="cal__catface">${catIconHtml(cat)}</span>${esc(cat.name)}`;
    b.addEventListener('click', () => { calCat = cat.id; renderCalendar(); });
    box.append(b);
  });
}

function renderCalendar() {
  if (!cats.some(c => c.id === calCat)) calCat = cats[0]?.id ?? null;   // 지워진 아이면 첫째로
  renderCalCats();
  calUrls.forEach(URL.revokeObjectURL); calUrls = [];
  const grid = $('#calGrid');
  grid.innerHTML = '';

  const sel = cats.find(c => c.id === calCat);
  const [y, m] = calMonth.split('-').map(Number);
  $('#calTitle').textContent = `${y}년 ${m}월`;
  $('#calNext').disabled = calMonth >= todayKey().slice(0, 7);   // 미래 달은 못 감

  const lead = new Date(y, m - 1, 1).getDay();   // 1일의 요일(0=일)
  const days = new Date(y, m, 0).getDate();      // 이 달의 마지막 날짜

  for (let i = 0; i < lead; i++) {
    grid.append(Object.assign(document.createElement('div'), { className: 'cal__cell cal__cell--blank' }));
  }

  let anyPhoto = false, otherAny = false;
  for (let d = 1; d <= days; d++) {
    const key = `${calMonth}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal__cell';
    if (key === todayKey()) cell.classList.add('cal__cell--today');

    const num = document.createElement('span');
    num.className = 'cal__daynum';
    num.textContent = d;
    cell.append(num);

    // 고른 아이의 사진 하나가 칸을 꽉 채운다
    const pid = records[key]?.[calCat]?.photo;
    if (pid) {
      anyPhoto = true;
      cell.classList.add('cal__cell--photo');
      const wrap = document.createElement('div');
      wrap.className = 'cal__photos';
      const img = document.createElement('img');
      img.className = 'cal__photo';
      img.alt = `${sel?.name ?? ''} ${m}월 ${d}일 사진`;
      img.addEventListener('click', () => openPhotoView(pid, `${sel?.name ?? ''} · ${m}월 ${d}일`));
      wrap.append(img);
      cell.append(wrap);
      PhotoDB.get(pid).then(blob => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        calUrls.push(u);
        img.src = u;
      }).catch(() => {});
    }

    // 다른 아이도 이 날 사진이 있으면 점으로 알린다 (탭을 바꿔 보라는 뜻)
    if (cats.some(c => c.id !== calCat && records[key]?.[c.id]?.photo)) {
      otherAny = true;
      cell.append(Object.assign(document.createElement('span'), { className: 'cal__more' }));
    }
    grid.append(cell);
  }

  const parts = [];
  if (anyPhoto) parts.push('사진을 누르면 크게 볼 수 있어요');
  else parts.push(cats.length > 1 ? '이 달엔 이 아이 사진이 없어요' : '이 달엔 올린 사진이 없어요');
  if (otherAny) parts.push('점이 있는 날은 다른 아이 사진이 있어요');
  $('#calHint').textContent = parts.join(' · ');
}

async function openPhotoView(pid, cap) {
  const blob = await PhotoDB.get(pid).catch(() => null);
  if (!blob) return;
  const img = $('#photoViewImg');
  if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
  $('#photoViewCap').textContent = cap;
  $('#photoViewBackdrop').hidden = false;
}
function closePhotoView() {
  const img = $('#photoViewImg');
  if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.removeAttribute('src');
  $('#photoViewBackdrop').hidden = true;
}

function renderAll() { renderDate(); renderPanels(); renderChart(); renderCalendar(); }

/* ── 칩 ── */
function buildChips(mount, list, selected, onPick, pic = false) {
  mount.innerHTML = '';
  list.forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (pic ? ' chip--pic' : '');
    b.innerHTML = pic
      ? `<img src="${opt.img}" alt=""><span class="chip__cap">${esc(opt.t)}</span>`
      : esc(opt.t);
    b.setAttribute('aria-pressed', String(selected === opt.v));
    b.addEventListener('click', () => {
      const next = b.getAttribute('aria-pressed') === 'true' ? null : opt.v;
      onPick(next);
      [...mount.children].forEach(c => c.setAttribute('aria-pressed', String(c === b && next !== null)));
    });
    mount.append(b);
  });
}

/* ── 기록 카드 ── */
function renderEntries() {
  renderPoops();
  renderMeals();
  renderTreats();
}

function entryShell(list, i, onDel) {
  const el = document.createElement('div');
  el.className = 'entry';
  const head = document.createElement('div');
  head.className = 'entry__head';
  const time = document.createElement('input');
  time.type = 'time';
  time.className = 'entry__time';
  time.value = list[i].t || '';
  time.setAttribute('aria-label', '시간');
  time.addEventListener('input', () => list[i].t = time.value);
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'entry__del';
  del.textContent = '✕';
  del.setAttribute('aria-label', '이 기록 지우기');
  del.addEventListener('click', () => { list.splice(i, 1); onDel(); });
  head.append(time, del);
  el.append(head);
  return el;
}

function renderPoops() {
  const box = $('#poopList');
  box.innerHTML = '';
  const list = editing.draft.poops;
  if (!list.length) { box.innerHTML = '<div class="entry__none">응가 기록 없음 — 안 쌌으면 비워두세요</div>'; return; }
  list.forEach((p, i) => {
    const el = entryShell(list, i, renderPoops);
    el.append(sub('굳기'), chipRow(POOP_SHAPE, p.shape, v => p.shape = v));
    el.append(sub('색깔'), chipRow(POOP_COLOR, p.color, v => p.color = v));
    el.append(sub('양'), chipRow(POOP_AMOUNT, p.amount, v => p.amount = v));
    el.append(sub('크기'), chipRow(POOP_SIZE, p.size, v => p.size = v, true));
    el.append(sub('냄새'), chipRow(POOP_SMELL, p.smell, v => p.smell = v));
    box.append(el);
  });
}

function renderMeals() {
  const box = $('#mealList');
  box.innerHTML = '';
  const list = editing.draft.meals;
  if (!list.length) { box.innerHTML = '<div class="entry__none">밥 기록 없음</div>'; return; }
  list.forEach((m, i) => {
    m.items ??= [{ kind: null, brand: '', product: '', grams: '' }];
    const el = entryShell(list, i, renderMeals);

    // 사료 종류 — 혼합이면 여러 개
    const itemsBox = document.createElement('div');
    itemsBox.className = 'fooditems';
    m.items.forEach((it, j) => itemsBox.append(mealItemEl(m, it, j)));
    el.append(sub('사료'), itemsBox);

    const addItem = document.createElement('button');
    addItem.type = 'button';
    addItem.className = 'additem';
    addItem.textContent = '＋ 사료 추가 (혼합)';
    addItem.addEventListener('click', () => {
      const prev = m.items.at(-1);
      m.items.push({ kind: null, brand: prev?.brand ?? '', product: '', grams: '' });
      renderMeals();
    });
    el.append(addItem);

    el.append(sub('얼마나 먹었나'), chipRow(LEVEL, m.amount, v => m.amount = v));
    box.append(el);
  });
}

/* 사료 한 종류 칸: 건식/습식 · 브랜드 · 이름 · 그램 */
function mealItemEl(m, it, j) {
  const wrap = document.createElement('div');
  wrap.className = 'fooditem';

  const head = document.createElement('div');
  head.className = 'fooditem__head';
  head.append(chipRow(ITEM_KIND, it.kind, v => it.kind = v));
  if (m.items.length > 1) {   // 사료가 둘 이상일 때만 지우기 버튼
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fooditem__del';
    del.textContent = '✕';
    del.setAttribute('aria-label', '이 사료 지우기');
    del.addEventListener('click', () => { m.items.splice(j, 1); renderMeals(); });
    head.append(del);
  }
  wrap.append(head);

  const duo = document.createElement('div');
  duo.className = 'duo';
  duo.append(
    textInput('브랜드', it.brand, 'dlBrand', v => it.brand = v),
    textInput('사료 이름', it.product, 'dlProduct', v => it.product = v),
  );
  wrap.append(duo);

  const gram = document.createElement('div');
  gram.className = 'gram';
  const gi = document.createElement('input');
  gi.type = 'number';
  gi.className = 'input input--sm gram__input';
  gi.inputMode = 'decimal';
  gi.min = '0';
  gi.step = '1';
  gi.placeholder = '몇 그램 줬는지 (예: 40)';
  gi.value = it.grams ?? '';
  gi.setAttribute('aria-label', '사료 그램');
  gi.addEventListener('input', () => it.grams = gi.value);
  const unit = document.createElement('span');
  unit.className = 'gram__unit';
  unit.textContent = 'g';
  gram.append(gi, unit);
  wrap.append(gram);

  return wrap;
}

function renderTreats() {
  const box = $('#treatList');
  box.innerHTML = '';
  const list = editing.draft.treats;
  if (!list.length) { box.innerHTML = '<div class="entry__none">간식 기록 없음</div>'; return; }
  list.forEach((t, i) => {
    const el = entryShell(list, i, renderTreats);
    const duo = document.createElement('div');
    duo.className = 'duo';
    duo.append(
      textInput('무엇을 (예: 챠오츄르)', t.name, 'dlTreat', v => t.name = v),
      textInput('맛 (예: 참치)', t.flavor, 'dlFlavor', v => t.flavor = v),
    );
    el.append(duo);
    el.append(textInput('얼마나 (예: 1개)', t.amount, null, v => t.amount = v));
    box.append(el);
  });
}

function sub(text) {
  const s = document.createElement('div');
  s.className = 'sublabel';
  s.textContent = text;
  return s;
}
function chipRow(list, selected, onPick, pic = false) {
  const row = document.createElement('div');
  row.className = 'chips';
  buildChips(row, list, selected, onPick, pic);
  return row;
}
function textInput(placeholder, value, listId, onInput) {
  const i = document.createElement('input');
  i.type = 'text';
  i.className = 'input input--sm';
  i.placeholder = placeholder;
  i.value = value ?? '';
  i.setAttribute('aria-label', placeholder);
  if (listId) i.setAttribute('list', listId);
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

/* 쓸수록 목록이 쌓여 다음부터 골라 쓸 수 있게 한다 */
function renderDatalists() {
  const fill = (id, arr) => {
    $('#' + id).innerHTML = arr.map(v => `<option value="${esc(v)}">`).join('');
  };
  fill('dlBrand', lists.brand);
  fill('dlProduct', lists.product);
  fill('dlTreat', lists.treat);
  fill('dlFlavor', lists.flavor);
}
function rememberList(key, value) {
  const v = (value ?? '').trim();
  if (!v || lists[key].includes(v)) return;
  lists[key].push(v);
  lists[key].sort((a, b) => a.localeCompare(b, 'ko'));
}

/* ── 기록 시트 ── */
async function openSheet(catId) {
  const cat = cats.find(c => c.id === catId);
  const rec = getRec(viewDate, catId);
  const draft = rec ? structuredClone(rec) : blankRec();
  draft.poops ??= []; draft.meals ??= []; draft.treats ??= [];
  editing = { catId, draft, photoBlob: null, photoDirty: false };

  const { main } = labelDate(viewDate);
  $('#sheetTitle').innerHTML = `<span class="panel__avatar">${catIconHtml(cat)}</span> ${esc(cat.name)} · ${esc(main)}`;

  renderEntries();
  buildChips($('#waterLevel'), LEVEL, draft.water, v => draft.water = v);
  const avg = cat.waterAvg;
  $('#waterHint').textContent = avg
    ? `${cat.name}의 평소 하루 물양은 약 ${avg}ml예요. 그만큼이면 ‘보통’, 더 마시면 ‘많이’, 덜 마시면 ‘적게’로 골라주세요.`
    : `‘보통’은 ${cat.name}이(가) 평소 마시는 양이에요. 그보다 많으면 ‘많이’, 적으면 ‘적게’. (설정에서 평소 물양을 정해둘 수 있어요)`;
  $('#weight').value = draft.weight ?? '';
  $('#note').value = draft.note ?? '';
  $('#med').value = draft.med ?? '';
  $('#moreBox').open = !!(draft.weight || draft.note || draft.med);
  $('#btnDelete').hidden = isEmptyRec(rec);

  showPhoto(null);
  if (draft.photo) {
    const blob = await PhotoDB.get(draft.photo).catch(() => null);
    if (blob && editing?.catId === catId) showPhoto(blob);
  }

  $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}

function showPhoto(blob) {
  const img = $('#photoImg');
  if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
  if (blob) {
    img.src = URL.createObjectURL(blob);
    img.hidden = false;
    $('#photoEmpty').hidden = true;
    $('#btnPhotoRemove').hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    $('#photoEmpty').hidden = false;
    $('#btnPhotoRemove').hidden = true;
  }
  $('#photoBox').classList.toggle('photo--empty', !blob);
}

function closeSheet() {
  const img = $('#photoImg');
  if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
  $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
  editing = null;
}

async function saveRecord() {
  if (!editing) return;
  const { catId, draft } = editing;

  const w = parseFloat($('#weight').value);
  draft.weight = Number.isFinite(w) && w > 0 ? w : null;
  draft.note = $('#note').value.trim() || null;
  draft.med = $('#med').value.trim() || null;

  // 아무것도 안 적은 빈 카드는 버린다
  draft.poops = draft.poops.filter(p => p.shape || p.color || p.amount || p.size || p.smell || p.t);

  // 밥: 빈 사료 칸을 지우고 그램을 숫자로 바꾼다. 사료도 없고 먹은 양도 없으면 버린다
  draft.meals.forEach(m => {
    m.items = (m.items ?? []).filter(it =>
      it.kind || it.brand?.trim() || it.product?.trim() || String(it.grams ?? '').trim());
    m.items.forEach(it => {
      it.brand = it.brand?.trim() || '';
      it.product = it.product?.trim() || '';
      const g = parseFloat(it.grams);
      it.grams = Number.isFinite(g) && g > 0 ? g : null;
    });
  });
  draft.meals = draft.meals.filter(m => m.items.length || m.amount);

  draft.treats = draft.treats.filter(t => t.name?.trim() || t.flavor?.trim() || t.amount?.trim() || t.t);

  draft.meals.forEach(m => m.items.forEach(it => { rememberList('brand', it.brand); rememberList('product', it.product); }));
  draft.treats.forEach(t => { rememberList('treat', t.name); rememberList('flavor', t.flavor); });
  save(LS_LISTS, lists);
  renderDatalists();

  const pid = photoId(viewDate, catId);
  try {
    if (editing.photoDirty) {
      if (editing.photoBlob) { await PhotoDB.put(pid, editing.photoBlob); draft.photo = pid; }
      else { await PhotoDB.del(pid); draft.photo = null; }
    }
  } catch {
    toast('사진 저장에 실패했어요. 저장 공간을 확인해주세요');
    return;
  }

  Object.keys(draft).forEach(k => { if (draft[k] == null) delete draft[k]; });

  if (isEmptyRec(draft)) {
    if (records[viewDate]) {
      delete records[viewDate][catId];
      if (!Object.keys(records[viewDate]).length) delete records[viewDate];
    }
  } else {
    records[viewDate] ??= {};
    records[viewDate][catId] = draft;
  }

  if (!save(LS_RECS, records)) return;
  closeSheet();
  renderAll();
  toast('저장했어요');
}

async function deleteRecord() {
  if (!editing) return;
  const cat = cats.find(c => c.id === editing.catId);
  if (!confirm(`${cat.name}의 이 날 기록을 지울까요?\n사진도 함께 지워집니다.`)) return;
  await PhotoDB.del(photoId(viewDate, editing.catId)).catch(() => {});
  if (records[viewDate]) {
    delete records[viewDate][editing.catId];
    if (!Object.keys(records[viewDate]).length) delete records[viewDate];
  }
  save(LS_RECS, records);
  closeSheet();
  renderAll();
  toast('지웠어요');
}

/* ── 사진 자르기 ─────────────────────────────────
   원본을 4:3 창에 맞춰 끌어서 위치를 잡고 확대해 자른다.
   세로 사진도 고양이만 남기고 잘라낼 수 있다.
   ───────────────────────────────────────────── */
function openCrop(file) {
  const url = URL.createObjectURL(file);
  const img = $('#cropImg');
  img.onload = () => {
    cropping = { url, scale: 1, x: 0, y: 0, nw: img.naturalWidth, nh: img.naturalHeight,
                 base: 0, sw: 0, sh: 0 };
    $('#cropZoom').value = 1;
    $('#cropBackdrop').hidden = false;
    applyCrop();   // 무대 크기는 applyCrop이 그때그때 잰다
  };
  img.src = url;
}

/* 무대 크기는 창이 그려진 뒤에야 정해지므로 매번 다시 잰다.
   아직 0이면 ResizeObserver가 크기를 잡은 순간 다시 불린다. */
function applyCrop() {
  const c = cropping;
  if (!c) return;
  const stage = $('#cropStage');
  c.sw = stage.clientWidth;
  c.sh = stage.clientHeight;
  if (!c.sw || !c.sh) return;

  // 4:3 창을 꽉 채우는 최소 배율 (cover)
  c.base = Math.max(c.sw / c.nw, c.sh / c.nh);
  const w = c.nw * c.base * c.scale, h = c.nh * c.base * c.scale;
  // 빈 곳이 생기지 않게 이동 범위를 가둔다
  const maxX = Math.max(0, (w - c.sw) / 2), maxY = Math.max(0, (h - c.sh) / 2);
  c.x = Math.min(maxX, Math.max(-maxX, c.x));
  c.y = Math.min(maxY, Math.max(-maxY, c.y));

  const img = $('#cropImg');
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.transform = `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px))`;
}

function closeCrop() {
  if (cropping?.url) URL.revokeObjectURL(cropping.url);
  cropping = null;
  $('#cropBackdrop').hidden = true;
}

/* 화면에 보이는 4:3 영역 그대로를 잘라 압축한다 */
async function confirmCrop() {
  const c = cropping;
  if (!c) return;
  const img = $('#cropImg');
  const shown = c.base * c.scale;              // 원본 → 화면 배율
  const srcW = c.sw / shown, srcH = c.sh / shown;
  const srcX = (c.nw - srcW) / 2 - c.x / shown;
  const srcY = (c.nh - srcH) / 2 - c.y / shown;

  const outW = Math.min(PHOTO_MAX_PX, Math.round(srcW));
  const cv = document.createElement('canvas');
  cv.width = outW;
  cv.height = Math.round(outW / PHOTO_RATIO);
  cv.getContext('2d').drawImage(img, srcX, srcY, srcW, srcH, 0, 0, cv.width, cv.height);

  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', PHOTO_QUALITY));
  closeCrop();
  if (!blob || !editing) return;
  editing.photoBlob = blob;
  editing.photoDirty = true;
  showPhoto(blob);
  toast(`사진 준비 완료 (${Math.round(blob.size / 1024)}KB)`);
}

function bindCropDrag() {
  const stage = $('#cropStage');
  let last = null;
  stage.addEventListener('pointerdown', e => {
    if (!cropping) return;
    last = { x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!last || !cropping) return;
    cropping.x += e.clientX - last.x;
    cropping.y += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    applyCrop();
  });
  const end = () => { last = null; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  $('#cropZoom').addEventListener('input', e => {
    if (!cropping) return;
    cropping.scale = Number(e.target.value);
    applyCrop();
  });

  // 무대가 크기를 갖는 순간(창이 열릴 때·화면 회전 때) 다시 맞춘다
  new ResizeObserver(() => applyCrop()).observe(stage);
}

/* ── 아이콘 고르기 ── */
async function loadAvatars() {
  try {
    const res = await fetch('icons/avatars/manifest.json');
    const data = await res.json();
    avatars = Array.isArray(data.icons) ? data.icons : [];
  } catch { avatars = []; }
}

let iconTarget = null;
function openIconPicker(cat, onPick) {
  iconTarget = onPick;
  const my = $('#myIcons');
  my.innerHTML = '';
  $('#myIconField').hidden = avatars.length === 0;
  avatars.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iconopt';
    b.innerHTML = `<img src="icons/avatars/${esc(a.file)}" alt="${esc(a.label ?? '')}">`;
    b.setAttribute('aria-pressed', String(cat.icon === a.file));
    b.addEventListener('click', () => { onPick({ icon: a.file }); closeIconPicker(); });
    my.append(b);
  });

  const em = $('#emojiIcons');
  em.innerHTML = '';
  EMOJI_SET.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iconopt';
    b.textContent = e;
    b.setAttribute('aria-pressed', String(!cat.icon && cat.emoji === e));
    b.addEventListener('click', () => { onPick({ emoji: e }); closeIconPicker(); });
    em.append(b);
  });

  $('#iconHint').textContent = avatars.length
    ? '직접 그린 그림은 icons/avatars 폴더에서 관리해요.'
    : '직접 그린 그림을 icons/avatars 폴더에 넣으면 여기에 나타나요.';
  $('#iconBackdrop').hidden = false;
}
function closeIconPicker() { $('#iconBackdrop').hidden = true; iconTarget = null; }

/* ── 설정 ── */
function openSettings() {
  // 아직 아무도 없으면 바로 이름 채울 수 있게 빈 칸 하나로 시작
  const draft = cats.length ? cats.map(c => ({ ...c }))
                            : [{ id: 'c' + Date.now(), name: '', emoji: '🐱' }];
  renderCatList(draft);
  $('#setBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  showStorage();
}

function renderCatList(draft) {
  const box = $('#catList');
  box.innerHTML = '';
  box._draft = draft;

  draft.forEach((cat, i) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'catrow';

    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'catrow__icon';
    icon.innerHTML = catIconHtml(cat);
    icon.setAttribute('aria-label', '아이콘 고르기');
    icon.addEventListener('click', () => openIconPicker(cat, pick => {
      if (pick.icon) { cat.icon = pick.icon; delete cat.emoji; }
      else { cat.emoji = pick.emoji; delete cat.icon; }
      icon.innerHTML = catIconHtml(cat);
    }));

    const nm = document.createElement('input');
    nm.className = 'input catrow__name';
    nm.value = cat.name;
    nm.maxLength = 12;
    nm.placeholder = '이름';
    nm.setAttribute('aria-label', '이름');
    nm.addEventListener('input', () => cat.name = nm.value);

    const del = document.createElement('button');
    del.className = 'catrow__del';
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', `${cat.name} 삭제`);
    del.addEventListener('click', () => {
      if (draft.length <= 1) return toast('최소 한 마리는 있어야 해요');
      if (!confirm(`${cat.name}을(를) 목록에서 지울까요?\n기존 기록은 남아 있어요.`)) return;
      draft.splice(i, 1);
      renderCatList(draft);
    });

    const main = document.createElement('div');
    main.className = 'catrow__main';
    main.append(icon, nm, del);

    // 평소 하루 물 섭취량 — 이 양이 '보통'의 기준이 된다
    const water = document.createElement('label');
    water.className = 'catrow__water';
    const wlab = document.createElement('span');
    wlab.className = 'catrow__waterlab';
    wlab.textContent = '💧 평소 하루 물양 (ml) · ‘보통’ 기준';
    const wi = document.createElement('input');
    wi.type = 'number';
    wi.className = 'input input--sm';
    wi.inputMode = 'decimal';
    wi.min = '0';
    wi.step = '1';
    wi.placeholder = '예: 150 (비워둬도 돼요)';
    wi.value = cat.waterAvg ?? '';
    wi.setAttribute('aria-label', `${cat.name} 평소 하루 물양`);
    wi.addEventListener('input', () => cat.waterAvg = wi.value);
    water.append(wlab, wi);

    rowEl.append(main, water);
    box.append(rowEl);
  });
}

async function showStorage() {
  const el = $('#storageInfo');
  try {
    const keys = await PhotoDB.keys();
    const days = Object.keys(records).length;
    let line = `기록 ${days}일치 · 사진 ${keys.length}장`;
    if (navigator.storage?.estimate) {
      const { usage } = await navigator.storage.estimate();
      if (usage) line += ` · ${(usage / 1048576).toFixed(1)}MB 사용 중`;
    }
    el.textContent = line + '\n브라우저 데이터를 지우면 기록이 사라져요. 가끔 백업해두세요.';
  } catch { el.textContent = '저장 공간 정보를 읽지 못했어요.'; }
}

function saveSettings() {
  const draft = $('#catList')._draft;
  if (!draft.length) return toast('고양이를 한 마리 이상 추가해 주세요');
  for (const c of draft) {
    c.name = c.name.trim();
    if (!c.name) return toast('이름을 비워둘 수 없어요');
    if (!c.icon && !c.emoji) c.emoji = '🐱';
    const wa = parseFloat(c.waterAvg);
    if (Number.isFinite(wa) && wa > 0) c.waterAvg = Math.round(wa);
    else delete c.waterAvg;
  }
  cats = draft;
  save(LS_CATS, cats);
  $('#setBackdrop').hidden = true;
  document.body.style.overflow = '';
  renderAll();
  toast('설정을 저장했어요');
}

/* ── 백업 · 복원 ── */
async function backup() {
  toast('백업 파일 만드는 중…');
  const photos = {};
  try {
    for (const k of await PhotoDB.keys()) {
      const blob = await PhotoDB.get(k);
      if (blob) photos[k] = await blobToDataUrl(blob);
    }
  } catch {}
  const data = { version: 2, exportedAt: new Date().toISOString(), cats, records, lists, photos };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `리온레오-백업-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('백업 파일을 저장했어요');
}

async function restore(file) {
  if (!confirm('백업을 불러오면 지금 기록을 덮어씁니다.\n계속할까요?')) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.records || !data.cats) throw new Error('형식이 달라요');
    cats = data.cats;
    records = migrate(data.records);
    lists = data.lists ?? { brand: [], product: [], treat: [], flavor: [] };
    lists.flavor ??= [];
    save(LS_CATS, cats); save(LS_RECS, records); save(LS_LISTS, lists);
    for (const [k, dataUrl] of Object.entries(data.photos ?? {})) {
      await PhotoDB.put(k, await (await fetch(dataUrl)).blob());
    }
    renderDatalists();
    renderAll();
    toast('백업을 불러왔어요');
  } catch { toast('백업 파일을 읽지 못했어요'); }
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/* ── 토스트 ── */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

/* ── 이벤트 ── */
function go(days) {
  const next = shiftDate(viewDate, days);
  if (next > todayKey()) return;
  viewDate = next;
  renderAll();
}
$('#btnPrev').addEventListener('click', () => go(-1));
$('#btnNext').addEventListener('click', () => go(1));
$('#btnGoToday').addEventListener('click', () => { viewDate = todayKey(); renderAll(); });

/* 날짜 라벨을 탭하면 달력이 열리고, 고른 날짜로 이동한다.
   PC(마우스)에서도 한 번에 열리도록 showPicker를 시도한다. */
const datePicker = $('#datePicker');
datePicker.addEventListener('click', () => { try { datePicker.showPicker(); } catch {} });
datePicker.addEventListener('change', () => {
  const v = datePicker.value;
  if (!v) { datePicker.value = viewDate; return; }   // 비우면 되돌린다
  viewDate = v > todayKey() ? todayKey() : v;         // 미래는 오늘로 막는다
  renderAll();
});

$('#calPrev').addEventListener('click', () => calShift(-1));
$('#calNext').addEventListener('click', () => calShift(1));
$('#photoViewBackdrop').addEventListener('click', closePhotoView);

$('#btnSettings').addEventListener('click', openSettings);
$('#btnCloseSet').addEventListener('click', () => {
  $('#setBackdrop').hidden = true;
  document.body.style.overflow = '';
});
$('#btnSaveSet').addEventListener('click', saveSettings);
$('#btnAddCat').addEventListener('click', () => {
  const draft = $('#catList')._draft;
  draft.push({ id: 'c' + Date.now(), name: '', emoji: '🐱' });
  renderCatList(draft);
});
$('#btnCloseIcon').addEventListener('click', closeIconPicker);

$('#btnCloseSheet').addEventListener('click', closeSheet);
$('#btnSave').addEventListener('click', saveRecord);
$('#btnDelete').addEventListener('click', deleteRecord);

$('#btnAddPoop').addEventListener('click', () => {
  editing.draft.poops.push({ t: nowTime(), shape: null, color: null, amount: null, size: null, smell: null });
  renderPoops();
});
$('#btnAddMeal').addEventListener('click', () => {
  const last = editing.draft.meals.at(-1)?.items?.at(-1) ?? findLastMeal(editing.catId);
  editing.draft.meals.push({
    t: nowTime(),
    items: [{ kind: last?.kind ?? null, brand: last?.brand ?? '', product: last?.product ?? '', grams: '' }],
    amount: null,
  });
  renderMeals();
});
$('#btnAddTreat').addEventListener('click', () => {
  editing.draft.treats.push({ t: nowTime(), name: '', amount: '' });
  renderTreats();
});

/* 사료는 매일 같은 걸 주므로 지난 기록에서 미리 채워 입력을 줄인다 */
function findLastMeal(catId) {
  for (const d of Object.keys(records).sort().reverse()) {
    const it = records[d]?.[catId]?.meals?.at(-1)?.items?.at(-1);
    if (it && (it.brand || it.product || it.kind)) return it;
  }
  return null;
}

$('#photoCamera').addEventListener('change', e => { if (e.target.files[0]) openCrop(e.target.files[0]); e.target.value = ''; });
$('#photoLibrary').addEventListener('change', e => { if (e.target.files[0]) openCrop(e.target.files[0]); e.target.value = ''; });
$('#btnPhotoRemove').addEventListener('click', () => {
  if (!editing) return;
  editing.photoBlob = null;
  editing.photoDirty = true;
  showPhoto(null);
});
$('#btnCropCancel').addEventListener('click', closeCrop);
$('#btnCropDone').addEventListener('click', confirmCrop);
bindCropDrag();

$('#sheetBackdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeSheet(); });
$('#setBackdrop').addEventListener('click', e => {
  if (e.target !== e.currentTarget) return;
  $('#setBackdrop').hidden = true;
  document.body.style.overflow = '';
});
$('#iconBackdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeIconPicker(); });

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#photoViewBackdrop').hidden) closePhotoView();
  else if (!$('#cropBackdrop').hidden) closeCrop();
  else if (!$('#iconBackdrop').hidden) closeIconPicker();
  else if (!$('#sheetBackdrop').hidden) closeSheet();
  else if (!$('#setBackdrop').hidden) {
    $('#setBackdrop').hidden = true;
    document.body.style.overflow = '';
  }
});

$('#btnBackup').addEventListener('click', backup);
$('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
$('#restoreFile').addEventListener('change', e => {
  if (e.target.files[0]) restore(e.target.files[0]);
  e.target.value = '';
});

renderDatalists();
renderAll();
loadAvatars();
