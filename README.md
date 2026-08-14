# cangcilung — Asisten AI Gratis (model lokal)

Chatbot AI berbasis web. Chat memakai **model lokal** lewat [llama.cpp](https://github.com/ggml-org/llama.cpp) — tanpa API key, tanpa layanan cloud, gratis, dan privat.

## Arsitektur (disarankan)

`server.mjs` (Node, tanpa dependency) menyajikan aplikasi web **dan** meneruskan `/v1/*` ke backend AI lokal. Karena web + API dari **satu origin** (satu port), tidak ada masalah CORS maupun pemblokiran *Private Network Access* dari browser — akses dari HP pun langsung jalan.

```
Browser (PC/HP) ──> http://<IP-PC>:8080  (server.mjs)
                        ├── / , /app.js, /style.css  → file statis
                        └── /v1/* , /api/*            → proxy ke http://127.0.0.1:11434 (llama.cpp)
```

## Cara menjalankan (Windows, cepat)

1. Pastikan `node` terinstal.
2. Instal `llama.cpp` (menyediakan `llama-server`):
   ```
   winget install ggml.llamacpp
   ```
3. Unduh model (contoh dolphin phi-2 2.7B, ringan & tanpa sensor):
   ```
   https://huggingface.co/TheBloke/dolphin-2_6-phi-2-GGUF/resolve/main/dolphin-2_6-phi-2.Q4_K_M.gguf
   ```
   Simpan mis. di `C:\Users\HP\.ollama-models\`.
4. Jalankan llama-server di port **11434**:
   ```
   llama-server --model "C:\Users\HP\.ollama-models\dolphin-2_6-phi-2.Q4_K_M.gguf" --host 0.0.0.0 --port 11434 --cors-origins * --ctx-size 4096 --threads 6
   ```
5. Jalankan proxy web di port **8080** (dari folder repo):
   ```
   set LLAMA=http://127.0.0.1:11434
   node server.mjs
   ```
6. Buka `http://localhost:8080/` (atau alamat LAN PC dari HP).

> Ada skrip `jalankan-cangcilung.bat` yang menyalakan llama-server + proxy sekaligus lalu membuka Brave.

## Manual (tanpa proxy)

Bisa juga buka `index.html` langsung dan isi **Base URL** di ⚙️ Pengaturan ke alamat server AI (mis. `http://192.168.1.5:11434`). Catatan: akses dari halaman HTTPS (deploy Vercel) ke HTTP lokal dibatasi browser (PNA) — paling praktis pakai proxy di atas.

## Model 18+ / tanpa sensor

Gunakan model keluarga `dolphin`/`uncensored` (mis. `dolphin-2_6-phi-2`) — tidak disensor untuk konten dewasa. Model yang lebih besar butuh RAM/VRAM lebih banyak. Anda bertanggung jawab atas penggunaan hasilnya.

## Deploy ke Vercel (halaman statis saja)

1. Push repo ke GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New → Project** → import repo → **Deploy**.
3. Ada workflow `.github/workflows/deploy-vercel.yml` yang otomatis deploy setiap push ke `main` (butuh secret `VERCEL_TOKEN`).
4. Versi statis tetap membutuhkan Base URL yang bisa dijangkau browser (PNA membatasi HTTPS→HTTP lokal), jadi untuk pemakaian nyata gunakan `server.mjs` lokal.

## Catatan

- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Tes koneksi mencoba `/v1/models` (standar OpenAI) lalu fallback `/api/tags` (Ollama).
- Jika server AI mati, muncul pesan error yang jelas di chat.
