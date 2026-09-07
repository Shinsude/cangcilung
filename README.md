# CangCilung Affiliate — AI ML & DL

Asisten **AI ML & DL** untuk **affiliator penjualan**, berbasis web (HTML/CSS/JS murni, satu tab, offline-ready/PWA). Data produk & komisi yang Anda input diolah mesin learning untuk menghitung profitabilitas, mengoptimasi pilihan produk & konten, memprediksi konversi/pendapatan, dan memberi panduan strategi komisi.

> 🔗 Edukasi & pengelolaan bisnis affiliasi, **bukan** jaminan keuntungan. Semua penghitungan berjalan di browser Anda, tanpa server & tanpa pengiriman data.

## Fitur

- **Form input produk**: tambah/ubah produk dengan harga, komisi, klik, konversi, pendapatan, biaya, niche, format konten, dan platform.
- **Analisis data penjualan** (`/analisis`): pendapatan, biaya, laba bersih, margin, konversi, plus kategori terbaik per niche/platform/format konten.
- **Optimasi produk & konten** (`/optimasi`): produk **DIGENJOT** vs **DIEVALUASI** berdasarkan laba & ROAS + saran praktis.
- **Prediksi profitabilitas** (`/prediksi`): neural network (MLP) + logistic regression deterministik (seed 42) dilatih di browser — skor `p(untung)` tiap produk + validasi OOS (anti-overfit) + verdict `GENJOT / PERTAHANKAN / EVALUASI`.
- **Forecast pendapatan** (`/forecast`): proyeksi periode berikutnya (bulanan/harian/tahunan) dari tren deret waktu.
- **Strategi affiliator** (`/strategi`): langkah konkret menaikkan komisi.
- **Dashboard pribadi**: ringkasan laba, margin, dan produk terbaik langsung di header.
- **Sinkronisasi cloud** (opsional/Supabase): siap untuk data lintas perangkat — struktur API disiapkan untuk backend di kemudian hari.
- **PWA**: bisa diinstal & bekerja offline setelah halaman dibuka sekali.
- **Penghitung pemakaian** harian di header.

## Mulai cepat

Buka `https://cangcilung.vercel.app` (atau `index.html` lokal), lalu ketik di kotak input:

| Perintah | Fungsi |
|---|---|
| `/tambah` | Buka form tambah produk (atau `/tambah nama=.. harga=.. komisi=.. klik=.. konversi=.. pendapatan=.. biaya=..`) |
| `/daftar` | Tabel semua produk & laba |
| `/demo` | Muat 10 produk contoh |
| `/export` | Unduh cadangan data produk (file JSON) |
| `/import` | Muat kembali file cadangan JSON |
| `/analisis` | Ringkasan penjualan, laba, margin, konversi |
| `/optimasi` | Produk DIGENJOT vs DIEVALUASI + saran |
| `/prediksi` | Latih model ML di browser → skor p(untung) + validasi OOS |
| `/forecast` · `/forecast harian` | Proyeksi pendapatan periode berikutnya |
| `/strategi` | Langkah menaikkan komisi |
| `/hapus <nama/id>` · `/beres` | Kelola data produk |
| `/skills` · `/help` | Katalog skill/bundel · daftar perintah |

Teks bebas (mis. *"produk mana yang harus di-genjot?"*) juga diterima dan langsung memicu analisis.

## Engine ML (lib/affiliate.js)

- **Fitur**: 10 fitur numerik (harga, komisi %, klik, konversi, conv. rate, EPC, margin, komisi tersedia, ROAS, pendapatan) + one-hot niche/konten/platform — tanpa lookahead.
- **Label**: `pendapatan − biaya > 0` (produk menguntungkan).
- **Model**: MLP deterministik (seed 42) via `lib/ml.js` (vanilla offline / TensorFlow.js), split kronologis 70/30, evaluasi OOS jujur, hasil di-cache untuk panggilan ulang yang instan.
- **Verdict**: `p ≥ 0.66` → GENJOT · `p ≥ 0.50` → PERTAHANKAN · lainnya → EVALUASI.

## Strategi penamaan konvensi

- Modul browser memakai pola `var CC = window.CC || (window.CC = {})` (`CC.ta`, `CC.ml`, `CC.aff`, dst).
- `lib/affiliate.js` memperlihatkan `CC.aff`: `getProducts/setProducts/addProduct/updateProduct/deleteProduct/clearProducts/seedDemo/buildFeatures/buildDatasets/trainModel/scoreProducts/analyze/optimize/forecast/strategy` + `format*`.

## Menjalankan/test

- `node -c app.js` untuk cek sintaks.
- `node test/run-tests.cjs` untuk unit/sanity test (ta.js, ml.js, affiliate.js).
- `node test/smoke-affiliate.cjs` untuk smoke test runtime penuh (semua lib + app.js
  dimuat dalam vm sandbox dengan stub DOM; menjalankan `init`, dashboard, dan alur
  perintah konsol + form produk).
- Deploy Vercel: `vercel deploy --prod --yes` (lihat `deploy.bat`).

Lisensi penggunaan: edukasi & pengelolaan bisnis affiliasi.