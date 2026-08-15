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

## Catatan

- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Tes koneksi mencoba `/v1/models` (standar OpenAI) lalu fallback `/api/tags` (Ollama).
- API Key hanya disimpan di localStorage browser Anda — tidak di-log server.
