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
- **Basis pengetahuan** (📚): simpan dokumen teks ke cloud, otomatis di-embed & di-chunk. Saat chat, cangcilung mengambil potongan relevan (RAG) dari dokumen tersimpan untuk jawaban lebih akurat.
- **Analisis trading XAUUSD** (📶): TA lengkap, backtest + walk-forward OOS + **Monte Carlo/stress-test**, live signal dengan notifikasi browser, alert harga, ukuran posisi. Lihat bagian "Analisis Trading" di bawah.
- **Machine Learning di browser** (/ml): neural network (TensorFlow.js / fallback JS murni) deterministik & persisten untuk prediksi arah harga emas, dengan validasi out-of-sample yang jujur.

## Pakai langsung (Groq — default)

1. Buka `https://cangcilung.vercel.app` (atau `index.html` lokal).
2. Klik ⚙️ → buat API Key gratis di `https://console.groq.com/keys` → isi **API Key**.
3. Isi **Model** (default sudah paling pas):
   - `openai/gpt-oss-120b` — **default**, gratis, cepat & cerdas.
   - `qwen/qwen3.6-27b`, `openai/gpt-oss-20b` — alternatif gratis.
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

## Basis pengetahuan (opsional, RAG via pgvector)

Fitur menyimpan dokumen teks ke cloud Supabase, di-embed menjadi vektor, lalu diambil secara otomatis saat chat (Retrieval-Augmented Generation).

### Syarat

1. **Supabase project** harus sudah aktif (lihat bagian "Sinkronisasi cloud" di atas), termasuk env vars `SUPABASE_URL` + `SUPABASE_ANON_KEY` di Vercel.
2. Jalankan `supabase/schema.sql` — skema ini membuat tabel `documents`, `chunks` (dengan kolom `vector(1024)`), fungsi RPC `match_chunks`, dan indeks HNSW.
3. **Provider embedding**: cangcilung menggunakan API standar OpenAI-compatible (`/v1/embeddings`). Default: [Jina AI](https://jina.ai/embeddings/) (`jina-embeddings-v3`, 1024-dim, multilingual, ada paket gratis).

### Setup embedding

1. Daftar gratis di [jina.ai](https://jina.ai) → buat API key.
2. Buka cangcilung → ⚙️ **Pengaturan** → scroll ke bagian **Basis pengetahuan**.
3. Isi:
   - **Embed Base URL** = `https://api.jina.ai/v1` (default sudah benar)
   - **Embed Key** = API key Jina Anda (hanya disimpan lokal, tidak dikirim ke cloud)
   - **Embed Model** = `jina-embeddings-v3` (default)
4. **Simpan**.

> Provider lain yang kompatibel (OpenAI, Cohere, dll) juga bisa — isi URL base + key + nama model yang mendukung `/v1/embeddings`. Dimensi harus ≤ 1024.

### Cara pakai

1. Lampirkan file teks (📎) → tombol **💾 Simpan** muncul di chip lampiran → klik untuk menyimpan ke basis pengetahuan.
2. Setelah tersimpan, cangcilung otomatis mengambil potongan relevan dari dokumen saat Anda bertanya tentang isinya.
3. Buka modal pengetahuan (📚 di menu tools) untuk melihat daftar dokumen tersimpan atau menghapus dokumen.

## Analisis Trading — Khusus XAUUSD (Emas)

Cangcilung punya mesin analisis trading terintegrasi. **Semua perintah trading otomatis dipaksa ke XAUUSD** (emas): ketik simbol lain, perintah tetap memakai emas. Semua perhitungan berjalan **di browser Anda** (data historis dari Yahoo Finance via proxy Vercel, hingga **10 tahun** untuk data harian).

> ⚠️ Edukasi & simulasi, **bukan saran investasi**. Data hanya dari pasar historis; biaya spread/komisi tidak otomatis — perhitungkan dengan `cost:N`.

### Perintah analisis

| Perintah | Fungsi |
|---|---|
| `/ta XAUUSD` | Analisis teknikal lengkap: trend %, bias, RSI, support/resistance, kecepatan |
| `/rekomendasi XAUUSD` | Keputusan BUY / SELL / WAIT + entry, TP, SL |
| `/rsi XAUUSD` · `/structure XAUUSD` · `/structure-mtf` | Indikator RSI, struktur market, struktur multi-timeframe |
| `/risk XAUUSD 10000 1` | Ukuran posisi: lot berdasarkan risk % di akun |
| `/corr XAUUSD` | Korelasi emas vs DXY & aset lain |
| `/profile XAUUSD 1d` | Volume profile (harga yang paling banyak ditransaksikan) |
| `/backtest XAUUSD adaptive 14:70:30 cost:0.5` | Simulasi strategi historis + Sharpe + heatmap + **Monte Carlo & stress-test otomatis** |
| `/backtest XAUUSD rsi oos` | Validasi **walk-forward out-of-sample** (anti-overfitting) + Monte Carlo OOS |
| `/sinyal XAUUSD rsi` | **Live signal** BUY/SELL — polling tiap 60 detik, notifikasi browser + suara + toast |
| `/sinyal-list` · `/sinyal-history` · `/sinyal-del <id>` · `/sinyal-clear` · `/sinyal-test` | Kelola live signal, riwayat, dan uji notifikasi |
| `/ml XAUUSD` | Latih **neural network di browser** → prediksi arah harga + laporan validasi OOS |
| `/ml-signal XAUUSD adaptive` | Prediksi arah ML + probabilitas benar dari sinyal TA saat ini |
| `/alert XAUUSD 2400` | Alert harga (polling tiap menit) |
| `/news XAUUSD` | Sentimen berita |

Strategi didukung: `rsi`, `bb`, `sma`, `ema`, `vwap`, `ma`, `smc`, `cvd`, `all`, dan **`adaptive`** (otomatis memilih strategi terbaik sesuai kondisi pasar — default).

### Machine Learning (/ml, /ml-signal)

- **Neural network 2-hidden-layer** ditambah logistic regression sebagai pembanding. Engine utama **TensorFlow.js** (dimuat dari CDN); bila offline/error, otomatis fallback ke implementasi murni JS (`engine:vanilla`).
- **16 fitur teknikal tanpa lookahead** (RSI, MACD, ATR, trend, momentum, dll), data di-split **kronologis** 70/30 → metrik OOS yang jujur.
- **Deterministik**: seed `42` default → hasil training **identik** antar pemanggilan (fix ketidakpastian ML). Ganti dengan `seed:N`.
- **Persisten**: model vanilla otomatis **disimpan di localStorage**; pemanggilan ulang memakai cache (instan, tanpa training ulang — ditandai ⚡ di output). Cache divalidasi integritasnya & dibersihkan otomatis saat kuota penuh.
- **UI anti-freeze**: training di-chunk per epoch — halaman tetap responsif, progres tampil di status.
- Opsi: `engine:tfjs|vanilla` · `horizon:N` (default 3) · `epochs:N` · `seed:N`. Butuh ≥ **150 bar** data harian.

### Validasi anti-overfitting

- **Walk-forward OOS** (`/backtest ... oos`): data terbaru dipakai sebagai uji (tidak "dilihat" saat parameter dipilih); laporan membandingkan seluruh sampel vs OOS.
- **Monte Carlo** otomatis di setiap backtest: 2000 simulasi bootstrap ulang urutan trade → distribusi hasil (P05/P50/P95), probabilitas rugi total, verdict. **Stress-test** drawdown ekstrem & losing streak terpanjang — menyingkap apakah strategi menang karena kebetulan urutan.
- **Sharpe ratio** + heatmap profitabilitas per hari/jam.

## Catatan

- Arsitektur: semuanya statis (tanpa server backend) — `index.html` memuat `lib/mantra.js` (prompt & skill), `lib/ta.js` (indikator/backtest/Monte Carlo/live signal), `lib/ml.js` (feature engineering + training + cache model), `app.js` (routing perintah, panel UI, polling). Tes regresi: `node test/run-tests.cjs` (harness sintetis + integrasi data real via proxy).
- Persona bot diatur lewat konstanta `SYSTEM` & `PERSONAS` di `app.js`; tema di `body[data-theme]` di `style.css`.
- Tes koneksi mencoba `/v1/models` (standar OpenAI) lalu fallback `/api/tags` (Ollama).
- API Key hanya disimpan di localStorage browser Anda — tidak di-log server.
