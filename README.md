# cangcilung — Asisten AI Gratis

Asisten AI chatbot berbasis web seperti DOLA / tcip.asia.

- 100% gratis untuk pengembang, **tanpa API key**.
- Chat memakai [Puter.js](https://developer.puter.com) (GPT-4o-mini & model AI lain).
- Pemakai cukup masuk akun Puter **gratis** sekali pada percakapan pertama.
- Murni statis (HTML/CSS/JS) — bisa dibuka langsung atau di-deploy di **Vercel**.

## Fitur

### Chat (tab 💬)
- Chat umum dengan AI (bahasa Indonesia).
- **`gambar: <deskripsi>`** — membuat gambar dengan AI (Puter `txt2img`, gratis).
- **`cari: <topik>`** — mencari info dari web (Wikipedia API) lalu dirangkum AI.
- **`analisa <coin> <interval>`** — grafik candlestick real-time dari Binance (mis. `analisa BTC 4h`) lengkap dengan indikator RSI, MACD, SMA, serta level support/resistance.
- **📎 Lampirkan file** — unggah gambar (dianalisis AI), PDF (teks diekstrak & dirangkum), atau file teks (.txt/.md/.csv/.json) langsung di chat.
- Riwayat chat tersimpan otomatis di browser (localStorage).

### Status (tab ⚙️)
- System Analysis: status layanan AI (Puter), Binance, dan localStorage.

### API sendiri (opsional)
- Di **⚙️ Pengaturan** ada opsi "API sendiri": pakai endpoint OpenAI-compatible (chat + gambar) atau **Stable Diffusion WebUI (A1111)** untuk gambar lokal tanpa filter layanan.
- Untuk A1111: isi Base URL (mis. `http://127.0.0.1:7860`), API Key kosong jika tanpa `--api-auth`. Jalankan A1111 dengan `--api --cors-allow-origins <domain-situs>` agar browser boleh memanggilnya. Saat jenis A1111 dipilih, chat tetap lewat Puter.

## Cara menjalankan

**Lokal:** buka `index.html` di browser, atau jalankan server statis:

```
npx serve .
```

**Deploy ke Vercel:**

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com), klik **Add New → Project**.
3. Import repo GitHub kamu → **Deploy**. Selesai.

## Pantauan 24/7 sinyal tcip.asia

Bot bisa menjawab "ada sinyal baru dari tcip.asia?" memakai data yang dipantau berkala otomatis — **tanpa perlu daftar layanan tambahan**:

- **`scripts/tcip-monitor.mjs`** — mengambil sinyal dari `https://api.tcip.asia/public/dashboard`, lalu menyimpan ke `tcip-data/` (`tcip-latest.json`, `tcip-history.json`, `tcip-status.json`).
- **`.github/workflows/monitor-tcip.yml`** — GitHub Actions menjalankan pemantau tiap **10 menit** (jadwal UTC) dan meng-commit data jika ada perubahan. Repo publik → gratis & tanpa batas menit.
- Bot membaca data langsung dari file JSON di repo ini (tanpa server tambahan):
  - `https://raw.githubusercontent.com/Shinsude/cangcilung/main/tcip-data/tcip-latest.json` — sinyal terakhir (atau `null` jika belum ada).
  - `https://raw.githubusercontent.com/Shinsude/cangcilung/main/tcip-data/tcip-status.json` — status pantauan (online/offline).
  - `https://raw.githubusercontent.com/Shinsude/cangcilung/main/tcip-data/tcip-history.json` — riwayat sinyal (terbaru duluan, maks 60).
  - (`api/tcip-latest.js` adalah endpoint Vercel opsional yang merangkai data di atas; di proyek Vercel yang mengaktifkan **Vercel Authentication/SSO**, endpoint itu hanya bisa diakses setelah login — pakai URL raw GitHub di atas agar bebas proteksi.)
- Di chat, ketik mis. **"sinyal tcip.asia"** atau **"ada sinyal baru?"** untuk hasil terbaru.

> Catatan: saat `api.tcip.asia` sedang offline (mis. HTTP 502), status pantauan tercatat OFFLINE dan bot akan memberitahu pengguna.
> GitHub Actions menonaktifkan workflow otomatis jika repo tidak ada aktivitas selama 60 hari — commit dari pemantau ini termasuk aktivitas, jadi aman selama ada data; jika terlanjur ter-disable, jalankan ulang dari tab Actions → **Run workflow**.

## Catatan

- Percakapan pertama akan memunculkan pop-up masuk akun Puter — buat akun gratis sekali, selesai.
- Ada tombol saran pertanyaan (*starter prompts*) di layar pertama untuk memudahkan pengguna baru.
- Pengetahuan khusus bot disimpan di `knowledge.js` (mis. info tentang tcip.asia).
- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Model bisa diganti lewat konstanta `MODEL` di `app.js` (mis. `gpt-4o-mini`, `claude-...`, `gemini-...`).
- Nama aplikasi (cangcilung) bisa diganti di `index.html`.
