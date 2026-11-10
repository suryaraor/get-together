// Get Together backend: Google Apps Script web app that uses a Google Sheet as the database.
// Paste this whole file into the Apps Script editor (Extensions > Apps Script) of the sheet, then
// Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). See README.md.
//
// Two tabs are created automatically the first time the app calls it:
//   Events   : id, name, startDate, endDate, location, notes, created, slug
//   Families : id, eventId, name, count, status, arrive, leave, notes

const SHEET_ID = '13GKm58mqYhb7DQKM4BtRSvwfu3PGJksjKH9akbqXoGI';
const TABS = {
    Events: ['id', 'name', 'startDate', 'endDate', 'location', 'notes', 'created', 'slug'],
    Families: ['id', 'eventId', 'name', 'count', 'status', 'arrive', 'leave', 'notes']
};
const DATE_FIELDS = { startDate: 'yyyy-MM-dd', endDate: 'yyyy-MM-dd', arrive: "yyyy-MM-dd'T'HH:mm", leave: "yyyy-MM-dd'T'HH:mm" };

function doGet(e) {
    const p = e.parameter || {};
    let out;
    try {
        const lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try { out = handle(p); } finally { lock.releaseLock(); }
    } catch (err) {
        out = { success: false, error: String(err && err.message || err) };
    }
    const json = JSON.stringify(out);
    const cb = /^[\w.$]+$/.test(p.callback || '') ? p.callback : null;
    return ContentService
        .createTextOutput(cb ? cb + '(' + json + ')' : json)
        .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function handle(p) {
    switch (p.action) {
        case 'getEvents': return eventList();
        case 'getEvent': return eventData(need(p, 'eventId'));
        case 'createEvent': {
            const id = newId();
            insert('Events', { id, name: need(p, 'name'), startDate: p.startDate || '', endDate: p.endDate || '', location: p.location || '', notes: p.notes || '', created: new Date().toISOString(), slug: uniqueSlug(p.name) });
            JSON.parse(p.families || '[]').forEach(f => insertFamily(id, f));
            return eventData(id);
        }
        case 'updateEvent': update('Events', need(p, 'eventId'), p); return eventData(p.eventId);
        case 'deleteEvent': {
            remove('Events', need(p, 'eventId'));
            rows('Families').filter(f => f.eventId === p.eventId).reverse().forEach(f => sheet('Families').deleteRow(f._row));
            return eventList();
        }
        case 'addFamily': insertFamily(need(p, 'eventId'), p); return eventData(p.eventId);
        case 'updateFamily': update('Families', need(p, 'id'), p); return eventData(familyEvent(p.id));
        case 'deleteFamily': { const ev = familyEvent(need(p, 'id')); remove('Families', p.id); return eventData(ev); }
        default: throw new Error('Unknown action');
    }
}

// ---------- Responses ----------
function eventList() {
    const fams = rows('Families');
    const events = rows('Events').map(ev => {
        const mine = fams.filter(f => f.eventId === ev.id);
        return Object.assign(clean(ev), { familyCount: mine.length, people: mine.reduce((n, f) => n + f.count, 0) });
    });
    return { success: true, events };
}

function eventData(eventId) {
    const ev = rows('Events').filter(e => e.id === eventId || (e.slug && e.slug === eventId))[0]; // id or slug
    if (!ev) throw new Error('Get-together not found');
    return { success: true, event: clean(ev), families: rows('Families').filter(f => f.eventId === ev.id).map(clean) };
}

function familyEvent(id) {
    const f = rows('Families').filter(r => r.id === id)[0];
    if (!f) throw new Error('Family not found');
    return f.eventId;
}

function insertFamily(eventId, f) {
    const count = Math.max(1, Math.round(Number(f.count)) || 1);
    insert('Families', { id: newId(), eventId, name: need(f, 'name'), count, status: f.status || 'maybe', arrive: f.arrive || '', leave: f.leave || '', notes: f.notes || '' });
}

// ---------- Sheet helpers ----------
function sheet(name) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(name);
    if (!sh) {
        const cols = TABS[name];
        sh = ss.insertSheet(name);
        sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
        sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // keep dates/ids as plain text
        sh.setFrozenRows(1);
    }
    // Add any columns introduced after the tab was first created
    const cols = TABS[name];
    if (sh.getLastColumn() < cols.length) {
        sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
        sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    }
    return sh;
}

function rows(name) {
    const sh = sheet(name), cols = TABS[name];
    const last = sh.getLastRow();
    if (last < 2) return [];
    tz = tz || SpreadsheetApp.openById(SHEET_ID).getSpreadsheetTimeZone();
    return sh.getRange(2, 1, last - 1, cols.length).getValues().map((vals, i) => {
        const o = { _row: i + 2 };
        cols.forEach((c, j) => {
            let v = vals[j];
            if (v instanceof Date) v = Utilities.formatDate(v, tz, DATE_FIELDS[c] || "yyyy-MM-dd'T'HH:mm");
            o[c] = c === 'count' ? (Number(v) || 1) : String(v === null ? '' : v);
        });
        return o;
    }).filter(o => o.id);
}
let tz;

function clean(o) { const c = Object.assign({}, o); delete c._row; return c; }
function insert(name, obj) { sheet(name).appendRow(TABS[name].map(c => obj[c] === undefined ? '' : obj[c])); }

function update(name, id, p) {
    const row = rows(name).filter(r => r.id === id)[0];
    if (!row) throw new Error('Not found');
    const sh = sheet(name);
    TABS[name].forEach((c, j) => {
        if (c === 'id' || c === 'eventId' || c === 'created' || c === 'slug' || !Object.prototype.hasOwnProperty.call(p, c)) return;
        let v = p[c];
        if (c === 'name' && !String(v).trim()) throw new Error('Name is required');
        if (c === 'count') v = Math.max(1, Math.round(Number(v)) || 1);
        sh.getRange(row._row, j + 1).setValue(v);
    });
}

function remove(name, id) {
    const row = rows(name).filter(r => r.id === id)[0];
    if (row) sheet(name).deleteRow(row._row);
}

function need(o, k) {
    if (o[k] === undefined || String(o[k]).trim() === '') throw new Error('Missing ' + k);
    return String(o[k]).trim();
}
// URL-friendly name: "Diwali Get-together!" -> "diwali-get-together"; adds -2, -3... if already used
function uniqueSlug(name) {
    const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'get-together';
    const used = rows('Events').map(e => e.slug);
    let slug = base, n = 2;
    while (used.indexOf(slug) >= 0) slug = base + '-' + n++;
    return slug;
}
function newId() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
