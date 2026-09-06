# CangCilung — ML & DL Signal Trading

Platform analisis & sinyal trading berbasis web (HTML/CSS/JS murni, satu tab) yang memadukan **analisis teknikal (TA)** dengan **machine learning & deep learning** — khusus **XAUUSD** (emas), plus USA100, NDX, US30, DXY, dan lain-lain.

> ⚠️ Edukasi & simulasi, **bukan saran investasi**. Seluruh data dari pasar historis. Fitur chat/LLM telah dihapus — aplikasi ini murni konsol perintah trading.

## Fitur

- **Konsol perintah trading**: semua interaksi lewat perintah `/...` di kotak input (Enter untuk kirim).
- **Analisis teknikal lengkap**: trend, RSI, support/resistance, struktur market (MTF), volume profile, korelasi antar aset, manajemen risiko.
- **Live Signal** (📶): signal BUY/SELL real-time XAUUSD dengan polling otomatis + notifikasi browser, suara & toast — jujur saat market tutup (disebut *pratayang*/MENUNGGU bila data basi).
- **Backtest + anti-overfit**: backtest historis (banyak strategi: `rsi`, `bb`, `sma`, `ema`, `vwap`, `ma`, `smc`, `cvd`, `all`, `adaptive`), walk-forward out-of-sample, **Monte Carlo/stress-test**, Sharpe ratio, heatmap profit per hari/jam, biaya realistis per sesi pasar (`costModel:session`).
- **Machine Learning & Deep Learning di browser** (`/ml`): neural network deterministik (seed 42) + logistic regression, 16 fitur teknikal tanpa lookahead, split kronologis 70/30, validasi OOS jujur, cache model di localStorage (instan saat dipanggil ulang), anti-freeze (training di-chunk). Engine TensorFlow.js atau fallback murni JS (`engine:vanilla`).
- **Fusion ML×TA** (`/ml-signal`): skor sinyal gabungan — keyakinan arah ML (55%) × konfluensi TA (35%) × regime pasar (10%) → skor 0–100 & verdict BUY/SELL/WAIT.
- **Alert harga** (`/alert`, `/alerts`), **sentimen berita** (`/news`), panel live signal.
- **Sinkronisasi cloud** (☁️, opsional/Supabase): pengaturan & riwayat konsol lintas perangkat (anonim otomatis + hubungkan email).
- **PWA**: bisa diinstall & bekerja offline setelah halaman dibuka sekali.
- **Penghitung pemakaian** harian di header.

## Mulai cepat

Buka `https://cangcilung.vercel.app` (atau `index.html` lokal). Ketik perintah di kotak input:

| Perintah | Fungsi |
|---|---|
| `/signal` (atau tombol 📶) | Panel Live Signal XAUUSD |
| `/chart XAUUSD 1h` | Grafik candlestick |
| `/ta XAUUSD` · `/rsi XAUUSD` | Analisis teknikal lengkap, indikator RSI |
| `/rekomendasi XAUUSD` | Keputusan BUY/SELL/WAIT + entry/TP/SL |
| `/ml XAUUSD` · `/ml XAUUSD tf:tfjs epochs:80` | Latih model ML/DL + laporan validasi |
| `/ml-signal XAUUSD adaptive` | Sinyal fusion ML×TA |
| `/backtest XAUUSD adaptive` · `... oos` | Backtest + Monte Carlo · walk-forward OOS |
| `/structure XAUUSD` · `/structure-mtf XAUUSD` | Struktur market, multi-timeframe |
| `/news XAUUSD` · `/corr XAUUSD` | Sentimen berita, korelasi antar aset |
| `/risk XAUUSD 10000 1` | Ukuran posisi (lot) berdasar risk % |
| `/profile XAUUSD 1d` | Volume profile |
| `/sinyal XAUUSD rsi` | Tambah live signal + notifikasi |
| `/sinyal-list` · `/sinyal-history` · `/sinyal-clear` | Kelola live signal |
| `/alerts` · `/alert XAUUSD 2400 label` | Alert harga |
| `/skills` · `/help` | Skills/bundle (mantra) trading · daftar perintah |

Bebas teks non-perintah akan menampilkan daftar perintah ini.

## Strategi backtest

`rsi` · `bb` · `sma` · `ema` · `vwap` · `ma` · `smc` · `cvd` · `all` · **`adaptive`** (default — memilih strategi sesuai regime pasar: NAIK/RANGE/TURUN).

## Machine Learning (`/ml`)

- 2-layer neural network + logistic regression pembanding.
- **Deterministik** (`seed:42` default → hasil training identik antar panggilan).
- **Persisten** (cache model di localStorage, validasi integritas).
- **Anti-lookahead**: mean/std scaler dihitung dari data latih saja.
- Butuh ≥ **150 bar** data harian (data dari Yahoo Finance via proxy Vercel). Opsi: `engine:tfjs|vanilla` · `horizon:N` · `epochs:N` · `seed:N`.

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New → Project** → import repo → **Deploy**.
3. Workflow `.github/workflows/ci.yml` menjalankan cek sintaks & tes (`node test/run-tests.cjs`) di CI.

## Sinkronisasi cloud (opsional, Supabase)

Tanpa konfigurasi, semua berjalan lokal (localStorage). Untuk sinkron lintas perangkat:

1. Buat proyek di [supabase.com](https://supabase.com) (gratis).
2. **SQL Editor** → jalankan isi `supabase/schema.sql` (tabel `sessions`, `settings`, `usage` + Row Level Security).
3. **Auth → Sign In/Providers** → aktifkan **Anonymous sign-ins** (dan Email bila ingin hubungkan akun).
4. **Database → Realtime** → pastikan tabel `sessions` terpublikasi.
5. Set env vars `SUPABASE_URL` + `SUPABASE_ANON_KEY` di Vercel → **redeploy**.
6. Klik ☁️ di header untuk melihat status / menghubungkan email.

Rincian: `SETUP.md`.

## Catatan teknis

- Arsitektur statis (tanpa backend): `lib/ta.js` (indikator/backtest/Monte Carlo/live signal/panel), `lib/ml.js` (feature engineering + training + cache), `lib/mantra.js` (skills/bundle), `app.js` (routing perintah, panel UI, polling), `cloud.js` (sync Supabase).
- Tes regresi: `node test/run-tests.cjs`.
- API Key News hanya disimpan di localStorage browser Anda.