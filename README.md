# cangcilung — Asisten AI Gratis

Chatbot AI berbasis web (HTML/CSS/JS murni, satu tab, jawaban streaming). Backend memakai **OpenRouter** — satu API untuk ratusan model, banyak yang **gratis**, tanpa kartu kredit. Bisa juga diarahkan ke server AI lokal (Ollama/llama.cpp).

## Fitur

- Chat sederhana satu tab, jawaban streaming.
- Pengaturan di ⚙️: Base URL, API Key, dan Model (tersimpan di localStorage browser).
- Riwayat chat tersimpan otomatis di localStorage.

## Pakai langsung (OpenRouter)

1. Buka `https://cangcilung.vercel.app` (atau `index.html` lokal).
2. Klik ⚙️ → buat API Key di `https://openrouter.ai/keys` → isi **API Key**.
3. Isi **Model** — disarankan:
   - `nvidia/nemotron-3-nano-30b-a3b:free` — paling cepat & gratis.
   - `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3-ultra-550b-a55b:free` — gratis, kualitas tinggi.
   - `openrouter/free` — auto-pilih model gratis.
   - `sao10k/l3-lunaris-8b`, `gryphe/mythomax-l2-13b` — 18+/tanpa sensor, berbayar sangat murah (~Rp 1.000/juta token).
4. **Tes Koneksi** → **Simpan** → chat.

> Model gratis (`:free`) dibatasi sekitar 20 permintaan/menit dan bisa berubah sewaktu-waktu. Daftar model & harga: `openrouter.ai/models`. Untuk jaminan & throughput, bisa pakai model berbayar (sangat murah per juta token).

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

## Catatan

- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Tes koneksi mencoba `/v1/models` (standar OpenAI) lalu fallback `/api/tags` (Ollama).
- API Key hanya disimpan di localStorage browser Anda — tidak di-log server.
