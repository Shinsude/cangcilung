window.CANGCILUNG_KNOWLEDGE = [
  {
    name: "cangcilung — Fitur & Perintah",
    info: [
      "cangcilung adalah asisten AI pribadi satu pengguna. Perintah khusus di chat: (1) \"cari: <topik>\" → mencari info terkini dari Wikipedia (id & en) dan DuckDuckGo lalu merangkumnya; (2) \"ingat: <fakta>\" → menyimpan memori jangka panjang tentang pengguna; (3) \"ingatan\" → menampilkan semua memori; (4) \"lupa: <kata>\" → menghapus memori yang mengandung kata itu; (5) menanyakan \"sinyal tcip.asia\" → menampilkan data pantauan sinyal trading; (6) lampirkan file gambar/PDF/teks via tombol 📎 untuk dianalisis.",,
      "Memori disimpan di localStorage browser (key cangcilung_memory_v1) dan disuntikkan ke prompt setiap percakapan, jadi cangcilung ingat preferensi pengguna antar-sesi di browser yang sama.",
      "cangcilung selalu berperilaku dewasa (18+): terus terang, tanpa menghakimi, dan hanya untuk satu pengguna pribadi. Larangan tetap berlaku: perbuatan ilegal, kekerasan terhadap manusia nyata, dan konten anak di bawah umur."
    ].join("\n")
  },
  {
    name: "cangcilung — Panduan Menjadi Asisten yang Baik",
    info: [
      "Sebagai asisten pribadi, cangcilung harus: memahami konteks & preferensi pengguna dari memori; menjawab ringkas tapi lengkap; memakai bahasa Indonesia natural; menawarkan bantuan lanjutan bila relevan; menolak hal-hal ilegal/berbahaya tanpa menggurui; tidak mengarang fakta (jika tidak tahu, katakan jujur atau sarankan \"cari: <topik>\"); menyadari dirinya bisa menambah memori lewat \"ingat:\" bila pengguna minta."
    ].join("\n")
  },
  {
    name: "tcip.asia",
    info: [
      "tcip.asia adalah situs trading signal bernama K-Synthesizer (K-SYNTHESIZER) dengan tagline \"TCIP IS REAL\" dan status BETA.",
      "Situs ini digambarkan sebagai dashboard analisis sinyal trading bertenaga AI: \"Advanced AI-powered trading signal analysis dashboard. Real-time MT5 data, SYNTHESIZER AI insights, live price feeds.\"",
      "Data harga real-time bersumber dari MT5 (MetaTrader 5), dan wawasan sinyal dihasilkan oleh sistem AI yang disebut SYNTHESIZER AI.",
      "Hak cipta situs: © MMXXVI ACANMAUNG — BETA TESTER.",
      "Situs berjalan di belakang Cloudflare dan dimuat lewat script utama dashboard.js."
    ].join("\n")
  },
  {
    name: "tcip.asia — Bagian / Fitur",
    info: [
      "Situs memiliki beberapa kartu/bagian utama: SIGNAL, ANALYSIS, MARKET, MACHINE LEARNING, P&L SUMMARY, SYSTEM ANALYSIS, dan ECONOMIC CALENDAR.",
      "SIGNAL: kartu keputusan trading berisi simbol + timeframe (mis. pasangan mata uang), persentase keyakinan (confidence), dan badge sinyal BUY / SELL / HOLD dengan warna (hijau/merah/kuning). Ada juga bilah progres M15, timeline sesi pasar dengan penanda waktu sekarang, dan dua kolom catatan (kiri/kanan).",
      "ANALYSIS: berisi radar analisis, info pasar, tingkat kepercayaan (trust), analisis \"devil\", penilaian risiko (risk), dan informasi antrean (queues).",
      "MARKET: tabel pasar real-time dengan kolom simbol, bid, ask, spread, dan perubahan (change); nilai berubah hijau/merah dan dilengkapi sparkline.",
      "MACHINE LEARNING: grid kolom model machine learning dengan baris label dan nilai, bar grafik (bar fill), serta baris kalender ML.",
      "P&L SUMMARY: ringkasan untung/rugi berisi daftar posisi trading (simbol, arah BUY/SELL, nilai P&L, detail posisi, trailing stop) dan grafik P&L harian.",
      "SYSTEM ANALYSIS: analisis sistem termasuk kesehatan database (database health bar) yang bisa menampilkan peringatan korupsi data (db-corrupt-alert).",
      "ECONOMIC CALENDAR: kalender event ekonomi dengan status blokir/peringatan/aman (blocked/warning/clear), hitung mundur (countdown), dan daftar event berisi mata uang, nama, waktu, dan nilai.",
      "Saat data belum tersedia, bagian menampilkan status menunggu, mis. \"WAITING P&L DATA\" atau \"WAITING ANALYSIS DATA\"."
    ].join("\n")
  },
  {
    name: "tcip.asia — Instrumen / Pair Trading",
    info: [
      "Daftar simbol trading tidak dikunci di kode, melainkan di-push live dari feed MT5 (MetaTrader 5) melalui api.tcip.asia, jadi bisa berubah-ubah mengikuti feed.",
      "Dari aturan format harga di dashboard.js, kategori instrumen yang didukung: (1) FOREX — pasangan mata uang dengan default 5 desimal, termasuk pair JPY dengan 3 desimal (mis. EURUSD, GBPUSD, USDJPY, EURJPY, AUDJPY); (2) LOGAM — XAU (emas, mis. XAUUSD); (3) KRIPTO — BTC (mis. BTCUSD); (4) INDEKS — US30, NAS, USA, USTEC (indeks AS) dan USDINDEX/DXY.",
      "Tanda '→' ditampilkan saat harga belum tersedia (price feed belum mengirim data)."
    ].join("\n")
  },
  {
    name: "tcip.asia — Desain & Pengalaman",
    info: [
      "Desain disebut \"Liquid Glass 2.0\": kartu frosted glass transparan dengan blur, tepi specular, dan sorotan kilau.",
      "Tema gelap deep-space (warna dasar #020208) dengan aurora mesh, bintang berkelap-kelip, grain film, dan orbs warna (indigo, ungu, biru, teal).",
      "Kartu punya efek 3D tilt yang mengikuti kursor serta partikel animasi. Ada dukungan prefers-reduced-motion.",
      "Ada tombol mode minimal (ikon \"*\") yang hanya menampilkan SIGNAL, MARKET, dan ECONOMIC CALENDAR.",
      "Status koneksi ditampilkan sebagai status-dot: hijau (live, berdenyut), kuning (stale), dan redup (offline). Ada juga mode \"tunnel-offline\" yang meredupkan header saat terowongan data mati.",
      "Efek visual khusus: pulse glow pada sinyal baru, alarm antrean (queue-alarm), kedip divergence merah, glow sinyal basi kuning, holy-grail hijau, dan kartu god-mode ungu.",
      "Situs dirancang mobile-first dengan lebar maksimal ~480px. Font memakai sistem font (Google Fonts sengaja dihapus untuk privasi/kecepatan — FE-5), dan zoom diizinkan (FE-7)."
    ].join("\n")
  },
  {
    name: "tcip.asia — Arsitektur & API",
    info: [
      "Backend situs terpisah di api.tcip.asia. Halaman tcip.asia hanya memuat dashboard.js yang membaca data lewat dua jalur: REST polling + WebSocket.",
      "Endpoint REST: (1) GET https://api.tcip.asia/public/dashboard — paket utama, dipoll tiap ~8 detik (timeout 8 detik), berisi sinyal (insight_data), harga pasar, posisi, P&L, ML, ekonomi, antrean, kesehatan DB; (2) GET https://api.tcip.asia/public/prices — harga fallback {prices: {SIMBOL: {bid, ask, spread, change, digits}}}, dipoll tiap ~5 detik saat tab terlihat dan tiap ~2 detik saat WebSocket mati; (3) GET https://api.tcip.asia/public/orders — pending orders, dipoll tiap ~5 detik.",
      "WebSocket: wss://tcip.asia/ws (atau ws:// saat di localhost). Pesan masuk berformat JSON {type: \"tick\", prices: {SIMBOL: {bid, ask, spread, change, digits}}}. Ada watchdog _wsLastData: jika tidak ada data WS selama ~5 detik, otomatis fallback ke polling /public/prices; jika WS putus, coba sambung ulang tiap ~3 detik.",
      "Respons /public/dashboard berbentuk paket besar: {open_positions, open_details, market_prices, insight_data, ml_status, eco_cal, pnl_summary, system_analysis, pipeline_health, ai_analyzing, db_health, feed_pool_queue_depth, mt5_queue_depth, fast_path_gate_rejections, rejection_counters, rejection_reasons, cr_engine_stats, pnl_cache_age, generated_at, cache_ttl}.",
      "Kesehatan database (db_health) sudah digabung ke /public/dashboard (tidak ada request terpisah). Antrean feed_pool_queue_depth & mt5_queue_depth disimpan sebagai riwayat 20 nilai untuk sparkline.",
      "Header situs berjalan di belakang Cloudflare; akses API langsung dari luar browser bisa ditolak (502). Data harga & waktu bisa ditandai 'stale' (basi) bila feed tertunda.",
      "PENTING: blok di atas menggambarkan arsitektur ASLI tcip.asia (live API + WebSocket). Aplikasi cangcilung TIDAK memakai API live itu — lihat blok 'Snapshot Data cangcilung' dan 'Replika Dashboard' di bawah untuk format data yang sebenarnya digunakan."
    ].join("\n")
  },
  {
    name: "tcip.asia — Snapshot Data cangcilung (tcip-detail.json)",
    info: [
      "cangcilung membaca data sinyal dari file statis tcip-data/tcip-detail.json (bukan API langsung). File ini adalah snapshot JSON hasil pantauan, struktur NESTED dan bukan insight_data flat. Posisi: tcip-data/tcip-detail.json di repo, di-serve di /tcip-data/tcip-detail.json pada cangcilung.vercel.app.",
      "Top-level keys: generatedAt (epoch ms), symbol, timeframe, direction, confidence, grade, phase, risk_level, verdict, final_reco, regime, decomp_regime, volatility_regime, stability, is_stale, ts_intrinsic, ts_snr, weighted_alignment, trend_consistency_pct, composite_score, confluence_score, tech_score, coherence_score, institutional_flow_score, ml_confidence, layers, mtf, indicators, levels, risk, entry_strength, signal_consistency, adaptive_lookback, filter_reason, hierarchy_reason, smc, roll_under_reco, inferred_reversal, reversal_confidence, safety, primary_context, primary_bias, signal_age_s, market_quality, session_name, divergence_status, divergence_downgraded, market_prices, pnl_summary, ml_status, pipeline_health, system_analysis, eco_cal, cr_engine_stats, open_positions, open_details, recent_signals.",
      "Sub-objek: layers{tcip,key,candle,session,atr,ml} (skor 0-100); mtf{d1_dir,h4_dir,h1_dir,m30_dir,m15_dir, d1_score..m15_score, w1_d1_aligned, d1_h4_aligned}; indicators{rsi_14,macd_line,macd_signal,macd_hist,bb_pct_b,cvd,current_cvd,cvd_efficiency,net_flow,flow_direction}; levels{entry_price,support_price,resistance_price,nearest_support,nearest_resistance}; risk{atr,atr_points,spread_points,sl_pips,tp_pips,risk_reward}; smc{warning,confluence}; safety{status,violated,total}.",
      "recent_signals: array riwayat sinyal {symbol,timeframe,direction,grade,verdict,unified_score,outcome,timestamp}. open_details: array posisi {symbol,type,entry_price,sl,tp,lot,profit,current_price,trail_level,trail_label,profit_locked}. pnl_summary{today,week,month,daily_breakdown,loading} tiap {pnl,trades,win_rate}. ml_status{trained,retrain_count,total_outcomes,accuracy,pattern_rates,calibration,feature_importance,drift,recent_alerts}. eco_cal{blocked,next_events[]}.",
      "cr_engine_stats{total_processed,total_rejected,total_tradeable,by_verdict,by_reject_reason,tcip_cache_evictions,config{8 bobot: tcip,key_level,candle,bar_strength,session,atr,history,ml},layer_performance,last_layer_health,last_pool_healthy,layer_alert_streaks,layer_alerted}. pipeline_health{health_score,signals_per_hour,entry_rate,cr_rejection_rate,baseline_arrival,baseline_entry_pct,baseline_cr_pct}. system_analysis{enabled,running,last_run_ts,proposals_open,proposals_total,reports_total,latest_proposal,collectors{13 kolektor: pipeline,ai,cr_engine,filter,safety,trade,db,mt5,system,signal_pipeline,outcome_quality,gating_effectiveness,counterfactual, masing {emits,last_emit_age_s,last_error}}}."
    ].join("\n")
  },
  {
    name: "cangcilung — Replika Dashboard Sinyal (tab Sinyal)",
    info: [
      "Tab 'Sinyal' di cangcilung menampilkan replika dashboard tcip.asia (K-Synthesizer) yang di-render dalam IFRAME terisolasi: halaman sinyal-dashboard.html memuat script dashboard.js.",
      "Mode-nya SNAPSHOT (statis): dashboard.js memakai DATA_URL='tcip-data/tcip-detail.json' (path relatif dari iframe), di-poll tiap 30 detik. Tidak ada WebSocket dan tidak ada REST API live.",
      "Karena tcip-detail.json berbentuk nested sedangkan kode render asli mengharapkan insight_data flat, dashboard.js memakai adapter flattenDetail(detail) untuk memetakan struktur nested ke field yang dibaca renderer (contoh: layers.tcip → tcip_component, layers.key → key_level_score, risk.sl_pips → suggested_sl_pips, risk.tp_pips → suggested_tp_pips, dst).",
      "Saat data penuh (ada direction/grade/symbol) ditampilkan keputusan lengkap (contoh nyata: XAUUSD SELL BPLUS, tcip_component 42.8, mtf_d1 BULLISH, sl 9.7 pips); tombol refresh manual me-reload iframe. Peringatan: karena snapshot, angka tidak bertambah real-time seperti feed live."
    ].join("\n")
  },
  {
    name: "tcip.asia — Status Nyata API & Monitor Bot",
    info: [
      "API asli api.tcip.asia saat ini OFFLINE (HTTP 530). Karena itu cangcilung mengandalkan snapshot dan bukan permintaan live.",
      "File tcip-data/tcip-detail.json ditulis oleh bot 'cangcilung-bot' yang menjalankan GitHub Actions workflow 'Pantau tcip.asia' secara terjadwal (cron, ~tiap jam) — setiap berhasil mengontak tcip.asia ia memperbarui snapshot dan commit.",
      "Ada juga seed awal (commit 'seed tcip-detail.json dari snapshot API asli') sehingga dashboard tetap menampilkan data walau API sedang mati. Header produksi sudah diset X-Frame-Options SAMEORIGIN agar iframe replika boleh dimuat dari origin yang sama."
    ].join("\n")
  },
  {
    name: "tcip.asia — Struktur Data Sinyal (decision)",
    info: [
      "Objek sinyal bernama insight_data dalam /public/dashboard; jika arah/grade/simbol kosong berarti belum ada sinyal (state.decision = null).",
      "Field inti: direction (BUY / SELL / NEUTRAL / WAIT), grade (ULTIMATE, APLUS, dll), symbol (mis. EURUSD), timeframe (default M15), confidence (dibulatkan ke bilangan bulat 0-100), verdict, phase (CONFIRMED, STRENGTHENING, FORMING, DEAD ZONE, WEAKENING, EARLY, PEAK, EXPIRING, REVERSED), entry_strength, bar_level, divergence_status (mis. NONE), risk_reward (R:R), position_open, regime, risk_level, weaknesses[], mtf_warnings[] (berisi {timeframe, direction}), is_stale, signal_born_ts, god_mode, analysis_mode ('ai' = SYNTHESIZER, selain itu TCIP MODE).",
      "Skor lapisan analisis (CR layers): composite_score, institutional_flow_score, coherence_score, calibrated_confidence, key_level_score (0-100), ml_component (0-100), cvd_efficiency (0-1, ambang 0.4), weighted_alignment (0-1, ambang 0.6), bar_opposing (boolean), trend_consistency_pct.",
      "Indikator teknikal: rsi_14, macd_line, macd_signal, macd_hist, bb_pct_b, adaptive_lookback.",
      "Sistem perluasan: roll_under_risk, minutes_to_roll, theta_ai_wr, theta_rules_wr, theta_total, theta_divergence, rag_win_rate, rag_total_similar, safety_bounds_violated, safety_bounds_total (default 6), safety_status, counter_trend_bias, counter_trend_strength, primary_context, primary_bias, additional_confirmations, ts_intrinsic, ts_snr, decomp_regime (alias volatility_regime), roll_under_reco, smc_warning, smc_confluence, net_flow, session_name, tech_mtf_aligned, tcip_write_ok, tcip_write_attempt.",
      "Field MTF (higher timeframe): mtf_d1_dir & mtf_h4_dir berisi arah BULL/BEAR di timeframe harian & H4 — dipakai untuk bias (higher timeframes bullish/bearish).",
      "Mirror kontrak MT5 (tcip_*): tcip_raw (snapshot mentah lengkap), tcip_signal_phase, tcip_direction, tcip_grade, tcip_bar_direction, tcip_timestamp, tcip_clock_drift_s, tcip_nearest_support, tcip_nearest_resistance — menjaga nilai persis dari TCIP.mq5 termasuk nol & false.",
      "Riwayat confidence disimpan di localStorage browser dengan key 'ksynth_conf_h'."
    ].join("\n")
  },
  {
    name: "tcip.asia — Logika & Interpretasi Sinyal",
    info: [
      "Aturan netral: direction NEUTRAL/WAIT atau kosong berarti TIDAK ADA sinyal trading (tunggu konfirmasi arah). Ringkasan netral: \"NO TRADE SIGNAL YET — MARKET IS <phase>, KEY-LEVEL STRENGTH N/100, ML CONFIDENCE N/100. STANDING BY FOR A CLEAR DIRECTIONAL SETUP.\"",
      "Narasi keputusan (genDecisionHuman): 'BUY → READY TO EXECUTE' untuk grade ULTIMATE/APLUS tanpa risiko; 'BUY → EXECUTE WITH TIGHT SL' bila ada sinyal biasa; 'BUY BUT <risiko> → SKIP FOR NOW' bila bar opposing atau osilasi; 'BUY STRONG BUT <risiko> → CONFIRM MANUALLY' untuk risiko lain.",
      "Daftar risiko yang dikenali: divergence (tidak NONE), BAR OPPOSING, OSCILLATION (dari weaknesses mengandung OSCILLATION/DIRECTION UNSTABLE atau trend_consistency_pct 1-59), CVD WEAK (cvd_efficiency < 0.4), LOW ALIGNMENT (weighted_alignment < 0.6), BAR WEAK (bar_level DEAD/WEAK).",
      "Konfirmasi pasar (genMarketHuman): BUY valid bila harga di atas support + CVD positif; SELL valid bila harga di bawah resistance + CVD negatif; bila CVD lemah → 'CONFIRM MANUALLY'.",
      "Sinyal grade tinggi (ULTIMATE/APLUS) disebut 'HIGH-CONVICTION AI'; ada juga indikator holy_grail (hijau) dan god_mode (ungu) untuk keyakinan ekstrem.",
      "ML status: filter aktif (ACTIVE) bila total_outcomes >= 200, selain itu 'WARMING UP'; berisi trained, retrain_count, total_outcomes, pattern_rates[], calibration[], feature_importance[], ml_comparison, drift, recent_alerts[].",
      "Eco calendar: eco_cal.next_events[] (tiap event berisi name, minutes_away, currency, value) + flag blocked; blocked = trading diblokir, <=30 menit = peringatan, tanpa event = 'NO HIGH-IMPACT EVENTS'.",
      "P&L summary: pnl_summary.today / .week / .month masing-masing {pnl, trades, win_rate}.",
      "Pending orders: /public/orders → {orders: [{symbol, type_str (BUY/SELL LIMIT dll), price (null saat diredaksi di mode publik), volume, sl, tp, time_setup}]}."
    ].join("\n")
  },
  {
    name: "tcip.asia — Keamanan & Catatan Teknis",
    info: [
      "Teks rationale (hasil LLM) di-escape sebelum dirender ke HTML — perbaikan XSS tersimpan (FE-1 FIX 2026-08-01): 'the old code rendered it unescaped into innerHTML (stored XSS)'. Artinya jangan pernah render isi API ke innerHTML tanpa escaping.",
      "Harga pending order dihapus (null) dalam mode publik — 'public mode strips price' untuk privasi.",
      "Jika order tidak punya time_setup, umur order ditampilkan '--' (bukan epoch asli) — L60 FIX 2026-08-06.",
      "Komentar di file dashboard.js sengaja sebagian 'malformed' untuk mempersulit parser otomatis, jadi jangan jadikan komentar sebagai kontrak API — baca kode & data aktualnya.",
      "Desain mobile-first (~480px), font sistem (Google Fonts dihapus FE-5), zoom user diizinkan (FE-7 FIX 2026-08-01)."
    ].join("\n")
  },
  {
    name: "tcip.asia — Peringatan Risiko",
    info: [
      "Situs menampilkan peringatan tebal: \"PROP ACC — LATENCY MAY VARY. TRADING CARRIES HIGH RISK; MARKETS ARE VOLATILE AND UNPREDICTABLE. ALWAYS CONDUCT YOUR OWN RESEARCH — NEVER INVEST MONEY YOU CANNOT AFFORD TO LOSE.\"",
      "Terjemahan singkat: PROP ACC — latensi bisa bervariasi. Trading berisiko sangat tinggi; pasar volatil dan tidak bisa diprediksi. Selalu riset mandiri — jangan pernah investasikan uang yang tidak mampu kamu rugikan."
    ].join("\n")
  }
];
