// Get Together: plan who is coming to a get-together and when. Backend: Google Sheet via Apps Script (see Code.gs).
// Paste your deployed Apps Script URL here, or enter it on the setup screen (saved in this browser only).
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbzZpnf0hEry5rCTMDn4SkBknsZml9tr6gwKh9RAtDmarBEIBOLVZ1TNDCswEnbeeus_/exec';
const CONFIG = { appsScriptUrl: localStorage.getItem('gt_appsScriptUrl') || DEFAULT_URL };

const $ = (id) => document.getElementById(id);
const state = { events: [], event: null, families: [], tab: 'families', sheetKind: null };

// ---------- Icons (Lucide paths) ----------
const ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 8h7M7 13h10M7 18h5"/>',
    whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.2-2-1-.8.7c-.8-.4-1.5-1.1-1.9-1.9l.7-.8-1-2Z"/>',
    flower: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'
};
function icon(name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    s.innerHTML = ICONS[name];
    return s;
}
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}
const show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
function setIcon(node, name, label) { node.replaceChildren(icon(name), ...(label ? [document.createTextNode(label)] : [])); }

let toastTimer;
function toast(msg) {
    $('toast').textContent = msg;
    show('toast', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show('toast', false), 4500);
}
function showError(msg) { $('errorMessage').textContent = msg; show('errorMessage', !!msg); }

// ---------- API (JSONP, so a static page works from GitHub Pages without CORS) ----------
let jsonpCounter = 0;
function api(params) {
    return new Promise((resolve, reject) => {
        if (!CONFIG.appsScriptUrl) return reject(new Error('Not connected'));
        const cb = `gtCb_${Date.now()}_${jsonpCounter++}`;
        const script = document.createElement('script');
        const done = () => { clearTimeout(timer); delete window[cb]; script.remove(); };
        const timer = setTimeout(() => { done(); reject(new Error('Request timed out')); }, 25000);
        window[cb] = (d) => { done(); d.success ? resolve(d) : reject(new Error(d.error || 'Request failed')); };
        script.onerror = () => { done(); reject(new Error('Unable to reach Apps Script endpoint')); };
        script.src = `${CONFIG.appsScriptUrl}?${new URLSearchParams({ ...params, callback: cb })}`;
        document.body.appendChild(script);
    });
}

// ---------- Date helpers (all local time; stored as "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm") ----------
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function parseDT(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDay = (d, long) => d.toLocaleDateString(undefined, { weekday: long ? 'long' : 'short', month: 'short', day: 'numeric' });
function fmtTime(d) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h % 12 || 12}${m ? ':' + pad2(m) : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtStamp(d) { return `${fmtDay(d)}, ${fmtTime(d)}`; }
function eventDates(ev) {
    const a = parseDT(ev.startDate), b = parseDT(ev.endDate);
    if (!a) return '';
    if (!b || dayKey(a) === dayKey(b)) return fmtDay(a, true);
    return `${fmtDay(a)} – ${fmtDay(b)}`;
}
// "Fri, Nov 14, 4 PM → Sat, Nov 15, 11 AM" or the part that is known
function famWhen(f) {
    const a = parseDT(f.arrive), b = parseDT(f.leave);
    if (a && b) return dayKey(a) === dayKey(b) ? `${fmtDay(a)}, ${fmtTime(a)} – ${fmtTime(b)}` : `${fmtStamp(a)} → ${fmtStamp(b)}`;
    if (a) return `Arrives ${fmtStamp(a)}`;
    if (b) return `Leaves ${fmtStamp(b)}`;
    return 'Time not set yet';
}

// ---------- Router ----------
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', route);

async function init() {
    setIcon($('backBtn'), 'back');
    setIcon($('editEventBtn'), 'edit');
    setIcon($('newEventBtn'), 'plus', ' New get-together');
    setIcon($('addFamilyBtn'), 'plus', ' Add family');
    setIcon($('shareBtn'), 'whatsapp', ' Share schedule on WhatsApp');
    document.querySelectorAll('.sheet-close').forEach((b) => { b.appendChild(icon('x')); b.addEventListener('click', closeSheet); });
    $('famMinus').appendChild(icon('minus'));
    $('famPlus').appendChild(icon('plus'));
    document.querySelectorAll('.tab').forEach((t) => {
        t.prepend(icon(t.dataset.tab === 'families' ? 'users' : 'chart'));
        t.append(t.dataset.tab === 'families' ? 'Families' : 'Schedule');
        t.addEventListener('click', () => setTab(t.dataset.tab));
    });
    $('backBtn').addEventListener('click', () => { location.hash = ''; });
    $('editEventBtn').addEventListener('click', () => openEventSheet(state.event));
    $('newEventBtn').addEventListener('click', () => openEventSheet(null));
    $('addFamilyBtn').addEventListener('click', () => openFamilySheet(null));
    $('shareBtn').addEventListener('click', shareSchedule);
    $('sheetBackdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    $('saveUrlBtn').addEventListener('click', () => {
        const url = $('urlInput').value.trim();
        if (!url) return;
        localStorage.setItem('gt_appsScriptUrl', url);
        CONFIG.appsScriptUrl = url;
        route();
    });
    initFamilySheet();
    initEventSheet();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !state.sheetKind && CONFIG.appsScriptUrl) route(true);
    });
    route();
}

const eventIdFromHash = () => (/^#\/(?:e\/)?([\w-]+)/.exec(location.hash) || [])[1] || null;

async function route(quiet) {
    showError('');
    show('setupView', false);
    if (!CONFIG.appsScriptUrl) {
        ['homeView', 'eventView', 'loadingIndicator'].forEach((v) => show(v, false));
        setHeader('Get Together', false);
        return show('setupView', true);
    }
    const id = eventIdFromHash();
    if (quiet !== true) { show('homeView', false); show('eventView', false); show('loadingIndicator', true); }
    try {
        if (id) {
            const d = await api({ action: 'getEvent', eventId: id });
            state.event = d.event; state.families = d.families;
            renderEvent();
        } else {
            state.events = (await api({ action: 'getEvents' })).events;
            state.event = null;
            renderHome();
        }
    } catch (err) {
        if (quiet === true) return;
        showError(`Failed to load: ${err.message}`);
        if (err.message === 'Not connected' || err.message.startsWith('Unable')) show('setupView', true);
        else if (id) { location.hash = ''; }
    }
    show('loadingIndicator', false);
}

function setHeader(title, inEvent) {
    const h = $('hdrTitle');
    h.replaceChildren();
    if (!inEvent) h.appendChild(icon('flower'));
    h.appendChild(el('span', '', title));
    show('backBtn', inEvent);
    show('editEventBtn', inEvent);
    document.title = inEvent ? `${title} · Get Together` : 'Get Together';
}

// ---------- Home ----------
function renderHome() {
    setHeader('Get Together', false);
    show('eventView', false);
    show('homeView', true);
    const list = $('eventList');
    list.replaceChildren();
    if (!state.events.length) list.appendChild(el('div', 'empty', 'No get-togethers yet. Tap "New get-together" to start planning.'));
    state.events.slice().reverse().forEach((ev) => {
        const card = el('button', 'event-card');
        card.type = 'button';
        const meta = el('div', 'meta');
        meta.append(el('div', 'name', ev.name), el('div', 'sub', [eventDates(ev), ev.location].filter(Boolean).join(' · ') || 'Dates not set'));
        const big = el('div', 'big', String(ev.people));
        big.appendChild(el('small', '', `${ev.familyCount} famil${ev.familyCount === 1 ? 'y' : 'ies'}`));
        card.append(meta, big);
        card.addEventListener('click', () => { state.tab = 'families'; location.hash = `#/${ev.slug || ev.id}`; });
        list.appendChild(card);
    });
}

// ---------- Event ----------
function renderEvent() {
    const ev = state.event;
    setHeader(ev.name, true);
    show('homeView', false);
    show('eventView', true);
    const people = state.families.reduce((n, f) => n + f.count, 0);
    const sure = state.families.filter((f) => f.status === 'yes').reduce((n, f) => n + f.count, 0);
    const box = $('summary');
    box.replaceChildren();
    [[state.families.length, 'Families'], [people, 'People'], [sure, 'Confirmed']].forEach(([n, l]) => {
        const s = el('div', 'stat');
        s.append(el('b', '', String(n)), el('span', '', l));
        box.appendChild(s);
    });
    const sub = el('div', 'ev-sub');
    if (eventDates(ev)) { const s = el('span'); s.append(icon('calendar'), eventDates(ev)); sub.appendChild(s); }
    if (ev.location) { const s = el('span'); s.append(icon('pin'), ev.location); sub.appendChild(s); }
    if (sub.children.length) box.appendChild(sub);
    renderFamilies();
    renderSchedule();
    setTab(state.tab);
}

function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    show('familiesTab', tab === 'families');
    show('scheduleTab', tab === 'schedule');
}

const stepTimers = {};
function renderFamilies() {
    const list = $('familyList');
    list.replaceChildren();
    if (!state.families.length) list.appendChild(el('div', 'empty', 'No families yet. Tap "Add family" below.'));
    state.families.slice().sort((a, b) => (parseDT(a.arrive) || 1e15) - (parseDT(b.arrive) || 1e15) || a.name.localeCompare(b.name)).forEach((f) => {
        const row = el('div', 'fam' + (f.status === 'yes' ? ' yes' : ''));
        const main = el('button', 'fam-main');
        main.type = 'button';
        const name = el('div', 'fam-name');
        name.append(f.name, el('span', 'chip', f.status === 'yes' ? 'Confirmed' : 'Maybe'));
        const when = el('div', 'fam-when');
        when.append(icon('clock'), famWhen(f));
        main.append(name, when);
        if (f.notes) main.appendChild(el('div', 'fam-note', f.notes));
        main.addEventListener('click', () => openFamilySheet(f));

        const step = el('div', 'stepper');
        const out = el('output', '', String(f.count));
        const mk = (name, d) => {
            const b = el('button');
            b.type = 'button';
            b.setAttribute('aria-label', d > 0 ? 'More people' : 'Fewer people');
            b.appendChild(icon(name));
            b.addEventListener('click', () => {
                f.count = Math.max(1, f.count + d);
                out.textContent = f.count;
                clearTimeout(stepTimers[f.id]);
                stepTimers[f.id] = setTimeout(() => saveFamilyCount(f), 500);
            });
            return b;
        };
        step.append(mk('minus', -1), out, mk('plus', 1));
        row.append(main, step);
        list.appendChild(row);
    });
}

async function saveFamilyCount(f) {
    try {
        applyEvent(await api({ action: 'updateFamily', id: f.id, count: f.count }), true);
    } catch (err) { toast(err.message); route(true); }
}
function applyEvent(d, keepScroll) {
    state.event = d.event; state.families = d.families;
    const y = scrollY;
    renderEvent();
    if (keepScroll) scrollTo(0, y);
}

// ---------- Schedule view (also the screenshot card) ----------
const PALETTE = ['#cf4520', '#3b8454', '#2f6fa3', '#8a4fa0', '#c08a1e', '#b0396b', '#2a8a8a', '#6b5b45'];

function renderSchedule() {
    const ev = state.event;
    const card = $('shareCard');
    card.replaceChildren();
    const people = state.families.reduce((n, f) => n + f.count, 0);

    const head = el('div', 'sc-head');
    head.append(el('h2', 'serif', ev.name), el('p', '', [eventDates(ev), ev.location].filter(Boolean).join(' · ')));
    const tot = el('div', 'tot');
    tot.append(el('span', '', `${state.families.length} families`), el('span', '', `~${people} people`));
    head.appendChild(tot);
    card.appendChild(head);

    // Families with an arrival time, ordered by arrival; colours follow that order
    const timed = state.families
        .map((f) => ({ f, a: parseDT(f.arrive), b: parseDT(f.leave) }))
        .filter((x) => x.a)
        .map((x) => ({ ...x, b: x.b && x.b > x.a ? x.b : null }))
        .sort((x, y) => x.a - y.a || x.f.name.localeCompare(y.f.name));
    timed.forEach((x, i) => { x.color = PALETTE[i % PALETTE.length]; });
    const untimed = state.families.filter((f) => !parseDT(f.arrive));

    // Days to show: the event's range plus any day a family touches
    const days = new Map();
    const addDay = (d) => { const k = dayKey(d); if (!days.has(k)) days.set(k, startOfDay(d)); };
    const es = parseDT(ev.startDate), ee = parseDT(ev.endDate);
    if (es) for (let d = es; d <= (ee && ee >= es ? ee : es); d = addDays(d, 1)) addDay(d);
    timed.forEach((x) => { for (let d = startOfDay(x.a); d <= startOfDay(x.b || x.a); d = addDays(d, 1)) addDay(d); });
    const dayList = [...days.values()].sort((a, b) => a - b);

    if (!dayList.length) {
        card.appendChild(el('div', 'empty', 'Add arrival times to see the schedule.'));
    }
    if (dayList.length) { const sc = el('div', 'mx-scroll'); sc.appendChild(renderMatrix(dayList, timed)); card.appendChild(sc); }

    if (untimed.length && dayList.length) {
        const t = el('div', 'tbd');
        t.append(el('b', '', 'No time yet'), untimed.map((f) => `${f.name} (${f.count})`).join(', '));
        card.appendChild(t);
    } else if (untimed.length) {
        const t = el('div', 'tbd');
        t.append(el('b', '', 'Families'), untimed.map((f) => `${f.name} (${f.count})`).join(', '));
        card.appendChild(t);
    }
    if (timed.length) card.appendChild(el('div', 'sc-legend', 'Blocks: night · morning · afternoon · evening  (faded = maybe)'));

    const foot = el('div', 'sc-foot');
    foot.append('Update: ', el('b', '', shareLink().replace(/^https?:\/\//, '')));
    card.appendChild(foot);
}

// Matrix: dates are columns, families are rows; each cell is four 6-hour blocks (night, morning, afternoon, evening)
function renderMatrix(dayList, timed) {
    const wrap = el('div', 'matrix');
    wrap.style.setProperty('--n', dayList.length);
    const add = (cls, ...kids) => { const c = el('div', cls); c.append(...kids); wrap.appendChild(c); return c; };

    // Which of a day's 4 slots a family is there (no leave time = stays to the end of the day)
    const presence = (x, day) => {
        const dEnd = addDays(day, 1);
        if (!(x.a < dEnd && (x.b ? x.b > day : x.a >= day))) return null;
        const hs = Math.max(0, (x.a - day) / 36e5), he = x.b ? Math.min(24, (x.b - day) / 36e5) : 24;
        return [0, 1, 2, 3].map((i) => hs < i * 6 + 6 && he > i * 6);
    };

    add('mx-corner');
    dayList.forEach((d, i) => {
        const h = el('div', 'mx-day');
        const newMonth = i === 0 || d.getMonth() !== dayList[i - 1].getMonth();
        h.append(
            el('small', '', newMonth ? d.toLocaleDateString(undefined, { month: 'short' }) : ' '),
            el('b', '', d.toLocaleDateString(undefined, { weekday: 'short' })),
            el('span', '', String(d.getDate()))
        );
        wrap.appendChild(h);
    });

    const totals = dayList.map(() => 0);
    timed.forEach((x) => {
        const who = el('div', 'mx-who');
        who.append(el('b', '', x.f.name), el('small', '', String(x.f.count)));
        wrap.appendChild(who);
        dayList.forEach((d, di) => {
            const p = presence(x, d);
            if (p && p.some(Boolean)) totals[di] += x.f.count;
            const blocks = el('div', 'mx-blocks');
            [0, 1, 2, 3].forEach((i) => {
                const on = p && p[i];
                const b = el('span', on && x.f.status !== 'yes' ? 'maybe' : '');
                if (on) b.style.background = x.color;
                blocks.appendChild(b);
            });
            const cell = el('div', 'mx-cell');
            cell.appendChild(blocks);
            wrap.appendChild(cell);
        });
    });

    add('mx-who mx-total', el('b', '', 'Total'));
    totals.forEach((n) => add('mx-cell mx-total', el('span', n ? '' : 'z', n ? `~${n}` : '–')));
    return wrap;
}

// ---------- Share: screenshot of the schedule + link, to WhatsApp ----------
const shareLink = () => `${location.origin}${location.pathname}#/${state.event.slug || state.event.id}`;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function shareSchedule() {
    const btn = $('shareBtn');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Preparing picture…';
    const prevTab = state.tab;
    try {
        setTab('schedule');
        await nextFrame();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const cardEl = $('shareCard');
        const mx = cardEl.querySelector('.matrix');
        const wide = Math.max(cardEl.offsetWidth, mx ? mx.scrollWidth + 24 : 0);
        const canvas = await html2canvas(cardEl, { scale: 2, width: wide, windowWidth: wide + 40,
            onclone: (doc) => {
                const c = doc.getElementById('shareCard');
                c.style.width = wide + 'px';
                c.querySelectorAll('.mx-scroll').forEach((n) => { n.style.overflow = 'visible'; });
                c.querySelectorAll('.mx-who, .mx-corner').forEach((n) => { n.style.position = 'static'; });
            },
            backgroundColor: '#faf7f0', useCORS: true });
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], `${state.event.name.replace(/[^\w]+/g, '-')}-schedule.png`, { type: 'image/png' });
        const text = `${state.event.name}${eventDates(state.event) ? ' · ' + eventDates(state.event) : ''}\nWho's coming & when. See or update here: ${shareLink()}`;

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], text, title: state.event.name });
                return;
            } catch (e) { if (e.name === 'AbortError') return; }
        }
        // Desktop / unsupported browsers: copy the picture (or download it) and open WhatsApp with the text
        let copied = false;
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            copied = true;
        } catch (e) { /* fall through to download */ }
        if (!copied) {
            const a = el('a');
            a.href = URL.createObjectURL(blob);
            a.download = file.name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        toast(copied ? 'Picture copied. Paste it in the WhatsApp chat.' : 'Picture saved. Attach it in the WhatsApp chat.');
    } catch (err) {
        toast(`Could not make the picture: ${err.message}`);
    } finally {
        setTab(prevTab);
        btn.disabled = false;
        btn.innerHTML = label;
    }
}

// ---------- Bottom sheets ----------
function openSheet(id, kind) {
    state.sheetKind = kind;
    show('sheetBackdrop', true);
    show(id, true);
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => $(id).classList.add('up'));
}
function closeSheet() {
    if (!state.sheetKind) return;
    state.sheetKind = null;
    ['familySheet', 'eventSheet'].forEach((id) => { $(id).classList.remove('up'); show(id, false); });
    show('sheetBackdrop', false);
    document.body.classList.remove('sheet-open');
}

// Family sheet
const fam = { editing: null, count: 2, status: 'maybe' };
function initFamilySheet() {
    const bump = (d) => { fam.count = Math.max(1, Math.min(99, fam.count + d)); $('famCount').textContent = fam.count; };
    $('famMinus').addEventListener('click', () => bump(-1));
    $('famPlus').addEventListener('click', () => bump(1));
    document.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => setStatus(b.dataset.status)));
    $('famSave').addEventListener('click', saveFamily);
    $('famDelete').addEventListener('click', deleteFamily);
    // Picking an arrival should pre-fill leaving on the same day so only the time needs changing
    $('famArrive').addEventListener('change', () => {
        if ($('famArrive').value && !$('famLeave').value) $('famLeave').value = $('famArrive').value.slice(0, 11) + '18:00';
    });
}
function setStatus(s) {
    fam.status = s;
    document.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('on', b.dataset.status === s));
}
function openFamilySheet(f) {
    fam.editing = f;
    $('famTitle').textContent = f ? 'Edit family' : 'Add family';
    $('famName').value = f ? f.name : '';
    fam.count = f ? f.count : 2;
    $('famCount').textContent = fam.count;
    setStatus(f ? f.status : 'maybe');
    $('famArrive').value = f ? f.arrive : '';
    $('famLeave').value = f ? f.leave : '';
    $('famNotes').value = f ? f.notes : '';
    $('famSave').textContent = f ? 'Save changes' : 'Add family';
    show('famDelete', !!f);
    // Pre-fill likely times from the event's dates for a new family
    if (!f && state.event.startDate) {
        $('famArrive').value = `${state.event.startDate}T10:00`;
        $('famLeave').value = `${state.event.endDate || state.event.startDate}T18:00`;
    }
    openSheet('familySheet', 'family');
    if (!f) setTimeout(() => $('famName').focus(), 300);
}
async function saveFamily() {
    const name = $('famName').value.trim();
    if (!name) { toast('Please enter a family name.'); return $('famName').focus(); }
    const arrive = $('famArrive').value, leave = $('famLeave').value;
    if (arrive && leave && leave <= arrive) return toast('Leaving time must be after arrival.');
    const data = { name, count: fam.count, status: fam.status, arrive, leave, notes: $('famNotes').value.trim() };
    const btn = $('famSave');
    btn.disabled = true;
    try {
        const d = await api(fam.editing
            ? { action: 'updateFamily', id: fam.editing.id, ...data }
            : { action: 'addFamily', eventId: state.event.id, ...data });
        closeSheet();
        applyEvent(d);
        toast(fam.editing ? 'Saved.' : `${name} added.`);
    } catch (err) { toast(err.message); }
    btn.disabled = false;
}
async function deleteFamily() {
    if (!confirm(`Remove ${fam.editing.name}?`)) return;
    try {
        const d = await api({ action: 'deleteFamily', id: fam.editing.id });
        closeSheet();
        applyEvent(d);
        toast('Family removed.');
    } catch (err) { toast(err.message); }
}

// Event sheet
let editingEvent = null;
function initEventSheet() {
    $('evSave').addEventListener('click', saveEvent);
    $('evDelete').addEventListener('click', deleteEvent);
    $('evStart').addEventListener('change', () => {
        if ($('evStart').value && (!$('evEnd').value || $('evEnd').value < $('evStart').value)) $('evEnd').value = $('evStart').value;
    });
}
function openEventSheet(ev) {
    editingEvent = ev;
    $('evTitle').textContent = ev ? 'Edit get-together' : 'New get-together';
    $('evName').value = ev ? ev.name : '';
    $('evStart').value = ev ? ev.startDate : '';
    $('evEnd').value = ev ? ev.endDate : '';
    $('evLoc').value = ev ? ev.location : '';
    $('evFams').value = '';
    show('evFamBox', !ev);
    show('evDelete', !!ev);
    $('evSave').textContent = ev ? 'Save changes' : 'Create';
    openSheet('eventSheet', 'event');
    if (!ev) setTimeout(() => $('evName').focus(), 300);
}
// "Sharma 4" / "Reddy, 3" / "Iyer family x5": last number on the line is the count (default 2)
function parseFamilies(text) {
    return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = /^(.*?)(?:[\s,:\-×]|\sx)*(\d{1,2})\s*(?:people|persons|members|ppl)?$/i.exec(l);
        const name = (m ? m[1] : l).replace(/[,:\-\s]+$/, '').trim();
        return { name: name || l, count: m ? Math.max(1, +m[2]) : 2, status: 'maybe' };
    });
}
async function saveEvent() {
    const name = $('evName').value.trim();
    if (!name) { toast('Please enter a name.'); return $('evName').focus(); }
    const start = $('evStart').value, end = $('evEnd').value;
    if (start && end && end < start) return toast('End date must be on or after the start date.');
    const data = { name, startDate: start, endDate: end, location: $('evLoc').value.trim() };
    const btn = $('evSave');
    btn.disabled = true;
    try {
        if (editingEvent) {
            const d = await api({ action: 'updateEvent', eventId: editingEvent.id, ...data });
            closeSheet();
            applyEvent(d);
            toast('Saved.');
        } else {
            const d = await api({ action: 'createEvent', ...data, families: JSON.stringify(parseFamilies($('evFams').value)) });
            closeSheet();
            state.tab = 'families';
            location.hash = `#/${d.event.slug || d.event.id}`;
        }
    } catch (err) { toast(err.message); }
    btn.disabled = false;
}
async function deleteEvent() {
    if (!confirm(`Delete "${editingEvent.name}" and all its families? This cannot be undone.`)) return;
    try {
        await api({ action: 'deleteEvent', eventId: editingEvent.id });
        closeSheet();
        location.hash = '';
    } catch (err) { toast(err.message); }
}
