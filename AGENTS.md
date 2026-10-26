# AGENTS.md

## Ringkasan
Toko Go K-pop "juseikr" (brand Jusei INA GO). Situs statis satu file (`index.html`) dengan backend **Supabase** (permintaan eksplisit pemilik — jangan diganti ke penyedia lain). Hosting di Netlify tanpa build step (`netlify.toml` publish = root).

## Struktur
- `index.html` — CSS, markup shell, dan seluruh JS. Bagian JS berurutan: konfigurasi Supabase → konstanta (`ST` tahap, `NEG` negara, `DEF` isi default) → ikon `IC` (line icon SVG, tanpa emoji) → utilitas (`esc`, `safeUrl`, `rp`) → state `S` → helper data `kv` & `upload` → render (`draw`, `V` view customer, `A` subview admin, `adminOrder`) → aksi `ACT` (delegasi lewat `data-a`/`data-go`).
- `schema.sql` — sumber kebenaran untuk tabel, RLS, trigger `kv_make_invoice` (invoice otomatis saat order masuk), dan bucket Storage. Idempotent.
- `sheets.gs` — Apps Script; login sebagai admin via Supabase Auth (bukan service_role).
- `logo.jpg` — logo hasil crop dari unggahan pemilik (hanya wordmark; pemilik minta tanpa maskot beruang).

## Model data (`kv.col`)
`products` {n,p,c,d,img} · `site` id `main` {title,sub,notice,cara,tnc,payInfo,logo,qris} · `orders` {buyer,email,phone,rcp,hp,addr,ship,pay,shopNo,items[{n,q,p,c,note}],country,status,resi,coLink,at,tl{idx:{note,ph[],at}}} · `invoices` id = order id {no,items,total,ongkir,note,confirmed} · `payments` {oid,path,note,at,verified} · `ideas` {t,d,name,email,at}.

## Konvensi
- Selalu `esc()` setiap nilai dari database/pengguna saat membuat HTML; URL lewat `safeUrl()`.
- Status disimpan sebagai teks dari `ST`; RLS memeriksa `'Pesanan Dibuat'` untuk insert customer — ubah keduanya bersamaan.
- Warna: putih, panel #fff1f7, aksen #ff7fb5, pink muda #ffd6e8, label #d4146f, teks #2a1a22; kartu radius 26px; tombol pil gradasi dengan ikon panah. Dark mode via `data-theme` + `prefers-color-scheme`.
- Bahasa UI: Indonesia santai tapi profesional.
