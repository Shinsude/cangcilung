# Keamanan — CangCilung (ML & DL Signal Trading)

Cangcilung adalah aplikasi **client-side murni** (HTML/CSS/JS di browser). Semua
perhitungan, ML/DL, dan sinyal berjalan di perangkat pengguna. Tidak ada endpoint
chat/LLM, tidak ada basis pengetahuan (RAG), dan tidak ada *API key* model yang
disimpan.

## Kondisi saat ini

- **Tanpa secret di server.** Tidak ada env var wajib. Opsional:
  `SUPABASE_URL` + `SUPABASE_ANON_KEY` untuk sinkronisasi cloud (keduanya *public-safe*
  oleh desain — anon key Supabase memang untuk publik).
- **News key** (opsional, gnews.io, `/news`) disimpan di `localStorage` perangkat,
  dipakai langsung ke browser dari browser, dan **tidak dikirim ke cloud** (difilter
  di `cloud.js`).
- Semua akses Supabase lewat **Row Level Security** — setiap baris hanya
  dapat dibaca/diubah pemiliknya (`auth.uid()`), termasuk user anonymous.
- Deploy: file `.env.local` berisi `VERCEL_OIDC_TOKEN` untuk CI — **jangan
  di-commit / dibagikan**.

## Batasan inheren (penting)

Karena semua data pengguna ada di perangkat, **XSS atau ekstensi browser jahat**
yang berjalan di halaman ini tetap bisa membaca data & key lokal. Enkripsi lokal
hanya mencegah pencurian pasif, bukan perlindungan dari kode aktif. Jangan pakai
key penting pada jaringan tak terpercaya.

## Sinkronisasi cloud (Supabase)

- Skema & RLS: `supabase/schema.sql` (tabel `sessions`, `settings`, `usage`).
- Autentikasi: **Anonymous sign-ins** (aktifkan di Settings → Auth → Providers),
  opsional link email+password.
- Kunci anon Supabase `SUPABASE_ANON_KEY` **tidak dienkripsi** — itu memang publik;
  jangan pernah meletakkan **service role key** di frontend.

## Rekomendasi praktis

| Tingkat | Aksi |
|---------|------|
| Minimal (sudah berjalan) | Semua lokal; cloud hanya session/settings (RLS). |
| Bagus | Aktifkan HTTPS (Vercel), jangan simpan secret di frontend. |
| Pro | Service-role key hanya di server-helper yang punya rate-limit & autentikasi. |