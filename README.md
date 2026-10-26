# juseikr · Jusei INA GO

Website toko **Go K-pop** berbahasa Indonesia, mobile-first, untuk pemesanan barang dari Korea Selatan, China, Jepang, Taiwan, dan Thailand. Customer bisa daftar, melihat katalog, membuat order (dari katalog atau manual), membayar via Transfer/QRIS dengan upload bukti, serta melacak pesanan lewat timeline 7 tahap. Admin mengelola tracking, invoice, pembayaran, produk, isi website, dan rekap.

## Isi proyek

| File | Fungsi |
| --- | --- |
| `index.html` | Seluruh website (satu file: tampilan, logika customer & admin) |
| `logo.jpg` | Logo Jusei INA GO (logo default; admin bisa menggantinya dari panel) |
| `schema.sql` | Tabel, fungsi `is_admin()`, trigger invoice otomatis, RLS, dan bucket Storage Supabase |
| `sheets.gs` | Google Apps Script untuk menarik rekap ke Google Sheets sesuai jadwal |
| `netlify.toml` | Konfigurasi hosting statis Netlify (tanpa build) |

Teknologi: HTML/CSS/JS murni, font Nunito, [Supabase](https://supabase.com) (Auth, Postgres + RLS, Storage) via `supabase-js` v2, hosting gratis di Netlify (logo dioptimalkan lewat Netlify Image CDN).

## Langkah deploy

### 1. Buat proyek Supabase
1. Daftar di supabase.com > **New project** (paket gratis cukup).
2. Buka **SQL Editor > New query**, tempel seluruh isi `schema.sql`, klik **Run**.
3. **Authentication > Sign In / Providers > Email**: pastikan aktif. Bila ingin customer langsung bisa masuk tanpa verifikasi email, matikan *Confirm email*.
4. **Authentication > URL Configuration**: isi *Site URL* dengan alamat Netlify Anda (mis. `https://go-kpop-store.netlify.app`) agar link verifikasi/reset password mengarah ke website.

### 2. Hubungkan website
1. Buka **Project Settings > API** di Supabase.
2. Salin **Project URL** dan kunci **anon public**.
3. Di `index.html`, ganti dua baris berikut:
   ```js
   const SUPABASE_URL = 'https://GANTI-PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'GANTI-ANON-PUBLIC-KEY';
   ```
   > Kunci *anon* memang aman berada di frontend karena semua akses dijaga RLS. **Jangan pernah** memakai kunci `service_role` di `index.html`.

### 3. Deploy ke Netlify
- Push repo ini ke Git yang terhubung ke Netlify (tidak perlu build command; folder publish = root), **atau**
- Seret folder proyek ke **app.netlify.com > Add new site > Deploy manually**.

### 4. Jadikan akun Anda admin
1. Buka website, daftar akun di tab **Akun**.
2. Di Supabase SQL Editor jalankan:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'email-anda@contoh.com';
   ```
3. Muat ulang website — tab **Admin** muncul di navigasi bawah.

### 5. (Opsional) Rekap otomatis ke Google Sheets
1. Buat Google Sheet baru > **Ekstensi > Apps Script**, tempel isi `sheets.gs`, simpan.
2. **Project Settings > Script Properties**, tambahkan: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (akun admin dari langkah 4).
3. Jalankan fungsi `tarikData` sekali dan izinkan akses, lalu jalankan `pasangJadwal` (tarik data tiap jam). Muat ulang Sheet untuk melihat menu **juseikr**.
4. Hasilnya tiga tab: **Orders**, **Rekap**, dan **Warehouse**.

## Alur order

1. Customer membuat order → status **Pesanan Dibuat**; invoice dibuat otomatis oleh database (belum terlihat customer).
2. Admin memperbarui tahap: **Tiba di Gudang** (catatan box + foto) → **Perjalanan ke Indonesia** (foto timbangan) → **Tiba di Gudang Indonesia** (link CO Shopee + foto).
3. Admin menyesuaikan nominal invoice (subtotal + ongkir) lalu menekan **Konfirmasi invoice**, dan memindahkan tahap ke **Menunggu Pembayaran**.
4. Customer melihat nomor invoice, tombol **CO Pack di Shopee** dan **Bayar & Submit Pembayaran** (upload bukti transfer).
5. Admin memeriksa bukti lalu menekan **Verifikasi pembayaran** → otomatis pindah ke **Dalam Pengiriman ke Alamat**, kemudian **Selesai**.

## Keamanan

- Semua data di tabel `kv(col, id, owner, data jsonb)`; admin terdaftar di `admins(user_id)` dan dicek lewat `is_admin()`.
- RLS: produk & isi website bisa dibaca semua orang; order, invoice, ide, dan bukti bayar hanya dibaca pemiliknya dan admin. Customer hanya bisa **membuat** (insert) order baru berstatus awal, ide, dan bukti bayar untuk ordernya sendiri; ubah/hapus hanya admin. Invoice baru terbaca customer setelah dikonfirmasi.
- Storage: bucket `photos` (publik dibaca, hanya admin yang mengunggah) dan `bukti` (privat; customer mengunggah ke folder miliknya, admin melihat lewat signed URL).
- Semua input pengguna di-escape sebelum ditampilkan; link hanya diterima bila `http/https`. Ekspor CSV/Sheets dilindungi dari formula injection.

## Menjalankan lokal

Cukup buka `index.html` lewat server statis apa pun, mis. `npx serve .` atau `netlify dev`. (Logo default memakai Netlify Image CDN; jalankan dengan `netlify dev` agar logo tampil saat lokal.)
