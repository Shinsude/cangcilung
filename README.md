# cangcilung — Asisten AI Gratis

Chatbot AI berbasis web (HTML/CSS/JS murni, satu tab, jawaban streaming). Backend memakai **Groq** (gratis, sangat cepat, kuota harian besar) — satu API untuk model Llama/GPT-OSS/Qwen. Bisa juga diarahkan ke OpenRouter atau server AI lokal (Ollama/llama.cpp).

## Fitur

- Chat sederhana satu tab, jawaban streaming.
- Pengaturan di ⚙️: Base URL, API Key, Model, dan Model Analisis (tersimpan di localStorage browser).
- Riwayat chat tersimpan otomatis di localStorage (hingga 200 pesan).
- **Memori panjang**: percakapan lama otomatis diringkas oleh model, jadi obrolan panjang tetap konsisten konteksnya.
- **Lampirkan file** (📎): analisa `.txt`, `.md`, `.csv`, `.json`, `.log`, `.pdf`, `.xlsx`, `.docx` — dibaca di browser, tidak diunggah ke server. File besar dipilah pintar (hanya bagian relevan yang dikirim).
- **Analisa gambar** (📎 gambar): upload `.png/.jpg/.webp`, cangcilung jelaskan isinya (via model vision gratis).
- **Cari di web** (🌐): ambil info terkini dari Wikipedia. **Otomatis** aktif untuk pertanyaan berita/terkini/pemilu/harga.
- **Suara** (🎤): bicara untuk mengetik; **🔊** membacakan jawaban (Web Speech API browser, tanpa biaya).
- **Saran pertanyaan** (💡): usulkan 3 pertanyaan lanjutan yang bisa diklik.
- **Router cerdas**: soal hitung/logika/kode otomatis dikirim ke model analisis (default `openai/gpt-oss-120b`).
- **Kalkulator internal**: ekspresi matematika (mis. `15*24+7`) dihitung pasti oleh kode.
- **Penghitung pemakaian**: tampil jumlah permintaan hari ini di header.
- Auto-fallback: bila model utama kena rate-limit/gagal, otomatis coba model cadangan.
- **Multi-obrolan** (💬): buat/ganti/rename/hapus percakapan, riwayat terpisah per sesi.
- **Mode persona** (🎭): 5 gaya — Seimbang, Guru, Teman, Bos, Kode (bisa diganti di ⚙️).
- **Eksekusi kode**: jawaban berisi blok JS diberi tombol ▶ Jalankan (jalan di sandbox Web Worker, tidak menyentuh komputer).
- **Verifikasi mandiri**: jawaban soal hitung/logika dicek ulang oleh model pemeriksa; koreksi muncul otomatis bila salah.
- **Ekspor percakapan** (⬇️): unduh riwayat sebagai file `.txt`.
- **PWA**: bisa diinstall dari browser & berjalan saat offline (setelah halaman dibuka sekali).
- **Syntax highlight + tabel rapi**: kode berwarna (highlight.js) dan tabel Markdown tampil rapi.
- **Salin & ulangi** (📋/🔁): salin jawaban sekali klik, atau minta jawaban ulang bila kurang pas.
- **Hentikan jawaban** (⏹): tombol kirim berubah jadi stop saat streaming.
- **Terjemahan** (🔄): mode penerjemah id↔en — ketik teks, jawabannya langsung terjemahan.
- **Ringkas file** (🧾): setelah upload file, tombol ringkas isi file jadi poin-poin.
- **Tema** (🌙): gelap / terang / ungu.
- **Edit pesan** (✏️): perbaiki pesan yang sudah dikirim, jawaban dihitung ulang.
- **Cari percakapan** (🔍): temukan & lompat ke pesan lama, dengan highlight.
- **Judul otomatis**: sesi diberi nama dari pesan pertama.
- **Waktu pesan**: tiap balasan diberi cap waktu.
- **Drag & drop file**: seret file ke jendela untuk melampirkan.
- **Lampirkan URL** (🔗): tempel URL artikel, isinya diambil & bisa diringkas. URL Wikipedia diproses lewat API resminya (anti-CORS); situs lain dicoba langsung lalu lewat proxy bila diblokir browser.
- **Export 3 format**: teks (.txt), Markdown (.md), JSON mentah.
- **Pilih suara 🔊**: ganti nada suara pembaca jawaban di ⚙️.
- **Statistik** (📊): jumlah pesan, kata paling sering, rata-rata panjang.
- **Semat pesan** (📌): tandai pesan penting, lihat di panel terpisah.
- **Cadangkan data** (💾): unduh/pulihkan semua percakapan & pengaturan (pindah perangkat).
- **Ganti model cepat** (⚡): dropdown model langsung dari header.
- **Ukuran teks** (↕️): kecil / normal / besar.
- **Bunyi selesai** (🔔): nada saat jawaban selesai.
- **Auto-scroll pintar**: berhenti mengikuti saat Anda menggulir ke atas, tombol ⬇️ untuk kembali ke bawah.
- **Penghitung input**: jumlah karakter & kata di bawah kotak ketik.

## Pakai langsung (Groq — default)

1. Buka `https://cangcilung.vercel.app` (atau `index.html` lokal).
2. Klik ⚙️ → buat API Key gratis di `https://console.groq.com/keys` → isi **API Key**.
3. Isi **Model** (default sudah paling pas):
   - `llama-3.3-70b-versatile` — **default**, gratis, cepat & cerdas.
   - `openai/gpt-oss-120b`, `qwen/qwen3.6-27b`, `openai/gpt-oss-20b` — alternatif gratis.
4. **Tes Koneksi** → **Simpan** → chat.

> Base URL Groq: `https://api.groq.com/openai/v1`. Kuota gratis Groq cukup besar (ribuan permintaan/hari). Daftar model & limit: `console.groq.com/docs/rate-limits`.

## Alternatif: OpenRouter

1. Base URL = `https://openrouter.ai/api/v1`, key di `https://openrouter.ai/keys`.
2. Model `:free` gratis tapi dibatasi ±50 permintaan/hari; ada juga model 18+/tanpa sensor (mis. `sao10k/l3-lunaris-8b`) yang berbayar sangat murah (±Rp 700/juta token).

## Memakai server lokal

1. Pasang Ollama (`winget install Ollama.Ollama`) atau llama.cpp (`winget install ggml.llamacpp`).
2. `ollama pull dolphin-2_6-phi-2` (atau model lain).
3. Pastikan server berjalan & CORS diizinkan (llama.cpp: `--cors-origins *`).
4. Di ⚙️ isi **Base URL** = `http://localhost:11434` (atau alamat LAN), biarkan **API Key** kosong.

> Catatan: browser membatasi akses halaman HTTPS → server HTTP lokal (Private Network Access). Paling mulus: buka `index.html` langsung dari file, atau akses lewat proxy satu-origin.

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New → Project** → import repo → **Deploy**.
3. Ada workflow `.github/workflows/deploy-vercel.yml` yang otomatis deploy setiap push ke `main` (butuh secret `VERCEL_TOKEN`).

## Sinkronisasi cloud (opsional, Supabase)

Tanpa konfigurasi, cangcilung berjalan 100% lokal (data di localStorage). Untuk menyinkronkan riwayat lintas perangkat, hubungkan Supabase:

1. Buat proyek di [supabase.com](https://supabase.com) (gratis).
2. **SQL Editor → New query** → jalankan isi `supabase/schema.sql` (membuat tabel `sessions`, `settings`, `usage` + Row Level Security).
3. **Auth → Sign In / Providers** → aktifkan **Anonymous sign-ins** (dan pastikan **Email** aktif bila mau menghubungkan email).
4. **Database → Realtime** → pastikan tabel `sessions` masuk publikasi realtime (sudah di-set di skema).
5. Salin **Project URL** dan **anon public key** dari **Settings → API**.
6. Di Vercel → proyek `cangcilung` → **Settings → Environment Variables**: isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`, lalu **redeploy**.
7. Buka aplikasi → ikon ☁️ di header menampilkan status sinkron. Klik untuk melihat status / menghubungkan email.

Setelah aktif: pengguna tersambung **anonim** otomatis, data lokal diunggah saat pertama kali. Menghubungkan email membuat akun tetap tersedia di perangkat lain. **API Key model tidak pernah dikirim ke cloud** (khususnya Groq key tetap di perangkat Anda).

## Catatan

- Persona bot diatur lewat konstanta `SYSTEM` & `PERSONAS` di `app.js`; tema di `body[data-theme]` di `style.css`.
- Tes koneksi mencoba `/v1/models` (standar OpenAI) lalu fallback `/api/tags` (Ollama).
- API Key hanya disimpan di localStorage browser Anda — tidak di-log server.
