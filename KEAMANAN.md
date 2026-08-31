# Keamanan API Key — cangcilung

Cangcilung adalah aplikasi **client-side murni** (HTML/CSS/JS di browser). Ini punya implikasi keamanan yang penting untuk dipahami.

## Kondisi saat ini

- **Groq / OpenRouter / Jina API key** disimpan di perangkat pengguna, bukan di server.
- Key **di-enkripsi AES-GCM** (kunci di IndexedDB) sebelum disimpan di `localStorage` — melindungi dari pembacaan pasif file, tapi bukan dari skrip yang berjalan di halaman.
- Sejak perbaikan terakhir, key **tidak dikirim** ke endpoint HTTP publik (hanya HTTPS / localhost) lewat `isSecureServer()` di `app.js`.
- API key model **tidak pernah dikirim ke cloud** (disaring di `cloud.js` → `cloudSettings()`).

## Batasan Inheren (penting)

Karena key & kunci dekripsi sama-sama berada di perangkat pengguna, **XSS atau ekstensi browser jahat yang berjalan di halaman ini tetap bisa membaca key**. Ini **tidak bisa** diperbaiki sepenuhnya dalam aplikasi client-side murni — enkripsi di sini adalah *obfuscation* untuk mencegah pencurian pasif, bukan perlindungan dari kode aktif.

## Solusi penuh (butuh backend / proxy)

Untuk benar-benar mengamankan key agar **tidak pernah sampai ke browser**, butuh server perantara (proxy). Opsi:

1. **Vercel Serverless proxy** (paling ringan)
   - Tambah endpoint API (mis. `/api/chat`) di Vercel yang:
     - menyimpan `GROQ_API_KEY` di **Environment Variables** (Vercel) — bukan di browser;
     - menerima chat dari browser, menambah key di server, memanggil Groq, mengembalikan respons.
   - Browser hanya memakai endpoint itu, key **tidak pernah** di-bundle ke frontend.
   - Supabase sync & RAG sudah mengikuti pola ini (`api/config.js` memakai env vars server-side).

2. **Backend mandiri** (Node/Go/Python)
   - Endpoint `/v1/chat/completions` yang mem-forward ke provider, key di server.
   - Browser mengarahkan Base URL ke endpoint ini (di ⚙️ pengaturan).

3. **OIDC / token sementara**
   - Untuk CI/deploy, pakai Vercel OIDC token (`action/oidc`) dengan "Trusted Organizations", hindari token panjang-lama di secret.

## Rekomendasi praktis

| Tingkat | Aksi |
|---------|------|
| Minimal (sudah berjalan) | Key dienkripsi lokal + hanya HTTPS + tidak ke cloud. |
| Bagus | Gunakan endpoint proxy Vercel (opsi 1) supaya key tak pernah di browser. |
| Pro | Backend mandiri + rate-limit per pengguna + autentikasi. |

> Catatan: selama key tetap disimpan di perangkat (mode default), ingatkan pengguna untuk tidak memakai key pada jaringan tak terpercaya dan anggap key bisa bocor jika ada skrip jahat — ganti key secara berkala.
