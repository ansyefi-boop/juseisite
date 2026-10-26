/**
 * juseikr · Jusei INA GO — Rekap otomatis ke Google Sheets
 *
 * Cara pakai (detail lengkap di README):
 * 1. Buat Google Sheet baru > Ekstensi > Apps Script > tempel seluruh file ini.
 * 2. Project Settings (ikon gerigi) > Script Properties, tambahkan:
 *      SUPABASE_URL       https://xxxx.supabase.co
 *      SUPABASE_ANON_KEY  kunci anon public (BUKAN service_role)
 *      ADMIN_EMAIL        email akun admin juseikr
 *      ADMIN_PASSWORD     password akun admin tersebut
 * 3. Jalankan fungsi `tarikData` sekali (izinkan akses), lalu `pasangJadwal`
 *    agar data ditarik otomatis setiap jam.
 *
 * Skrip masuk sebagai admin lewat Supabase Auth, sehingga RLS tetap berlaku
 * dan service_role key tidak pernah dipakai.
 */

const STATUS = ['Pesanan Dibuat', 'Tiba di Gudang', 'Perjalanan ke Indonesia', 'Tiba di Gudang Indonesia',
  'Menunggu Pembayaran', 'Dalam Pengiriman ke Alamat', 'Selesai'];
const NEGARA = ['Korea Selatan', 'China', 'Jepang', 'Taiwan', 'Thailand'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('juseikr')
    .addItem('Tarik data sekarang', 'tarikData')
    .addItem('Pasang jadwal tiap jam', 'pasangJadwal')
    .addItem('Hapus jadwal', 'hapusJadwal')
    .addToUi();
}

function cfg_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].forEach(function (k) {
    if (!p[k]) throw new Error('Script Property ' + k + ' belum diisi');
  });
  p.SUPABASE_URL = p.SUPABASE_URL.replace(/\/+$/, '');
  return p;
}

function token_(c) {
  const r = UrlFetchApp.fetch(c.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: c.SUPABASE_ANON_KEY },
    payload: JSON.stringify({ email: c.ADMIN_EMAIL, password: c.ADMIN_PASSWORD })
  });
  if (r.getResponseCode() !== 200) throw new Error('Login admin gagal: ' + r.getContentText());
  return JSON.parse(r.getContentText()).access_token;
}

function ambil_(c, tok, col) {
  const out = [], size = 1000;
  for (let from = 0; ; from += size) {
    const url = c.SUPABASE_URL + '/rest/v1/kv?select=id,owner,data,created_at&col=eq.' + encodeURIComponent(col) +
      '&order=created_at.desc&limit=' + size + '&offset=' + from;
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { apikey: c.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + tok } });
    if (r.getResponseCode() !== 200) throw new Error('Gagal membaca ' + col + ': ' + r.getContentText());
    const rows = JSON.parse(r.getContentText());
    rows.forEach(function (x) { const d = x.data || {}; d.id = x.id; d.owner = x.owner; out.push(d); });
    if (rows.length < size) break;
  }
  return out;
}

// Cegah formula injection dari isian customer
function aman_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function tulis_(nama, rows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(nama) || ss.insertSheet(nama);
  sh.clearContents();
  if (!rows.length) return;
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows.map(function (r) { return r.map(aman_); }));
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#ffd6e8');
  sh.setFrozenRows(1);
}

function tarikData() {
  const c = cfg_(), tok = token_(c);
  const orders = ambil_(c, tok, 'orders'), invoices = ambil_(c, tok, 'invoices'), pays = ambil_(c, tok, 'payments');
  const inv = {}; invoices.forEach(function (i) { inv[i.id] = i; });
  const totalInv = function (i) { return Number(i.total || 0) + Number(i.ongkir || 0); };
  const tgl = function (t) { return t ? Utilities.formatDate(new Date(Number(t)), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm') : ''; };

  // Sheet 1: Orders
  const o = [['Kode', 'Tanggal', 'Pembeli', 'Email', 'HP', 'Penerima', 'Alamat', 'Negara', 'Metode kirim', 'No pesanan toko',
    'Pembayaran', 'Status', 'Resi LN', 'Barang', 'Estimasi', 'No invoice', 'Invoice dikonfirmasi', 'Total invoice', 'Bukti bayar']];
  orders.forEach(function (x) {
    const i = inv[x.id] || {}, ps = pays.filter(function (p) { return p.oid === x.id; });
    const items = x.items || [];
    o.push([x.id, tgl(x.at), x.buyer, x.email, x.hp || x.phone, x.rcp, x.addr, x.country, x.ship, x.shopNo, x.pay, x.status, x.resi,
      items.map(function (it) { return it.n + ' x' + it.q; }).join('; '),
      items.reduce(function (s, it) { return s + Number(it.q || 0) * Number(it.p || 0); }, 0),
      i.no || '', i.confirmed ? 'Ya' : 'Belum', i.no ? totalInv(i) : '',
      ps.length ? (ps.some(function (p) { return p.verified; }) ? 'Terverifikasi' : 'Menunggu') : '-']);
  });
  tulis_('Orders', o);

  // Sheet 2: Rekap
  const conf = invoices.filter(function (i) { return i.confirmed; });
  const r = [['Metrik', 'Nilai'],
    ['Terakhir diperbarui', Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm')],
    ['Total order', orders.length],
    ['Nilai invoice terkonfirmasi', conf.reduce(function (s, i) { return s + totalInv(i); }, 0)],
    ['Nilai semua invoice', invoices.reduce(function (s, i) { return s + totalInv(i); }, 0)],
    ['', '']];
  STATUS.forEach(function (s) { r.push([s, orders.filter(function (x) { return (x.status || STATUS[0]) === s; }).length]); });
  tulis_('Rekap', r);

  // Sheet 3: Warehouse per negara x tahap
  const w = [['Negara', 'Total'].concat(STATUS)];
  NEGARA.forEach(function (n) {
    const by = orders.filter(function (x) { return x.country === n; });
    w.push([n, by.length].concat(STATUS.map(function (s) { return by.filter(function (x) { return (x.status || STATUS[0]) === s; }).length; })));
  });
  tulis_('Warehouse', w);
}

function pasangJadwal() {
  hapusJadwal();
  ScriptApp.newTrigger('tarikData').timeBased().everyHours(1).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Jadwal aktif: data ditarik tiap jam.');
}

function hapusJadwal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tarikData') ScriptApp.deleteTrigger(t);
  });
}
