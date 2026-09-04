# RAG / Supabase — Panduan Aktivasi

Fitur **Basis Pengetahuan (RAG permanen)** dan **sinkronisasi cloud** butuh beberapa akun eksternal yang TIDAK bisa disiapkan lewat kode. Ikuti langkah ini sekali saja.

> Apa yang sudah otomatis didukung oleh kode:
> - Kode embedding (Jina) di `kb.js` & `app.js` ✅
> - Skema database + fungsi pencarian `match_chunks` → `supabase/schema.sql` ✅
> - Pembacaan kredensial Supabase dari Vercel env (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) ✅
> - Dimensi embedding 1024 cocok dengan `vector(1024)` di skema ✅

Kamu hanya perlu: **1 akun Jina** + **2 langkah di dashboard Supabase**.

---

## 1. Buat API Key Jina (gratis)

Embedding dipakai untuk mengubah dokumen & pertanyaan menjadi vektor supaya bisa dicari secara semantik.

1. Buka `https://jina.ai` → klik **Sign up** (paling cepat pakai login Google/GitHub).
2. Setelah masuk, buka dashboard → **API Keys** (atau `https://jina.ai/ai/api-keys`).
3. Klik **Create new API key** → salin key (format `jina_...`).
   - Tersedia kuota gratis (±1 juta token) untuk `jina-embeddings-v3`.
4. Simpan key ini — kamu tempel di pengaturan CangCilung (langkah 4 bawah).

> Keamanan: key ini TERSIMPAN DI BROWSER MU saja (lihat `index.html` — "Tersimpan di browser saja, tidak dikirim ke cloud").

---

## 2. Supabase — Jalankan Skema Database

Skema (tabel + Row Level Security + fungsi pencarian) sudah disiapkan di repo.

1. Buka dashboard Supabase proyekmu → **SQL Editor** → **New query**.
2. Salin **seluruh** isi file `supabase/schema.sql` (buka file ini di proyek), tempel ke editor.
3. Klik **Run**.
   - Seharusnya berhasil (tabel `sessions`, `settings`, `usage`, `documents`, `chunks` + fungsi `match_chunks`).

> Tidak perlu ceklis tabel di supabase.com/dashboard — karena keluarkan command CREATE + RLS, tabel sudah dibuat lewat SQL Editor.

---

## 3. Supabase — Aktifkan Anonymous Sign-In

App memakai login anonim default (`anon key`) — ceklis ini harus diaktifkan agar RLS `auth.uid()` bekerja.

1. Dashboard Supabase → **Authentication** → **Sign In / Providers** (kiri).
2. Cari **Anonymous** (di bagian bawah daftar provider) → **Edit** → nyalakan toggle **Enable Anonymous sign-ins** → **Save**.
3. (Opsional) **Authentication → URL Configuration** — biarkan `Site URL` mengarah ke `https://cangcilung.vercel.app`.

---

## 4. Aktifkan di Aplikasi (browser)

1. Buka `https://cangcilung.vercel.app` → **hard refresh** (`Ctrl+Shift+R`).
2. Buka ⚙️ **Pengaturan** → panel **Basis pengetahuan (RAG permanen)**.
3. **Embedding API Key** → tempel key Jina mu.
4. Klik **Simpan** (panel sinkronisasi cloud akan otomatis connect ke Supabase).

---

## 5. Tes

- **Simpan dokumen:** lampirkan file (📎) atau tempel teks, lalu minta *"simpan ke basis pengetahuan"* (atau pakai tombol simpan dokumen).
- **Tanya berbasis dokumen:** ketik pertanyaan yang jawabannya ada di dokumen yang disimpan — seharusnya dijawab memakai konten itu (bukan jawaban umum).

---

## Kalau Ada Kendala

| Gejala | Penyebab / Solusi |
|--------|--------------------|
| "Anonymous sign-in belum diaktifkan" | Belum nyalakan toggle Anonymous di langkah 3. |
| `PGRST` / "function match_chunks does not exist" | Skema belum di-Run, atau error saat Run di langkah 2. |
| Embedding gagal / 401 | Key Jina salah/kedaluwarsa di langkah 4. |
| Cloud connect "off" | `SUPABASE_URL` / anon key belum ter-set di env Vercel → set di Vercel Project Settings → Environment Variables, lalu redeploy. |

> Semua kunci hanya ada di browser/side-server, tidak pernah di-commit ke Git. Jangan taruh `sb_secret_...` atau key apa pun ke file repo.
