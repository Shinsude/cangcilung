# cangcilung — Asisten AI Gratis (model lokal)

Chatbot AI berbasis web, murni statis (HTML/CSS/JS). Chat memakai **model lokal** lewat [Ollama](https://ollama.com) — tanpa API key, tanpa layanan cloud, gratis, dan privat. Bisa di-deploy di Vercel atau dibuka langsung di browser.

## Fitur

- Chat sederhana satu tab, jawaban streaming.
- Backend: Ollama endpoint OpenAI-compatible (`/v1/chat/completions`).
- Pengaturan model & alamat server di ⚙️ Pengaturan (tersimpan di browser).
- Riwayat chat tersimpan otomatis di localStorage.

## Menjalankan lokal

1. Instal & jalankan [Ollama](https://ollama.com), lalu tarik model, mis.:
   ```
   ollama pull llama3
   ```
2. Buka `index.html` di browser (atau `npx serve .`).
3. Klik ⚙️ → isi **Model** (contoh `llama3`) → **Tes Koneksi** → **Simpan**.

> Model **default tidak disensor** untuk konten dewasa/18+ (mis. keluarga `dolphin`/`uncensored`) — pilih sesuai kebutuhan Anda.

## Akses dari HP / perangkat lain

Agar server Ollama di PC bisa dipanggil browser dari perangkat lain:

```
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve
```

Lalu di ⚙️ isi Base URL dengan alamat LAN PC, mis. `http://192.168.1.5:11434`.

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New → Project** → import repo → **Deploy**.
3. Ada workflow `.github/workflows/deploy-vercel.yml` yang otomatis deploy setiap push ke `main` (butuh secret `VERCEL_TOKEN`).

> Chat ke model lokal hanya jalan dari perangkat yang bisa menjangkau server Ollama. Versi yang di-deploy di Vercel tetap memanggil Base URL yang Anda set (default `localhost:11434`), jadi untuk akses dari jauh set Base URL ke alamat LAN/server Ollama Anda.

## Catatan

- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Jika Ollama mati atau CORS tidak diizinkan, muncul pesan error yang jelas di chat.
