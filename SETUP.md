# Setup Supabase Sync & Basis Pengetahuan (RAG) — cangcilung

Fitur cloud **otomatis aktif** begitu kredensial terisi — tidak ada kode yang perlu diubah.
Tanpa kredensial, seluruh aplikasi tetap berjalan 100% lokal (data di localStorage).

Ikuti 3 bagian berikut urut. ApiKey model **tidak pernah** dikirim ke cloud (disaring di `cloud.js`).

---

## Bagian 1 — Sinkronisasi cloud (Supabase)

1. Buat proyek gratis di https://supabase.com
2. Di **SQL Editor → New query**, tempel isi `supabase/schema.sql` lalu **Run**.
   Ini membuat tabel `sessions`, `settings`, `usage`, `documents`, `chunks` + Row Level Security + fungsi RPC `match_chunks`.
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

---

## Bagian 2 — Basis pengetahuan (RAG, embedding)

1. Daftar gratis di https://jina.ai → buat **API key** (embeddings `jina-embeddings-v3`, 1024-dim, multilingual).
2. Buka cangcilung → ⚙️ **Pengaturan** → scroll ke **Basis pengetahuan** → isi:
   - **Embed Base URL** = `https://api.jina.ai/v1` (default)
   - **Embed Key** = API key Jina Anda
   - **Embed Model** = `jina-embeddings-v3` (default)
3. **Simpan**.

> Key Jina hanya disimpan lokal di perangkat, tidak dikirim ke cloud.

Provider embedding lain yang kompatibel OpenAI `/v1/embeddings` juga bisa dipakai — isi URL base + key + nama modelnya (dimensi ≤ 1024).

---

## Bagian 3 — Cara pakai

- **Sinkron**: buka aplikasi → ikon **☁️** di header menunjukkan status. Pengguna anonim otomatis tersambung; data lokal diunggah pertama kali. Klik ☁️ untuk status / hubungkan email.
- **RAG**: lampirkan file teks (**📎**) → tombol **💾 Simpan** muncul di chip → klik untuk menyimpan ke basis pengetahuan. Saat tanya tentang isinya, cangcilung otomatis mengambil potongan relevan.
- Kelola / hapus dokumen lewat **📚** di menu tools.

---

## Menonaktifkan

Hapus env vars `SUPABASE_URL`/`SUPABASE_ANON_KEY` di Vercel (atau biarkan kosong) lalu redeploy → aplikasi kembali 100% lokal otomatis.
