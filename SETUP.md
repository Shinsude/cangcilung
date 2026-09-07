# Setup Supabase Sync — CangCilung Affiliate (AI ML & DL)

Fitur cloud **otomatis aktif** begitu kredensial terisi — tidak ada kode yang perlu diubah.
Tanpa kredensial, seluruh aplikasi tetap berjalan 100% lokal (data di localStorage).

## Sinkronisasi cloud (Supabase)

1. Buat proyek gratis di https://supabase.com
2. Di **SQL Editor → New query**, tempel isi `supabase/schema.sql` lalu **Run**.
   Ini membuat tabel `sessions`, `settings`, `usage` + Row Level Security.
3. **Authentication → Sign In / Providers** → aktifkan **Anonymous sign-ins**.
   (Aktifkan **Email** juga bila ingin menghubungkan email lintas perangkat.)
4. **Database → Realtime** → pastikan tabel `sessions` masuk publikasi (sudah di-set di skema).
5. Salin **Project URL** dan **anon public key** dari **Project Settings → API**.

Lalu di Vercel: **Project → Settings → Environment Variables** tambahkan:

| Nama | Nilai |
|------|-------|
| `SUPABASE_URL` | Project URL Anda |
| `SUPABASE_ANON_KEY` | anon public key |

**Redeploy** setelah menambah env vars.

> Catatan: `api/config.js` membaca dua env var ini dan mengembalikannya ke browser saat runtime (`/api/config`). Karena itu set env vars di Vercel + redeploy, bukan di file.

## Cara pakai

- **Sinkron**: buka aplikasi → ikon **☁️** di header menunjukkan status. Pengguna anonim otomatis tersambung; data lokal diunggah pertama kali. Klik ☁️ untuk status / hubungkan email.
- **Riwayat sesi konsol** & pengaturan disinkronkan lintas perangkat.

> Yang disinkronkan: `settings` (pengaturan), `usage` (pemakaian), `sessions` (riwayat konsol), dan `affproducts` (data produk affiliator). News API key tetap lokal di perangkat.

## Menonaktifkan

Hapus env vars `SUPABASE_URL`/`SUPABASE_ANON_KEY` di Vercel (atau biarkan kosong) lalu redeploy → aplikasi kembali 100% lokal otomatis.