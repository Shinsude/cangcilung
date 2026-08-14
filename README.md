# cangcilung — Asisten AI Gratis (model lokal)

Chatbot AI berbasis web, murni statis (HTML/CSS/JS). Chat memakai **model lokal** lewat [llama.cpp](https://github.com/ggml-org/llama.cpp) — tanpa API key, tanpa layanan cloud, gratis, dan privat. Bisa di-deploy di Vercel atau dibuka langsung di browser.

## Fitur

- Chat sederhana satu tab, jawaban streaming.
- Backend: server API OpenAI-compatible (`/v1/chat/completions`) — kompatibel dengan llama.cpp, Ollama, LM Studio, dan sejenisnya.
- Pengaturan model & alamat server di ⚙️ Pengaturan (tersimpan di browser).
- Riwayat chat tersimpan otomatis di localStorage.

## Menjalankan lokal

1. Instal `llama.cpp` via winget (menyediakan `llama-server`):
   ```
   winget install ggml.llamacpp
   ```
2. Unduh model (contoh dolphin phi-2 2.7B, ringan & tanpa sensor):
   ```
   https://huggingface.co/TheBloke/dolphin-2_6-phi-2-GGUF/resolve/main/dolphin-2_6-phi-2.Q4_K_M.gguf
   ```
   Simpan mis. di `C:\Users\HP\.ollama-models\`.
3. Jalankan server:
   ```
   llama-server --model "C:\Users\HP\.ollama-models\dolphin-2_6-phi-2.Q4_K_M.gguf" --host 0.0.0.0 --port 8080 --cors-origins *
   ```
4. Buka `index.html` di browser (atau `npx serve .`), atau langsung buka situs yang sudah di-deploy.
5. Klik ⚙️ → isi **Model** → **Tes Koneksi** → **Simpan**.

> Model **default tidak disensor** untuk konten dewasa/18+ (mis. keluarga `dolphin`/`uncensored`) — pilih sesuai kebutuhan Anda. Model yang lebih besar butuh RAM/VRAM lebih banyak.

## Akses dari HP / perangkat lain

Server di atas sudah bind `0.0.0.0` sehingga bisa dijangkau perangkat lain di jaringan yang sama. Di ⚙️ isi Base URL dengan alamat LAN PC, mis. `http://192.168.1.5:8080`.

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New → Project** → import repo → **Deploy**.
3. Ada workflow `.github/workflows/deploy-vercel.yml` yang otomatis deploy setiap push ke `main` (butuh secret `VERCEL_TOKEN`).

> Chat ke model lokal hanya jalan dari perangkat yang bisa menjangkau server AI Anda. Versi yang di-deploy di Vercel tetap memanggil Base URL yang Anda set (default `localhost:8080`), jadi untuk akses dari jauh set Base URL ke alamat LAN/server Anda.

## Catatan

- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Tes koneksi mencoba `/v1/models` (standar OpenAI) lalu fallback `/api/tags` (Ollama).
- Jika server AI mati atau CORS tidak diizinkan, muncul pesan error yang jelas di chat.
