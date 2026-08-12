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

## Catatan

- Percakapan pertama akan memunculkan pop-up masuk akun Puter — buat akun gratis sekali, selesai.
- Ada tombol saran pertanyaan (*starter prompts*) di layar pertama untuk memudahkan pengguna baru.
- Pengetahuan khusus bot disimpan di `knowledge.js` (mis. info tentang tcip.asia).
- Persona bot diatur lewat konstanta `SYSTEM` di `app.js`.
- Model bisa diganti lewat konstanta `MODEL` di `app.js` (mis. `gpt-4o-mini`, `claude-...`, `gemini-...`).
- Nama aplikasi (cangcilung) bisa diganti di `index.html`.
