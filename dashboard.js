
// ====== GLOBAL STATE ======
const state = { decision: null, market: null, online: false, analysisMode: 'ai', openCount: 0, minimal: false, prevSignalHash: null, m15TimerId: null, ml_status: null, eco_cal: null, prevPrices: {}, symbolDigits: {}, confHistory: (function(){try{return (JSON.parse(localStorage.getItem('ksynth_conf_h')||'[]')).filter(function(v){return typeof v==='number';});}catch(e){return [];}})(), ai_analyzing: false, _lastEntrySym: null, mt5QHistory: [], feedQHistory: [], rejection_counters: null, rejection_reasons: null, cr_engine_stats: null, pnl_cache_age: null };
const DATA_URL = "tcip-data/tcip-detail.json";

// ====== 3D MOUSE TRACKING ENGINE ======
let _mouseX = 0, _mouseY = 0, _targetRotX = 0, _targetRotY = 0;
let _curRotX = 0, _curRotY = 0, _rafId = null;

function init3DEngine() {
  document.addEventListener('mousemove', function(e) {
    _mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    _mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  let cards = document.querySelectorAll('.card');
  let orbs = document.querySelectorAll('.bg-orb');

   function rafLoop() {
     _targetRotX = _mouseY * -8;
     _targetRotY = 0;
     _curRotX += (_targetRotX - _curRotX) * 0.06;
     _curRotY += (_targetRotY - _curRotY) * 0.06;

     let now = Date.now() / 1000;

     for (let i = 0; i < cards.length; i++) {
       let el = cards[i];
       let tier = el.getAttribute('data-tier') || 'b';
       let tierBase = tier === 'a' ? 6 : tier === 'c' ? -8 : 0;
       let floatOsc = Math.sin(now * 0.7 + i * 1.2) * 3;
       let tiltFactor = parseFloat(el.getAttribute('data-tilt')) || 1;
       let rx = _curRotX * tiltFactor;
       let ry = 0;
       el.style.setProperty('--rot-x', rx.toFixed(2) + 'deg');
       el.style.setProperty('--rot-y', ry.toFixed(2) + 'deg');
       el.style.setProperty('--float-z', (tierBase + floatOsc).toFixed(1) + 'px');
       let mx = 50;
       let my = ((_mouseY + 1) * 50).toFixed(0);
       el.style.setProperty('--mx', mx + '%');
       el.style.setProperty('--my', my + '%');
     }

     for (let i = 0; i < orbs.length; i++) {
       let orb = orbs[i];
       let f = parseFloat(orb.getAttribute('data-parallax')) || 0.5;
       let ty = _mouseY * -20 * f;
       orb.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
     }

    _rafId = requestAnimationFrame(rafLoop);
  }
  _rafId = requestAnimationFrame(rafLoop);
}

function setWSStatus(status) {
  state.online = status === 'online';
  let app = document.querySelector('.app');
  if (app) app.classList.toggle('tunnel-offline', status !== 'online');
}

function setPollStatus(ok) {
  let dot = document.getElementById('status-dot');
  if (!dot) return;
  dot.className = 'status-dot';
  if (state.online === false) {
    dot.classList.add('status-dot-offline');
  } else if (ok) {
    dot.classList.add('status-dot-live');
    } else {
    dot.classList.add('status-dot-stale');
  }
}

function fmtUSD(v) {
  if (v == null) return '→';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const f = abs.toFixed(2);
  return sign === '-' ? '-$' + f : '$' + f;
}

function fmtPrice(v, sym, digits) {
   if (v == null) return ' → ';
   if (digits != null && digits >= 0) return v.toFixed(digits);
   if (sym && state.symbolDigits[sym] != null) return v.toFixed(state.symbolDigits[sym]);
   if (!sym) return v.toFixed(5);
   if (sym.includes('JPY')) return v.toFixed(3);
   if (/XAU|BTC|US30|NAS|USA|USDINDEX|DXY|USTEC/i.test(sym)) return v.toFixed(2);
   return v.toFixed(5);
 }

function translateEntryStrength(v) {
  if (!v) return '';
  let m = {
    'CORE PERFECT': 'PERFECT', 'CORE STRONG': 'STRONG', 'CORE SOLO': 'CORE',
    'PARTIAL CORE': 'PARTIAL', 'CORE CONFLICT': 'WEAK', 'CORE UNUSED': 'INACTIVE'
  };
  return (m[v] || v).toUpperCase();
}

function translateDivergence(v) {
   if (!v || v === 'NONE') return 'NONE';
   let m = { 'BULLISH DIV': 'BULLISH DIVERGENCE', 'BEARISH DIV': 'BEARISH DIVERGENCE' };
   return (m[v] || v).toUpperCase();
 }

 function translatePhase(v) {
   if (!v) return '--';
   let m = { 'CONFIRMED': 'CONFIRMED', 'STRENGTHENING': 'STRENGTHENING', 'FORMING': 'FORMING', 'DEAD ZONE': 'DEAD ZONE', 'WEAKENING': 'WEAKENING', 'EARLY': 'EARLY', 'PEAK': 'PEAK', 'EXPIRING': 'EXPIRING', 'REVERSED': 'REVERSED' };
   return (m[v] || v).toUpperCase();
 }

// trustMetricsRow removed — trust metrics now rendered inline in #info-trust column

function genDecisionHuman(d) {
  let dir = (d.direction || 'WAIT'); let grade = (d.grade || '');
  let conf = d.confidence || 0; let div = d.divergence_status || 'NONE';
  let bo = d.bar_opposing || false; let bl = (d.bar_level || '');
  let cvd = d.cvd_efficiency != null ? d.cvd_efficiency : 0.5;
  let wa = d.weighted_alignment != null ? d.weighted_alignment : 0.5;
  let hasOsc = false;
  let wk = d.weaknesses || [];
  for (let i = 0; i < wk.length; i++) {
    let s = (wk[i] || '').toUpperCase();
    if (s.indexOf('OSCILLATION') >= 0 || s.indexOf('DIRECTION UNSTABLE') >= 0) hasOsc = true;
  }
  let tc = d.trend_consistency_pct;
  if (tc != null && tc > 0 && tc < 60) hasOsc = true;
  let highGrade = grade === 'ULTIMATE' || grade === 'APLUS';
  let risks = [];
  if (div !== 'NONE') risks.push(translateDivergence(div));
  if (bo) risks.push('BAR OPPOSING');
  if (hasOsc) risks.push('OSCILLATION');
  if (typeof cvd === 'number' && cvd < 0.4) risks.push('CVD WEAK');
  if (typeof wa === 'number' && wa < 0.6) risks.push('LOW ALIGNMENT');
  if (bl === 'DEAD' || bl === 'WEAK') risks.push('BAR WEAK');
  if (dir === 'NEUTRAL' || dir === 'WAIT' || !dir) {
    if (risks.length) return risks.join(' + ') + '  →  WAIT FOR CONFIRMATION';
    return 'NO SIGNAL  →  WAIT FOR DIRECTIONAL CONVICTION';
  }
  if (!risks.length) {
    if (highGrade) return dir + '  →  READY TO EXECUTE';
    return dir + '  →  EXECUTE WITH TIGHT SL';
  }
  if (bo || hasOsc) return dir + ' BUT ' + risks.join(' + ') + '  →  SKIP FOR NOW';
  return dir + ' STRONG BUT ' + risks.join(' + ') + '  →  CONFIRM MANUALLY';
}

function genMarketHuman(d) {
  let dir = d.direction || 'WAIT';
  let cvd = d.cvd_efficiency != null ? d.cvd_efficiency : 0.5;
  let div = d.divergence_status || 'NONE';
  let cvdOk = typeof cvd === 'number' && cvd >= 0.4;
  if (dir === 'BUY') {
    if (cvdOk) return 'PRICE ABOVE SUPPORT, CVD POSITIVE  →  BULLISH CONFIRMATION';
    return 'BUY SIGNAL BUT CVD WEAK  →  CONFIRM MANUALLY';
  }
  if (dir === 'SELL') {
    if (cvdOk) return 'PRICE BELOW RESISTANCE, CVD NEGATIVE  →  BEARISH CONFIRMATION';
    return 'SELL SIGNAL BUT CVD WEAK  →  CONFIRM MANUALLY';
  }
  if (div !== 'NONE') return 'DIVERGENCE DETECTED  →  WAIT FOR CONFIRMATION';
    return 'NO SIGNAL  →  WAIT FOR DIRECTIONAL CONVICTION';
}

function genCrHuman(d) {
  let layers = [
    {n:'TCIP',s:d.tcip_component||0},
    {n:'KEY LEVEL',s:d.key_level_score||0},
    {n:'CANDLE',s:d.candle_score||0},
    {n:'SESSION',s:d.session_score||0},
    {n:'ATR',s:d.atr_score||0},
    {n:'ML',s:d.ml_component||0},
  ];
  let strong = [], weak = [], moderate = [];
  for (let i = 0; i < layers.length; i++) {
    let s = layers[i].s;
    if (s >= 60) strong.push(layers[i].n);
    else if (s > 0 && s < 40) weak.push(layers[i].n);
    else if (s >= 40 && s < 60) moderate.push(layers[i].n);
  }
  if (strong.length && weak.length) return strong.join(' + ') + ' STRONG, BUT ' + weak.join(' + ') + ' WEAK  →  LAYER SPLIT';
  if (strong.length) return strong.join(' + ') + ' STRONG  →  SOLID CONFIRMATION';
  if (weak.length) return 'MOST LAYERS WEAK (' + weak.join(', ') + ')  →  CAUTION';
  if (moderate.length) return 'LAYERS IN MODERATE ZONE  →  WAIT FOR CONFIRMATION';
  return 'NO LAYER DATA YET';
}

function mtfBiasWord(d) {
  let bear = (d.mtf_d1_dir || '').includes('BEAR') || (d.mtf_h4_dir || '').includes('BEAR');
  let bull = (d.mtf_d1_dir || '').includes('BULL') || (d.mtf_h4_dir || '').includes('BULL');
  if (bear) return 'higher timeframes are bearish';
  if (bull) return 'higher timeframes are bullish';
  return '';
}

function genSignalSummary(d) {
  d = d || {};
  let dir = (d.direction || 'NEUTRAL').toUpperCase();
  let sym = (d.symbol || 'THIS MARKET').toUpperCase();
  let phase = translatePhase(d.phase || '').toLowerCase();
  let conf = Math.round(d.confidence || 0);
  let kl = Math.round(d.key_level_score || 0);
  let ml = Math.round(d.ml_component || 0);
  if (dir === 'NEUTRAL' || dir === 'WAIT' || !dir) {
    let bias = mtfBiasWord(d);
    return ('NO TRADE SIGNAL YET ON ' + sym + ' — MARKET IS ' + phase +
      (bias ? ', ' + bias : '') + '. KEY-LEVEL STRENGTH ' + kl + '/100, ML CONFIDENCE ' + ml +
      '/100. STANDING BY FOR A CLEAR DIRECTIONAL SETUP.').toUpperCase();
  }
  let action = dir === 'BUY' ? 'BUY' : 'SELL';
  let bias = mtfBiasWord(d);
  let regime = (d.regime || '').toLowerCase();
  let sess = d.session ? d.session.toLowerCase() : '';
  let risk = (d.risk_level || '').toLowerCase();
  let rr = d.risk_reward ? 'REWARD ' + d.risk_reward.toFixed(1) + '× RISK' : '';
  let parts = [];
  parts.push((d.holy_grail ? 'HIGH-CONVICTION AI SEES A ' : 'AI SEES A ') + action + ' ON ' + sym);
  if (phase) parts.push('IN A ' + phase + ' PHASE');
  if (regime) parts.push(regime + ' REGIME');
  if (sess) parts.push(sess + ' SESSION');
  if (bias) parts.push(bias);
  if (kl > 0) parts.push('KEY-LEVEL STRENGTH ' + kl + '/100');
  let s = parts.join(', ') + '. ';
  let tail = [];
  if (risk) tail.push('RISK IS ' + risk);
  if (rr) tail.push(rr);
  if (conf) tail.push('AI CONFIDENCE ' + conf + '%');
  if (tail.length) s += ' ' + tail.join(', ') + '.';
  if (d.ml_rejected) s += ' NOTE: ML MODEL FLAGGED THIS SIGNAL.';
  if (d.filter_reason) s += ' TRADE FILTER: ' + d.filter_reason.toUpperCase() + '.';
  return s.toUpperCase();
}

function renderRadar(scores) {
  let cx=60, cy=55, r=42, depth=14;
  let names=['TCIP','KEY','CANDLE','SESN','ATR','ML'];
  let keys=['tcip_component','key_level_score','candle_score','session_score','atr_score','ml_component'];
  let colors=['#0A84FF','#30D158','#BF5AF2','#FFD60A','#FF453A','#5AC8FA'];
  let angles=[-90,-30,30,90,150,210].map(function(a){ return a*Math.PI/180; });
  let grid=[25,50,75];

  // Compute vertex positions
  let pts2d=[], pts3d=[];
  for (let i=0;i<6;i++) {
    let val=Math.min(Math.max((scores[keys[i]]||0)/100*r,0),r);
    let x=cx+val*Math.cos(angles[i]), y=cy+val*Math.sin(angles[i]);
    pts2d.push({x:x,y:y});
    pts3d.push({x:x,y:y,z:0});
  }
  // Top face vertices (extruded upward in Z = shifted up in Y for 2.5D projection)
  let ptsTop=[];
  for (let i=0;i<6;i++) {
    ptsTop.push({x:pts2d[i].x, y:pts2d[i].y-depth*0.6});
  }

  // Isometric-ish projection helper
  let svg='';
  // Back panel (darker fill of base)
  let backPts=ptsTop.map(function(p){ return p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
  svg+='<polygon points="'+backPts+'" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>';

  // Side faces connecting front n top
  for (let i=0;i<6;i++) {
    let ni=(i+1)%6;
    let fx=pts2d[i].x, fy=pts2d[i].y, tx=ptsTop[i].x, ty=ptsTop[i].y;
    let fx2=pts2d[ni].x, fy2=pts2d[ni].y, tx2=ptsTop[ni].x, ty2=ptsTop[ni].y;
    let sidePts=[fx.toFixed(1)+','+fy.toFixed(1), fx2.toFixed(1)+','+fy2.toFixed(1), tx2.toFixed(1)+','+ty2.toFixed(1), tx.toFixed(1)+','+ty.toFixed(1)].join(' ');
    let opacity=0.06+0.04*((i+1)%3);
    let faceScore=scores[keys[i]]||0;
    let faceColor = faceScore >= 60 ? 'rgba(48,209,88,'+opacity+')' : faceScore >= 40 ? 'rgba(255,214,10,'+opacity+')' : 'rgba(255,69,58,'+opacity+')';
    svg+='<polygon points="'+sidePts+'" fill="'+faceColor+'" stroke="rgba(255,255,255,0.08)" stroke-width="0.3"/>';
  }

  // Grid rings
  for (let g=0;g<grid.length;g++) {
    let gp='', gpTop='';
    for (let i=0;i<6;i++) {
      let x=cx+grid[g]*Math.cos(angles[i]), y=cy+grid[g]*Math.sin(angles[i]);
      let xt=x, yt=y-depth*0.6;
      gp+=(i?',':'')+x.toFixed(1)+','+y.toFixed(1);
      gpTop+=(i?',':'')+xt.toFixed(1)+','+yt.toFixed(1);
    }
    svg+='<polygon points="'+gp+'" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="0.5"/>';
    svg+='<polygon points="'+gpTop+'" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/>';
  }

  // Axes
  for (let i=0;i<6;i++) {
    let x=cx+r*Math.cos(angles[i]), y=cy+r*Math.sin(angles[i]);
    let xt=x, yt=y-depth*0.6;
    svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
    svg+='<line x1="'+cx+'" y1="'+(cy-depth*0.6)+'" x2="'+xt.toFixed(1)+'" y2="'+yt.toFixed(1)+'" stroke="rgba(255,255,255,0.03)" stroke-width="0.3"/>';
    svg+='<line x1="'+x.toFixed(1)+'" y1="'+y.toFixed(1)+'" x2="'+xt.toFixed(1)+'" y2="'+yt.toFixed(1)+'" stroke="rgba(255,255,255,0.05)" stroke-width="0.3"/>';
    let lx=(cx+(r+12)*Math.cos(angles[i])), ly=(cy+(r+12)*Math.sin(angles[i]));
    let ta=angles[i]*180/Math.PI;
    svg+='<text x="'+lx.toFixed(1)+'" y="'+(ly+2).toFixed(1)+'" text-anchor="middle" font-size="5.5" font-family="JetBrains Mono,monospace" fill="rgba(255,255,255,0.40)" transform="rotate('+ta+','+lx.toFixed(1)+','+(ly+2).toFixed(1)+')">'+names[i]+'</text>';
  }

  // Front face (scored polygon) with glow
  let pts=pts2d.map(function(p){ return p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
  let avgScore = ((scores.tcip_component||0)+(scores.key_level_score||0)+(scores.candle_score||0)+(scores.session_score||0)+(scores.atr_score||0)+(scores.ml_component||0))/6;
  let avgColor = avgScore >= 60 ? '#30D158' : avgScore >= 40 ? '#FFD60A' : '#FF453A';
  svg+='<polygon points="'+pts+'" fill="'+avgColor+'18" stroke="'+avgColor+'" stroke-width="1.2" opacity="0.9"/>';
  // Vertex dots
  for (let i=0;i<6;i++) {
    let s=scores[keys[i]]||0;
    let c = s >= 60 ? '#30D158' : s >= 40 ? '#FFD60A' : '#FF453A';
    svg+='<circle cx="'+pts2d[i].x.toFixed(1)+'" cy="'+pts2d[i].y.toFixed(1)+'" r="2" fill="'+c+'" opacity="0.9"/>';
  }

  return '<div class="radar-3d-wrap" style="width:120px;height:120px;flex-shrink:0;margin:0 auto;"><svg width="120" height="120" viewBox="0 0 120 110" style="display:block;">'+svg+'</svg></div>';
}

function pushConfHistory(conf) {
  let arr = state.confHistory || [];
  arr.push(conf);
  if(arr.length>20)arr=arr.slice(arr.length-20);
  state.confHistory = arr;
  try { localStorage.setItem('ksynth_conf_h', JSON.stringify(arr)); } catch(_) {}
}

function renderM15Bar() {
  let now=Math.floor(Date.now()/1000);
  let elapsed=now%900;
  let pct=elapsed/900*100;
  let mm=Math.floor(elapsed/60),ss=elapsed%60;
  return '<div class="m15-bar-wrap" title="ELAPSED '+('0'+mm).slice(-2)+':'+('0'+ss).slice(-2)+' / 15:00">'+
    '<div class="m15-bar-container">'+
      '<div class="m15-bar-gradient" style="width:'+pct+'%"></div>'+
      '<div class="m15-bar-overlay" style="width:'+(100-pct)+'%"></div>'+
      '<div class="m15-bar-tooltip">'+('0'+mm).slice(-2)+':'+('0'+ss).slice(-2)+' / 15:00</div>'+
    '</div>'+
  '</div>';
}

function renderSessionTimeline() {
  let now=new Date();
  let h=now.getUTCHours(), m=now.getUTCMinutes();
  let currentMin=h*60+m;
  let segs=[{label:'ASIA',start:0,end:540},{label:'LONDON',start:480,end:1020},{label:'NY',start:780,end:1320}];
  let activeSession=' → ';
  let totalMin=1440;
  let nowPct=currentMin/totalMin*100;
  let labels=[];
  for(let i=0;i<segs.length;i++){
    let s=segs[i];
    if(currentMin>=s.start&&currentMin<s.end) activeSession=s.label;
    labels.push('<span>'+s.label+'</span>');
  }
  return '<div class="session-bar-wrap"><div class="session-bar"><div class="session-bar-bg"></div><div class="session-now" style="left:'+nowPct+'%"></div></div></div><div class="session-info"><span>'+activeSession+'</span><span>'+labels.join('  →  ')+'</span></div>';
}

function renderConfSparkline(conf) {
  let h = state.confHistory || [];
  if (h.length < 3) return '';
  let w = 60, ht = 14, min = Math.min(...h), max = Math.max(...h);
  let range = max - min || 1;
  let pts = h.map((v, i) => (i * w / (h.length - 1)).toFixed(1) + ',' + (ht - (v - min) / range * ht).toFixed(1)).join(' ');
  return '<span class="sparkline-wrap"><svg width="' + w + '" height="' + ht + '" viewBox="0 0 ' + w + ' ' + ht + '"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"/></svg></span>';
}

// ── CR Layer Health chips (shared by market view and analysis tab) ──
function renderLayerHealthChips(lh, streaks, cooldowns, threshold) {
  if (!lh || Object.keys(lh).length === 0) return '';
  streaks = streaks || {};
  cooldowns = cooldowns || {};
  threshold = threshold || 3;
  let order = ['tcip','ml','key_level','candle','session','atr','bar','history'];
  let labels = {tcip:'TCIP',ml:'ML',key_level:'KEY',candle:'CNDL',session:'SESN',atr:'ATR',bar:'BAR',history:'HIST'};
  let bgMap = {
    ok: 'rgba(48,209,88,0.15)',
    timeout: 'rgba(255,214,10,0.15)',
    fallback: 'rgba(255,69,58,0.15)',
    inactive: 'rgba(255,255,255,0.05)',
    no_context: 'rgba(64,156,255,0.12)'
  };
  let colorMap = {
    ok: 'var(--green)',
    timeout: 'var(--amber)',
    fallback: 'var(--red)',
    inactive: 'var(--text-tertiary)',
    no_context: '#409CFF'
  };
  let fmtCd = function(s) {
    if (s < 60) return Math.floor(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    return Math.floor(s / 3600) + 'h';
  };
  let chips = '';
  for (let name of order) {
    let l = lh[name];
    if (!l) continue;
    let st = l.status || 'inactive';
    let strk = streaks[name] || 0;
    let txt = (labels[name] || name.slice(0,4).toUpperCase());
    if (strk > 0) txt += ' ' + strk + '/' + threshold;
    let cd = cooldowns[name] || 0;
    if (cd > 1) txt += ' (' + fmtCd(cd) + ')';
    let bg = bgMap[st] || bgMap.inactive;
    let color = colorMap[st] || colorMap.inactive;
    let bdr = strk > 0 ? '2px solid var(--red)' : '1px solid ' + color;
    // Tooltip: score, weight, recent statuses, streak start
    let tip = 'Score: ' + (l.score != null ? Number(l.score).toFixed(1) : '?') +
              '  Weight: ' + (l.weight != null ? Number(l.weight).toFixed(2) : '?');
    let hist = l.status_history;
    if (hist && hist.length) {
      let recent = hist.slice(-5).map(function(s){return s.charAt(0).toUpperCase();}).join(' \u2192 ');
      tip += '\nRecent: ' + recent;
    }
    if (l.streak_started) {
      let age = Math.floor(Date.now()/1000 - l.streak_started);
      tip += '\nStreak started: ' + age + 's ago';
    }
    chips += '<span title="' + esc(tip) + '" style="font-size:7px;font-weight:600;padding:1px 5px;border-radius:3px;' +
      'color:' + color + ';background:' + bg + ';' +
      'border:' + bdr + ';">' + esc(txt) + '</span>';
  }
  return chips;
}

function renderDecision() {
   let el = document.querySelector('#decision-content');
   if (!el) return;

   // Show LLM analyzing overlay if AI is processing
   if (state.ai_analyzing) {
     el.innerHTML = '<div class="waiting-state"><div class="waiting-icon spin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div><span class="waiting-text">LLM ANALYZING</span><div style="margin-top:6px;display:flex;gap:4px;justify-content:center;"><span class="pill-tag m" style="color:var(--cyan);">SYNTHESIZER THINKING</span></div></div>';
     return;
   }

   if (!state.decision) {
     let mode = state.analysisMode || 'ai';
     let modeClr = mode === 'ai' ? 'var(--green)' : 'var(--amber)';
     let modeText = mode === 'ai' ? 'SYNTHESIZER' : 'TCIP MODE';
     let subText = state.openCount > 0 ? 'POSITIONS OPEN' : 'WAITING SIGNAL';
     el.innerHTML = '<div class="waiting-state"><div class="waiting-icon spin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div><span class="waiting-text">' + esc(subText) + '</span><div style="margin-top:6px;display:flex;gap:4px;justify-content:center;"><span class="pill-tag m" style="color:' + modeClr + ';">' + esc(modeText) + '</span></div></div>';
     return;
   }
    let d = state.decision;
    let summary = genSignalSummary(d);
    let summaryBox = '<div style="font-size:10px;line-height:1.45;color:rgba(255,255,255,0.82);background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px;margin-top:8px;">' + esc(summary) + '</div>';
    let dir = (d.direction || '').toUpperCase();
   let isNeutral = dir === 'NEUTRAL' || dir === 'WAIT' || !dir;
   let conf = d.confidence != null ? Math.round(d.confidence) : 0;
   let sym = (d.symbol || '').toUpperCase();
   let tf = (d.timeframe || 'M15').toUpperCase();
    let grade = (d.grade || '').toUpperCase();
    let phase = (d.phase || '').toUpperCase();
    let risk = (d.risk_level || '').toUpperCase();
   let confClr = conf >= 70 ? 'var(--green)' : conf >= 40 ? 'var(--amber)' : 'var(--red)';
   let signalClass = dir === 'BUY' ? 'buy' : dir === 'SELL' ? 'sell' : 'hold';

   // Compute stale flag early so glow classes work (renderDecision runs before renderInfo).
   // FIX (2026-08-02): the local 120s heuristic could never fire — lastDataTs
   // was updated after renderDecision, so the gap was always ~one poll cycle.
   // Python's is_stale (signal_born_ts freshness) is the authoritative source.
   state.lastStale = d.is_stale || false;

        let m15Bar = renderM15Bar();
    // ── Grade badge color (match GUI) ──
   let gradeClr = 'var(--text-muted)';
   if (grade === 'ULTIMATE') gradeClr = 'var(--gold)';
   else if (grade === 'APLUS') gradeClr = '#FF9F0A';
   else if (grade === 'A') gradeClr = 'var(--green)';
   else if (grade === 'BPLUS') gradeClr = 'var(--amber)';

   // ── Confidence label + bar color ──
   let confLabel = conf >= 70 ? 'HIGH CONFIDENCE' : conf >= 40 ? 'MODERATE CONFIDENCE' : 'LOW CONFIDENCE';
   let confBarClr = conf >= 70 ? 'var(--green)' : conf >= 40 ? 'var(--amber)' : 'var(--red)';

    // ── Warmup degraded indicator ──
    let warmupBadge = '';
    if (d.warmup_degraded) {
      warmupBadge = '<span class="pill-tag" style="background:rgba(255,159,10,0.10);color:#FF9F0A;border-color:rgba(255,159,10,0.22);">! WARMUP</span>';
    }

    // ── Oscillation / Whipsaw detection ──
    let oscBadge = '';
    let weaknesses = d.weaknesses || [];
   let hasOsc = false;
   for (let wi = 0; wi < weaknesses.length; wi++) {
     let sw = (weaknesses[wi] || '').toUpperCase();
     if (sw.indexOf('OSCILLATION') >= 0 || sw.indexOf('DIRECTION UNSTABLE') >= 0) hasOsc = true;
   }
   let tc = d.trend_consistency_pct;
   if (hasOsc) {
     oscBadge = '<span class="pill-tag r" style="background:rgba(255,69,58,0.10);color:#FF453A;border-color:rgba(255,69,58,0.22);">&#x21BB; OSCILLATION</span>';
   } else if (tc != null && tc > 0 && tc < 60) {
     oscBadge = '<span class="pill-tag" style="background:rgba(255,214,10,0.10);color:#FFD60A;border-color:rgba(255,214,10,0.22);">&#x21BB; WHIPSAW ' + tc.toFixed(0) + '%</span>';
   }

   // ── Holy Grail badge ──
   let hgBadge = '';
   if (d.holy_grail) {
     hgBadge = '<span style="font-size:10px;font-weight:700;color:var(--gold);background:rgba(90,200,250,0.2);padding:1px 5px;border-radius:3px;font-family:\'JetBrains Mono\',monospace;letter-spacing:0.5px;">* HOLYGRAIL *</span>';
   }

   // ── Mode badge (always visible) ──
   // MIRROR FIX (2026-08-01): match the desktop GUI's mode label — provider
   // name when AI is available (append ' AI' unless the name contains it),
   // else 'SYNTHESIZER'; 'TCIP MODE' when no AI. The Python side now emits
   // the penalized confidence in d.confidence, so both dashboards agree.
   let mode = state.analysisMode || 'ai';
   let modeClr = d.ai_available ? 'var(--green)' : 'var(--amber)';
   let modeText = 'TCIP MODE';
   if (d.ai_available) {
     let prov = (d.ai_provider || '').toUpperCase().replace(/_/g, ' ');
     if (prov && prov.indexOf('AI') >= 0) modeText = prov;
     else if (prov) modeText = prov + ' AI';
     else modeText = 'SYNTHESIZER';
   }
   let modePill = '<span class="pill-tag m" style="color:' + modeClr + ';">' + esc(modeText) + '</span>';

   // ── Current Price ──
   let priceStr = '';
   if (d.current_price != null && d.current_price > 0) {
     let fmtP = fmtPrice(d.current_price, sym);
     priceStr = '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--gold);font-weight:700;">' + fmtP + '</span>';
   }

   // ── MTF alignment (always shown when any directional data exists) ──
   let mtfHtml = '';
   let mtf_keys = ['mtf_d1_dir','mtf_h4_dir','mtf_h1_dir','mtf_m30_dir','mtf_m15_dir'];
   let mtf_score_keys = ['mtf_d1_score','mtf_h4_score','mtf_h1_score','mtf_m30_score','mtf_m15_score'];
   let mtf_labels = ['D1','H4','H1','M30','M15'];
   let mtf_parts = [];
   let hasMtf = false;
   for (let mi = 0; mi < mtf_keys.length; mi++) {
     let md = (d[mtf_keys[mi]] || 'NEUTRAL').toUpperCase();
     if (md !== 'NEUTRAL' && md !== '') hasMtf = true;
     let ms = d[mtf_score_keys[mi]] || 0;
     let mc = md === 'BUY' || md === 'BULL' || md === 'BULLISH' ? 'var(--green)' : md === 'SELL' || md === 'BEAR' || md === 'BEARISH' ? 'var(--red)' : 'rgba(255,255,255,0.40)';
     mtf_parts.push('<span style="color:' + mc + ';font-weight:700;" title="' + mtf_labels[mi] + ' SCORE ' + ms + '">' + mtf_labels[mi] + '</span>');
   }
   if (hasMtf) {
     mtfHtml = '<div style="font-size:10px; font-weight:600; font-family:\'JetBrains Mono\',monospace; margin-bottom:6px;">' +
       '<span style="color:rgba(255,255,255,0.45);">MTF</span> ' + mtf_parts.join('<span style="color:rgba(255,255,255,0.15);"> </span>') +
       (d.regime ? ' <span style="color:var(--amber);margin-left:6px;">' + esc(d.regime.toUpperCase()) + '</span>' : '') + '</div>';
   }

    // ── NEUTRAL / no directional signal → show comprehensive waiting state ──
    if (isNeutral) {
      let subText = state.openCount > 0 ? 'POSITIONS OPEN' : 'WAITING SIGNAL';
      el.innerHTML = '<div class="decision-block">' +
        '<div class="dec-top-row">' +
          '<div class="dec-signal-info"><span class="signal-badge hold">WAIT</span><span class="dec-sym-tf">' + esc(sym) + ' ' + esc(tf) + '</span>' + m15Bar + '</div>' +
          '<span class="dec-conf" style="color:' + confClr + ';">' + conf + '%' + renderConfSparkline(conf) + '</span>' +
        '</div>' +
        (priceStr ? '<div style="margin:4px 0;">' + priceStr + '</div>' : '') +
        '<div class="confidence-bar" style="margin-bottom:4px;"><div class="confidence-fill" style="width:' + conf + '%;background:' + confBarClr + ';"></div></div>' +
        '<div style="font-size:9px;color:' + confClr + ';font-weight:600;margin-bottom:6px;">' + confLabel + '</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;">' +
          '<span class="pill-tag c" style="color:' + gradeClr + ';">' + esc(grade) + '</span>' +
          '<span class="pill-tag r">' + esc(risk) + '</span>' +
          '<span class="pill-tag e">' + esc(translatePhase(phase)) + '</span>' +
           modePill + hgBadge + oscBadge + warmupBadge +
        '</div>' +
        mtfHtml +
        summaryBox +
        (d.position_open ? '<div style="font-size:10px; font-weight:700; color:var(--amber); margin-top:6px;padding:6px;background:rgba(255,214,10,0.08);border:1px solid rgba(255,214,10,0.2);border-radius:4px;font-family:\'JetBrains Mono\',monospace;">ALREADY OPEN POSITION \u2014 MONITORING</div>' : '') +
      '</div>';
    } else {

    // ── DIRECTIONAL SIGNAL ──

   // ── Top row: direction badge | symbol/tf | M15 countdown | confidence ──
   let html = '<div class="decision-block">' +
     '<div class="dec-top-row">' +
       '<div class="dec-signal-info">' +
         // FE-3: escape dir — API-derived free text in innerHTML.
         '<span class="signal-badge ' + signalClass + '">' + esc(dir) + '</span>' +
         '<span class="dec-sym-tf">' + esc(sym) + ' ' + esc(tf) + '</span>' +
         m15Bar +
       '</div>' +
       '<span class="dec-conf" style="color:' + confClr + ';">' + conf + '%' + renderConfSparkline(conf) + '</span>' +
     '</div>' +
      (priceStr ? '<div style="margin:4px 0;">' + priceStr + '</div>' : '') +
      '<div class="confidence-bar" style="margin-bottom:4px;"><div class="confidence-fill" style="width:' + conf + '%;background:' + confBarClr + ';"></div></div>' +
       '<div style="font-size:9px;color:' + confClr + ';font-weight:600;margin-bottom:6px;">' + confLabel + '</div>';

   // ── Pills: grade | risk | phase | flags ──
   let flagPills = '';
   if (d.entry_strength) flagPills += '<span class="pill-tag e" style="background:rgba(48,209,88,0.08);color:#30D158;border-color:rgba(48,209,88,0.2);">' + esc(translateEntryStrength(d.entry_strength)) + '</span>';
   if (d.stability === 'LOW') flagPills += '<span class="pill-tag r" style="background:rgba(255,69,58,0.08);color:#FF453A;border-color:rgba(255,69,58,0.2);">UNSTABLE</span>';
   else if (d.stability === 'HIGH') flagPills += '<span class="pill-tag e" style="background:rgba(48,209,88,0.08);color:#30D158;border-color:rgba(48,209,88,0.2);">STABLE</span>';
   if (d.is_dead_zone) flagPills += '<span class="pill-tag r" style="background:rgba(255,69,58,0.12);color:#FF453A;border-color:rgba(255,69,58,0.28);">DEAD ZONE</span>';
   if (d.ml_rejected) flagPills += '<span class="pill-tag r" style="background:rgba(255,69,58,0.12);color:#FF453A;border-color:rgba(255,69,58,0.28);">ML REJECTED</span>';
   html += '<div style="display:flex; gap:4px; flex-wrap:wrap; margin:6px 0;">' +
     '<span class="pill-tag c" style="color:' + gradeClr + ';">' + esc(grade) + '</span>' +
     '<span class="pill-tag r">' + esc(risk) + '</span>' +
     '<span class="pill-tag e">' + esc(phase) + '</span>' +
      modePill + hgBadge + oscBadge + warmupBadge + flagPills +
    '</div>';

   // ── MTF alignment row ──
   if (mtfHtml) {
     html += mtfHtml;
   }

   // ── LLM verdict block ──
    if (d.ai_available) {
      let fr = (d.final_reco || 'WAIT').toUpperCase();
      let verdictLabel, verdictColor;
      if (fr === 'ENTRY') { verdictLabel = 'LLM APPROVED'; verdictColor = 'var(--green)'; }
      else if (fr === 'SKIP') { verdictLabel = 'LLM REJECTED'; verdictColor = 'var(--red)'; }
      else { verdictLabel = 'LLM WAIT'; verdictColor = 'var(--amber)'; }

      let recText = fr;
     let vHtml = '<div style="margin-top:8px; padding:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:6px; backdrop-filter:blur(8px);">' +
       '<div style="font-size:10px; font-weight:700; color:' + verdictColor + ';">' + verdictLabel + ' · <span style="color:rgba(255,255,255,0.85);">' + esc(recText) + '</span></div>';
      if (d.rationale) {
        let rat = d.rationale.trim().toUpperCase();
        vHtml += '<div style="font-size:9px; color:rgba(255,255,255,0.70); margin-top:4px; line-height:1.3;">' + esc(rat) + '</div>';
      }
     let rejectionReasons = [];
     if (d.filter_reason) rejectionReasons.push('FILTER: ' + d.filter_reason);
     if (d.hierarchy_reason) rejectionReasons.push('HIERARCHY: ' + d.hierarchy_reason);
     if (rejectionReasons.length > 0) {
       vHtml += '<div style="font-size:9px; color:var(--red); margin-top:4px; font-weight:600;">X ' + esc(rejectionReasons.join(' | ').toUpperCase()) + '</div>';
     }
     vHtml += '</div>';
     html += vHtml;
   }

    // ── Position status ──
    if (d.position_open) {
      html += '<div style="font-size:10px; font-weight:700; color:var(--amber); margin-top:6px;padding:6px;background:rgba(255,214,10,0.08);border:1px solid rgba(255,214,10,0.2);border-radius:4px;font-family:\'JetBrains Mono\',monospace;">ALREADY OPEN POSITION \u2014 MONITORING</div>';
    }
    // Position close detection
   if (state._lastEntrySym && !(state.positions || []).some(p => p.symbol === state._lastEntrySym)) {
     html += '<div style="margin-top:8px; padding:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:6px; backdrop-filter:blur(8px);">' +
              '<div style="font-size:10px; font-weight:700; color:rgba(255,255,255,0.45);">POSITION CLOSED · VERDICT CLEARED</div></div>';
     state._lastEntrySym = null;
   }
   if (state.decision && state.decision.decision === 'ENTRY' && state.decision.symbol) {
     state._lastEntrySym = state.decision.symbol;
   }

    // ── Human-readable decision line ──
     html += '<div style="margin-top:6px; font-size:10px; color:var(--amber); font-weight:500; line-height:1.3;">' + esc(genDecisionHuman(d)) + '</div>';
     html += '</div>' + summaryBox;
    el.innerHTML = html;
    }

    // ── TRADER'S NOTES & RISK (merged into SIGNAL card) ──
   let notesLeftEl = document.querySelector('#notes-left');
   let notesRightEl = document.querySelector('#notes-right');
   if (notesLeftEl && notesRightEl) {
     let isNeutral2 = dir === 'NEUTRAL' || dir === 'WAIT' || !dir;
     // LEFT: TRADER'S NOTES
     let lHtml = '<div style="font-family:\'JetBrains Mono\',monospace;">';
     let notesText = '';
     let rationale = d.rationale || '';
     if (rationale && !isNeutral2) {
       // FE-1 FIX (2026-08-01): escape BEFORE transforming. rationale is
       // LLM-generated free text served via /public/dashboard — the old code
       // rendered it unescaped into innerHTML (stored XSS; toUpperCase does
       // not neutralize <IMG ONERROR=...>).
       notesText = esc(rationale.trim().toUpperCase().replace(/\(/g, '[').replace(/\)/g, ']'));
     } else if (isNeutral2) {
       notesText = '';
      } else {
        let g = (d.grade || 'NEUTRAL').toUpperCase();
        let v = (d.verdict || '').toUpperCase();
        let es = translateEntryStrength(d.entry_strength || '');
        let ph = translatePhase(d.phase || '');
        let bl2 = (d.bar_level || '').toUpperCase();
        let div2 = (d.divergence_status || 'NONE').toUpperCase();
        let rr = d.risk_reward || 0;
        notesText = esc(g) + ' ' + esc(dir) + ' ' + esc(v);
        if (es) notesText += ' ' + esc(es);
        notesText += ' ' + esc(ph) + ' BAR ' + esc(bl2);
        if (div2 !== 'NONE') notesText += ' DIV ' + esc(div2);
        notesText += ' R:R ' + rr.toFixed(1);
      }
     if (notesText) {
       lHtml += '<div style="font-size:9px;line-height:1.4;color:rgba(255,255,255,0.70);margin-bottom:4px;">' + notesText + '</div>';
     }
     let mtfWarnings3 = d.mtf_warnings || [];
     if (mtfWarnings3.length > 0) {
       let warnParts3 = [];
       for (let w = 0; w < Math.min(mtfWarnings3.length, 3); w++) {
         warnParts3.push(esc((mtfWarnings3[w].timeframe || '?').toUpperCase()) + '=' + esc(mtfWarnings3[w].direction || '?'));
       }
       lHtml += '<div style="font-size:9px;color:var(--amber);font-weight:700;margin-bottom:4px;">MTF CONFLICT: ' + warnParts3.join(' ') + '</div>';
     }
     let techParts3 = [];
     if (d.rsi_14 != null) {
       let rc3 = d.rsi_14 >= 50 ? 'var(--green)' : 'var(--red)';
       techParts3.push('RSI <span style="color:' + rc3 + ';font-weight:700;">' + d.rsi_14.toFixed(1) + '</span>');
     }
     if (d.macd_hist != null) {
       let mc3 = d.macd_hist >= 0 ? 'var(--green)' : 'var(--red)';
       techParts3.push('MACD <span style="color:' + mc3 + ';font-weight:700;">' + (d.macd_hist >= 0 ? '+' : '') + d.macd_hist.toFixed(3) + '</span>');
     }
     if (d.bb_pct_b != null) {
       let bc3 = d.bb_pct_b >= 0.3 && d.bb_pct_b <= 0.7 ? 'var(--green)' : 'var(--amber)';
       techParts3.push('BB <span style="color:' + bc3 + ';font-weight:700;">' + d.bb_pct_b.toFixed(2) + '</span>');
     }
      if (d.confluence_score) techParts3.push('CONF <span style="color:var(--cyan);font-weight:700;">' + d.confluence_score + '</span>');
      if (d.additional_confirmations) techParts3.push('+' + d.additional_confirmations + ' CONFIRM');
      if (d.composite_score) techParts3.push('CMP <span style="color:var(--cyan);font-weight:700;">' + d.composite_score + '</span>');
      if (d.coherence_score) techParts3.push('CHR <span style="color:var(--cyan);font-weight:700;">' + d.coherence_score + '</span>');
      if (d.calibrated_confidence) techParts3.push('CAL <span style="color:var(--cyan);font-weight:700;">' + d.calibrated_confidence + '</span>');
      if (d.unified_score) techParts3.push('UNI <span style="color:var(--gold);font-weight:700;">' + d.unified_score + '</span>');
      if (d.tech_score) techParts3.push('TECH <span style="color:var(--green);font-weight:700;">' + d.tech_score + '</span>');
      if (d.current_cvd != null && d.current_cvd !== 0) techParts3.push('CVD <span style="color:' + (d.current_cvd >= 0 ? 'var(--green)' : 'var(--red)') + ';font-weight:700;">' + (d.current_cvd >= 0 ? '+' : '') + d.current_cvd.toFixed(2) + '</span>');
      if (techParts3.length > 0) {
        lHtml += '<div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:4px;">' + techParts3.join(' &middot; ') + '</div>';
      }
      // Extra signal fields
      let extraParts3 = [];
      let stab3 = (d.stability || '').toUpperCase();
      if (stab3 && stab3 !== 'NONE' && stab3 !== 'STABLE MEDIUM') {
        let stabClr3 = stab3 === 'HIGH' ? 'var(--green)' : (stab3 === 'LOW' || stab3 === 'DEAD') ? 'var(--red)' : 'var(--amber)';
        extraParts3.push('STAB <span style="color:' + stabClr3 + ';font-weight:700;">' + stab3 + '</span>');
      }
      if (d.atr != null && d.atr > 0) extraParts3.push('ATR <span style="color:rgba(255,255,255,0.60);font-weight:600;">' + d.atr.toFixed(2) + 'pts</span>');
      if (d.suggested_sl_pips != null && d.suggested_sl_pips > 0) extraParts3.push('SL <span style="color:var(--red);font-weight:700;">' + d.suggested_sl_pips + 'pts</span>');
      if (d.suggested_tp_pips != null && d.suggested_tp_pips > 0) extraParts3.push('TP <span style="color:var(--green);font-weight:700;">' + d.suggested_tp_pips + 'pts</span>');
      if (extraParts3.length > 0) {
        lHtml += '<div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:4px;">' + extraParts3.join(' &middot; ') + '</div>';
      }
      // Flag lines
      let flagLines3 = [];
      if (d.roll_under_reco && d.roll_under_reco !== '') flagLines3.push('<span style="color:var(--amber);font-weight:700;">ROLLUNDER: ' + esc(d.roll_under_reco) + '</span>');
      if (d.inferred_reversal && d.inferred_reversal !== 'NONE') flagLines3.push('<span style="color:var(--red);font-weight:700;">REVERSAL: ' + esc(d.inferred_reversal) + ' ' + (d.reversal_confidence != null ? (d.reversal_confidence * 100).toFixed(0) : '--') + '%</span>');
      if (d.is_dead_zone) flagLines3.push('<span style="color:var(--red);font-weight:700;">DEAD ZONE</span>');
      if (d.divergence_downgraded) flagLines3.push('<span style="color:var(--red);font-weight:700;">DIV DOWNGRADED</span>');
      if (d.smc_warning) flagLines3.push('<span style="color:var(--amber);font-weight:700;">SMC WARNING</span>');
      if (d.smc_confluence > 0) flagLines3.push('<span style="color:var(--green);font-weight:700;">SMC +' + d.smc_confluence + '</span>');
      if (d.is_counter_trend || (d.counter_trend_bias && d.counter_trend_bias !== 'NONE')) flagLines3.push('<span style="color:var(--amber);font-weight:700;background:rgba(255,214,10,0.15);padding:1px 6px;border-radius:4px;border:1px solid rgba(255,214,10,0.3);">WARNING: CT-PULLBACK (50% LOT / 50PT SL)</span>');
      if (d.institutional_flow_score) flagLines3.push('<span style="color:var(--purple);font-weight:700;">FLOW ' + d.institutional_flow_score + '</span>');
      if (d.ml_confidence) flagLines3.push('<span style="color:var(--cyan);font-weight:700;">ML ' + d.ml_confidence + '%</span>');
      if (flagLines3.length > 0) {
        lHtml += '<div style="font-size:9px;margin-bottom:4px;">' + flagLines3.join(' &middot; ') + '</div>';
      }
      let ctxParts3 = [];
     let ctx3 = d.primary_context || '';
     if (ctx3 && ctx3 !== 'NEUTRAL') ctxParts3.push(esc(ctx3.toUpperCase()));
     let bias3 = d.primary_bias || '';
     if (bias3 && bias3 !== 'NEUTRAL') ctxParts3.push(esc(bias3.toUpperCase()));
     let flow3 = d.flow_direction || '';
     if (flow3 && flow3 !== 'NEUTRAL') {
       let flowClr3 = flow3 === 'BULLISH' || flow3 === 'BULL' ? 'var(--green)' : 'var(--red)';
       ctxParts3.push('FLOW <span style="color:' + flowClr3 + ';font-weight:700;">' + esc(flow3) + '</span>');
     }
     if (ctxParts3.length > 0) {
       lHtml += '<div style="font-size:9px;color:rgba(255,255,255,0.35);">' + ctxParts3.join(' &middot; ') + '</div>';
     }
     lHtml += '</div>';
     notesLeftEl.innerHTML = lHtml;

     // RIGHT: RISK & CRITIQUE
     let riskHtml = '<div style="font-family:\'JetBrains Mono\',monospace;">';
     let wk = d.weaknesses || [];
     let hasOsc3 = false;
     for (let wi = 0; wi < wk.length; wi++) {
       let sw3 = (wk[wi] || '').toUpperCase();
       if (sw3.indexOf('OSCILLATION') >= 0 || sw3.indexOf('DIRECTION UNSTABLE') >= 0) hasOsc3 = true;
     }
     let riskFlags = [];
     let cvdEff3 = d.cvd_efficiency;
     if (cvdEff3 != null && typeof cvdEff3 === 'number' && cvdEff3 < 0.4) riskFlags.push('CVD FLOW NOT RELIABLE');
     let wa3 = d.weighted_alignment;
     if (wa3 != null && typeof wa3 === 'number' && wa3 < 0.6) riskFlags.push('LOW ALIGNMENT');
     if (d.bar_opposing) riskFlags.push('BAR OPPOSING');
     if (d.divergence_status && d.divergence_status !== 'NONE') riskFlags.push(translateDivergence(d.divergence_status));
     if (d.bar_level === 'DEAD' || d.bar_level === 'WEAK') riskFlags.push('BAR WEAK');
     if (hasOsc3) riskFlags.push('OSCILLATION');
     else if (d.trend_consistency_pct != null && d.trend_consistency_pct > 0 && d.trend_consistency_pct < 60) riskFlags.push('WHIPSAW ' + d.trend_consistency_pct.toFixed(0) + '%');
     if (d.ml_rejected) riskFlags.push('ML REJECTED');
     if (d.risk_level === 'HIGH') riskFlags.push('HIGH RISK');
     if (d.stability === 'LOW') riskFlags.push('UNSTABLE');
     if (d.filter_reason) riskFlags.push('FILTER: ' + d.filter_reason);
     if (d.hierarchy_reason) riskFlags.push('HIER: ' + d.hierarchy_reason);
     if (riskFlags.length >= 2) {
       riskHtml += '<div style="font-size:9px;line-height:1.5;color:var(--red);margin-bottom:4px;">' + esc(riskFlags.join(' + ')) + ' &rarr; SKIP FOR NOW</div>';
     } else if (riskFlags.length === 1) {
       riskHtml += '<div style="font-size:9px;line-height:1.5;color:var(--amber);margin-bottom:4px;">' + esc(riskFlags[0]) + ' &rarr; CONFIRM MANUALLY</div>';
     } else {
       riskHtml += '<div style="font-size:9px;color:var(--green);margin-bottom:4px;">NO SIGNIFICANT RISK &rarr; READY TO EXECUTE</div>';
     }
     let mtfW3 = d.mtf_warnings || [];
     if (mtfW3.length > 0) {
       let wp3 = [];
       for (let w = 0; w < Math.min(mtfW3.length, 3); w++) wp3.push(esc((mtfW3[w].timeframe || '?').toUpperCase()) + '=' + esc(mtfW3[w].direction || '?'));
       riskHtml += '<div style="font-size:9px;color:var(--amber);font-weight:700;margin-top:4px;">MTF CONFLICT: ' + wp3.join(' ') + '</div>';
     }
     if (wk.length > 0) {
       riskHtml += '<div style="margin-top:6px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.45);letter-spacing:0.5px;text-transform:uppercase;">DEVIL\'S ADVOCATE</div>';
       for (let wi = 0; wi < Math.min(wk.length, 4); wi++) {
         let wStr3 = esc((wk[wi] || '').toUpperCase()).substring(0,100);
         riskHtml += '<div style="font-size:9px;line-height:1.4;color:rgba(255,255,255,0.60);">* ' + wStr3 + '</div>';
       }
     }
      let rl3 = (d.risk_level || 'LOW').toUpperCase();
     if (rl3 === 'HIGH') {
       riskHtml += '<div style="font-size:9px;font-weight:700;display:inline-block;color:var(--red);background:rgba(255,69,58,0.12);padding:1px 6px;border-radius:20px;margin-top:3px;border:1px solid rgba(255,69,58,0.25);">SKIP</div>';
     } else if (rl3 === 'MODERATE') {
       riskHtml += '<div style="font-size:9px;font-weight:600;display:inline-block;color:var(--amber);background:rgba(255,214,10,0.10);padding:1px 6px;border-radius:20px;margin-top:3px;border:1px solid rgba(255,214,10,0.22);">' + esc((d.direction || '') + ' RISKY') + '</div>';
     }
     riskHtml += '</div>';
     notesRightEl.innerHTML = riskHtml;
   }

   let sigHash = d.symbol + d.direction + d.confidence + d.grade + d.tcip_component + d.ml_component + d.ml_rejected + d.entry_strength + d.stability;
  if (state.prevSignalHash && state.prevSignalHash !== sigHash) {
    document.getElementById('card-decision').classList.remove('pulse-glow');
    void document.getElementById('card-decision').offsetWidth;
    document.getElementById('card-decision').classList.add('pulse-glow');
    document.getElementById('card-info').classList.add('pulse-glow');
  }
  state.prevSignalHash = sigHash;

  let decCard = document.getElementById('card-decision');
  decCard.classList.remove('glow-divergence', 'glow-stale', 'holy-grail', 'god-mode-card');
  let pEl = decCard.querySelector('.particle-container');
  if (pEl) pEl.remove();
  if (d.divergence_status && d.divergence_status !== 'NONE' && d.direction !== 'NEUTRAL') {
    decCard.classList.add('glow-divergence');
  }
  if (d.god_mode) {
    decCard.classList.add('god-mode-card');
    let pc = document.createElement('div');
    pc.className = 'particle-container';
    pc.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;';
    for (let pi=0;pi<12;pi++) {
      let pt = document.createElement('div');
      pt.className = 'particle';
      pt.style.cssText = 'left:'+(5+Math.random()*90)+'%;top:'+(30+Math.random()*60)+'%;background:'+(['#BF5AF2','#5E5CE6','#FF375F','#FFD60A','#30D158'][pi%5])+';animation-delay:'+(Math.random()*0.6)+'s;animation-duration:'+(0.8+Math.random()*0.8)+'s;width:'+(3+Math.random()*4)+'px;height:'+(3+Math.random()*4)+'px;';
      pc.appendChild(pt);
    }
    decCard.appendChild(pc);
  } else {
    let crVals = [d.tcip_component||0,d.key_level_score||0,d.candle_score||0,d.session_score||0,d.atr_score||0,d.ml_component||0];
    let allCrOk = crVals.every(function(v){ return v >= 60; });
    let confOk = (d.confidence||0) >= 80;
    if (allCrOk && confOk) {
      decCard.classList.add('holy-grail');
      let pc = document.createElement('div');
      pc.className = 'particle-container';
      pc.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;';
      for (let pi=0;pi<8;pi++) {
        let pt = document.createElement('div');
        pt.className = 'particle';
        pt.style.cssText = 'left:'+(10+Math.random()*80)+'%;top:'+(50+Math.random()*40)+'%;background:'+(['#30D158','#0A84FF','#BF5AF2','#FFD60A'][pi%4])+';animation-delay:'+(Math.random()*0.4)+'s;';
        pc.appendChild(pt);
      }
      decCard.appendChild(pc);
    }
  }
  if (state.lastStale) { decCard.classList.add('glow-stale'); }
  pushConfHistory(conf);
}



function renderMarket() {
  let el = document.querySelector('#market-content');
  if (!el) return;
  let items = state.market;
  if (!items || items.length === 0) {
    el.innerHTML = '<div class="waiting-state"><div class="waiting-icon spin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><span class="waiting-text">CONNECTING TO MARKET FEED</span></div>';
    renderPositions(el);
    return;
  }
  let html = '<div class="row-header"><span>Sym</span><span style="text-align:right">Bid</span><span style="text-align:right">Ask</span><span style="text-align:right">Sprd</span><span style="text-align:right">Chg</span></div>';
  let max = Math.min(items.length, 6);
  for (let i = 0; i < max; i++) {
    let m = items[i];
    let sym = m.symbol || m.sym || '';
    let bid = m.bid != null ? m.bid : 0;
    let ask = m.ask != null ? m.ask : 0;
    let spread = m.spread != null ? m.spread : (ask - bid);
    let chg = m.change || m.chg || 0;
    let chgClr = chg >= 0 ? 'var(--green)' : 'var(--red)';
    let chgIcon = chg >= 0 ? '+' : '';
    let prevBid = state.prevPrices[sym] || bid;
    let flashCls = bid > prevBid ? ' flash-green' : bid < prevBid ? ' flash-red' : '';
    state.prevPrices[sym] = bid;
      html += '<div class="row-line' + flashCls + '">' +
        '<span class="row-sym">' + esc(sym) + '</span>' +
        '<span class="row-bid">' + fmtPrice(bid, sym, m.digits) + '</span>' +
        '<span class="row-ask">' + fmtPrice(ask, sym, m.digits) + '</span>' +
        '<span class="row-spread">' + (Number.isInteger(spread) ? spread : spread.toFixed(1)) + '</span>' +
        '<span class="row-chg" style="color:' + chgClr + ';">' + chgIcon + chg.toFixed(2) + '%</span>' +
      '</div>';
  }
  el.innerHTML = html;
  renderPositions(el);
  renderPendingOrders(el);
  let d = state.decision;
  if (d) {
    let mktHuman = genMarketHuman(d);
    el.insertAdjacentHTML('beforeend', '<div style="margin:6px 14px 4px;font-size:10px;color:var(--amber);font-weight:500;line-height:1.3;">' + esc(mktHuman) + '</div>');
  }
  el.insertAdjacentHTML('beforeend', renderSessionTimeline());

  // ── CR Layer Health chips (inline in main market view) ──
  let lh = state.cr_engine_stats && state.cr_engine_stats.last_layer_health;
  if (lh && Object.keys(lh).length > 0) {
    let poolOk = state.cr_engine_stats.last_pool_healthy !== false;
    let streaks = (state.cr_engine_stats && state.cr_engine_stats.layer_alert_streaks) || {};
    let threshold = (state.cr_engine_stats && state.cr_engine_stats.layer_alert_threshold) || 3;
    let cooldowns = (state.cr_engine_stats && state.cr_engine_stats.layer_cooldown_remaining) || {};
    let chips = renderLayerHealthChips(lh, streaks, cooldowns, threshold);
    let html2 = '<div style="margin:8px 14px 4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
    html2 += '<span style="font-size:8px;color:var(--text-secondary);font-weight:600;">CR</span>';
    html2 += chips;
    if (!poolOk) html2 += '<span style="font-size:7px;color:var(--amber);font-weight:600;">FALLBACK</span>';
    html2 += '</div>';
    el.insertAdjacentHTML('beforeend', html2);
  }

  // ── Fast-Path Gate Rejection counters ──
  let fp = state.fast_path_gate_rejections;
  if (fp) {
    let total = (fp.bar_opposing||0) + (fp.counter_trend||0) + (fp.rsi_extreme||0);
    let gates = [
      {key:'bar_opposing', label:'BAR'},
      {key:'counter_trend', label:'CT'},
      {key:'rsi_extreme', label:'RSI'}
    ];
    let fphtml = '<div style="margin:4px 14px 4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    fphtml += '<span style="font-size:8px;color:var(--text-secondary);font-weight:600;">FP</span>';
    for (let g of gates) {
      let c = fp[g.key]||0;
      let clr = c > 0 ? 'var(--amber)' : 'var(--text-muted)';
      let w = c > 0 ? '700' : '400';
      fphtml += '<span style="font-size:9px;color:'+clr+';font-weight:'+w+';font-family:monospace;" title="'+g.key+': '+c+'/'+total+' fast-path rejections">'+g.label+':'+c+'</span>';
    }
    fphtml += '</div>';
    el.insertAdjacentHTML('beforeend', fphtml);
  }

  // ── Rejection counters (SR proximity, AI skip, signal filter, phase gate) ──
  let rc = state.rejection_counters;
  let rr = state.rejection_reasons || {};
  if (rc) {
    let gates = [
      {key:'sr_proximity', label:'SR'},
      {key:'ai_buffered_skip', label:'AI'},
      {key:'signal_filter', label:'FL'},
      {key:'phase_gate', label:'PH'}
    ];
    let rchtml = '<div style="margin:2px 14px 6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    rchtml += '<span style="font-size:8px;color:var(--text-secondary);font-weight:600;">RJ</span>';
    for (let g of gates) {
      let c = rc[g.key]||0;
      let clr = c > 0 ? 'var(--red)' : 'var(--text-muted)';
      let w = c > 0 ? '700' : '400';
      let reason = rr[g.key] || '';
      let tip = g.key + ': ' + c + ' rejections' + (reason ? ' — ' + reason : '');
      rchtml += '<span style="font-size:9px;color:'+clr+';font-weight:'+w+';font-family:monospace;" title="' + esc(tip) + '">'+g.label+':'+c+'</span>';
    }
    rchtml += '</div>';
    el.insertAdjacentHTML('beforeend', rchtml);
  }
}

function renderPendingOrders(el) {
  let orders = state.orders;
  if (!orders || orders.length === 0) return;
  let ohtml = '<div class="pos-section"><div class="pos-title">PENDING ORDERS</div>';
  for (let j = 0; j < orders.length; j++) {
    let o = orders[j];
    let oSym = o.symbol || ' → ';
    let oType = o.type_str || 'LIMIT';
    let oPrice = o.price != null && o.price > 0 ? o.price : null;  // null when redacted (public mode strips price)
    let oDirCls = (oType || '').indexOf('BUY') >= 0 ? 'buy' : 'sell';
    let oLot = o.volume || 0;
    let oSl = o.sl || 0;
    let oTp = o.tp || 0;
    // L60 FIX (2026-08-06): a missing time_setup rendered the current epoch
    // as a thousands-of-hours age; guard it and show '--' until the order
    // carries a setup timestamp.
    let ageSec = (o.time_setup && o.time_setup > 0) ? Math.floor(Date.now()/1000 - o.time_setup) : -1;
    let ageStr = ageSec < 0 ? '--' : ageSec < 60 ? ageSec + 's' : ageSec < 3600 ? Math.floor(ageSec/60) + 'm' : Math.floor(ageSec/3600) + 'h';
    let oTypeShort = oType.replace('_LIMIT', ' LMT').replace('_STOP', ' STP');
    ohtml += '<div class="pos-item" style="border-color:rgba(10,132,255,0.30);">' +
      '<div class="pos-head"><span class="pos-sym">' + esc(oSym) + '</span><span class="pos-dir ' + oDirCls + '">' + esc(oTypeShort) + '</span><span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--cyan);">AGE ' + ageStr + '</span></div>' +
      '<div class="pos-details">' +
        '<div class="pos-detail"><span class="pos-dlbl">PRICE</span><span class="pos-dval" style="color:var(--cyan);font-weight:700;">' + (oPrice ? fmtPrice(oPrice, oSym) : ' — ') + '</span></div>' +
        '<div class="pos-detail"><span class="pos-dlbl">LOT</span><span class="pos-dval">' + oLot.toFixed(2) + '</span></div>' +
        '<div class="pos-detail"><span class="pos-dlbl">SL</span><span class="pos-dval" style="color:var(--red)">' + (oSl ? fmtPrice(oSl, oSym) : ' — ') + '</span></div>' +
        '<div class="pos-detail"><span class="pos-dlbl">TP</span><span class="pos-dval" style="color:var(--green)">' + (oTp ? fmtPrice(oTp, oSym) : ' — ') + '</span></div>' +
      '</div></div>';
  }
  el.insertAdjacentHTML('beforeend', ohtml);
}

function renderPositions(el) {
  let pos = state.positions;
  if (!pos || pos.length === 0) return;
  let d = state.decision;
  let hg = d && d.holy_grail ? 1 : 0;
  let gm = d && d.god_mode ? 1 : 0;
  let phtml = '<div class="pos-section"><div class="pos-title" style="display:flex;align-items:center;gap:6px;">OPEN POSITIONS' +
    (gm ? '<span style="font-size:7px;font-weight:700;letter-spacing:0.12em;color:#BF5AF2;background:rgba(191,90,242,0.12);border:1px solid rgba(191,90,242,0.35);padding:2px 6px;border-radius:20px;text-transform:uppercase;"><svg style="width:8px;height:8px;vertical-align:text-top;margin-right:2px;" viewBox="0 0 24 24" fill="none" stroke="#BF5AF2" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>GOD MODE</span>' : hg ? '<span style="font-size:7px;font-weight:700;letter-spacing:0.12em;color:#30D158;background:rgba(48,209,88,0.12);border:1px solid rgba(48,209,88,0.25);padding:2px 6px;border-radius:20px;text-transform:uppercase;">HOLY GRAIL</span>' : '') +
    '</div>';
  for (let j = 0; j < pos.length; j++) {
    let p = pos[j];
    let pDirRaw = String(p.type || '').toUpperCase();
    let pDir = pDirRaw === '0' || pDirRaw === 'BUY' ? 'BUY' : (pDirRaw === '1' || pDirRaw === 'SELL' ? 'SELL' : 'NEUTRAL');
    let pDirCls = pDir === 'BUY' ? 'buy' : 'sell';
    let pPnl = p.profit || 0;
    let pPnlClr = pPnl >= 0 ? 'var(--green)' : 'var(--red)';
    let pPnlSign = pPnl >= 0 ? '+' : '';
    phtml += '<div class="pos-item">' +
      '<div class="pos-head"><span class="pos-sym">' + esc(p.symbol || '') + '</span><span class="pos-dir ' + pDirCls + '">' + esc(pDir) + '</span><span class="pos-pnl" style="color:' + pPnlClr + '">' + pPnlSign + fmtUSD(pPnl) + '</span></div>' +
      '<div class="pos-details">' +
        '<div class="pos-detail"><span class="pos-dlbl">ENTRY</span><span class="pos-dval">' + fmtPrice(p.entry_price, p.symbol) + '</span></div>' +
        '<div class="pos-detail"><span class="pos-dlbl">LOT</span><span class="pos-dval">' + (p.lot || 0).toFixed(2) + '</span></div>' +
        '<div class="pos-detail"><span class="pos-dlbl">SL</span><span class="pos-dval" style="color:var(--red)">' + fmtPrice(p.sl, p.symbol) + '</span></div>' +
        '<div class="pos-detail"><span class="pos-dlbl">TP</span><span class="pos-dval" style="color:var(--green)">' + fmtPrice(p.tp, p.symbol) + '</span></div>' +
      '</div>';
    if (p.trail_level > 0) {
      let trailClr = p.trail_level >= 2 ? 'var(--green)' : 'var(--amber)';
      let trailTxt = p.trail_level >= 2 ? 'SL ' + esc(p.trail_label) + '  LOCKED ' + fmtUSD(p.profit_locked) : 'SL ' + esc(p.trail_label);
      phtml += '<div class="pos-trail"><span style="color:' + trailClr + ';font-weight:700;">' + trailTxt + '</span></div>';
    }
    phtml += '</div>';
  }
  el.insertAdjacentHTML('beforeend', phtml);
}

function renderAnalysis() {
   let el = document.querySelector('#analysis-content');
   if (!el) return;
   let sa = state.system_analysis;
   let ph = state.pipeline_health || {};
   let hasAny = (sa && Object.keys(sa).length > 0) || Object.keys(ph).length > 0;
   if (!hasAny) {
     el.innerHTML = '<div style="padding:10px 14px 12px;text-align:center;"><div style="font-size:9px;color:var(--cyan);font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">PIPELINE OBSERVER</div><div style="font-size:8px;color:rgba(255,255,255,0.30);line-height:1.4;">Watching TCIP &rarr; CR &rarr; trade pipeline every 15 min.</div></div>';
     return;
   }
   let html = '<div style="padding:8px 14px 10px;font-family:\'JetBrains Mono\',monospace;">';
   let hScore = ph.health_score;
   if (hScore !== undefined) {
     let hPct = Math.round(hScore * 100);
     let hColor = hScore >= 0.7 ? 'var(--green)' : hScore >= 0.4 ? 'var(--amber)' : 'var(--red)';
     html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
     html += '<div style="font-size:9px;font-weight:700;color:var(--text-secondary);min-width:65px;">PIPE</div>';
     html += '<div style="flex:1;height:6px;background:var(--glass-border);border-radius:3px;overflow:hidden;">';
     html += '<div style="width:'+hPct+'%;height:100%;background:'+hColor+';border-radius:3px;transition:width 0.8s ease;"></div></div>';
     html += '<div style="font-size:10px;font-weight:700;color:'+hColor+';">'+hPct+'%</div></div>';
     html += '<div style="display:flex;gap:12px;margin-bottom:6px;font-size:9px;">';
     html += '<div style="flex:1"><span style="color:var(--text-tertiary)">SIG/HR</span> <span style="color:var(--text);font-weight:600;">'+(ph.signals_per_hour||0)+'</span></div>';
     html += '<div style="flex:1"><span style="color:var(--text-tertiary)">CONV</span> <span style="color:var(--text);font-weight:600;">'+(ph.entry_rate ? (ph.entry_rate*100).toFixed(1)+'%' : '--')+'</span></div>';
     // 09-19 FIX (2026-08-12): with pipeline_health == {} cr_rejection_rate is
     // undefined, which passed the !== null guard and rendered "NaN%". Treat
     // undefined the same as null.
     html += '<div style="flex:1"><span style="color:var(--text-tertiary)">REJ</span> <span style="color:var(--text);font-weight:600;">'+(ph.cr_rejection_rate !== null && ph.cr_rejection_rate !== undefined ? (ph.cr_rejection_rate*100).toFixed(0)+'%' : '--')+'</span></div>';
     html += '</div>';
     html += '<div style="height:1px;background:var(--glass-border);margin:4px 0 6px;"></div>';
   }
   if (sa && Object.keys(sa).length > 0 && sa.proposals_total !== undefined) {
     let lastRun = sa.last_run_ts ? (Date.now()/1000 - sa.last_run_ts) : null;
     let lastRunStr = lastRun == null ? 'not yet' :
       (lastRun < 60 ? Math.floor(lastRun) + 's ago' :
        lastRun < 3600 ? Math.floor(lastRun/60) + 'm ago' :
        Math.floor(lastRun/3600) + 'h ago');
     if (sa.enabled !== false) {
       html += '<div style="display:flex;gap:12px;font-size:9px;margin-bottom:3px;">';
       html += '<div style="flex:1"><span style="color:var(--text-tertiary)">OPEN</span> <span style="color:'+(sa.proposals_open>0?'var(--amber)':'var(--green)')+';font-weight:700;">'+sa.proposals_open+'</span></div>';
       html += '<div style="flex:1"><span style="color:var(--text-tertiary)">FINDINGS</span> <span style="color:var(--text);font-weight:700;">'+sa.reports_total+'</span></div>';
       html += '<div style="flex:1;text-align:right"><span style="color:var(--text-tertiary);font-size:8px;">'+esc(lastRunStr)+'</span></div>';
       html += '</div>';
       if (sa.latest_proposal) {
         html += '<div style="font-size:8px;color:var(--text-tertiary);">' + esc((sa.latest_proposal.title||'').substring(0, 45)) + '</div>';
       }
     }
   }
   html += '<div style="margin-top:4px;font-size:9px;color:var(--text-tertiary);">SNAPSHOT MODE &mdash; DETAILED ANALYSIS UNAVAILABLE</div>';

   // ── CR Layer Health: show which layers contributed vs defaulted ──
   let lh = state.cr_engine_stats && state.cr_engine_stats.last_layer_health;
   if (lh && Object.keys(lh).length > 0) {
     let poolOk = state.cr_engine_stats.last_pool_healthy !== false;
     let streaks = (state.cr_engine_stats && state.cr_engine_stats.layer_alert_streaks) || {};
     let threshold = (state.cr_engine_stats && state.cr_engine_stats.layer_alert_threshold) || 3;
     let cooldowns = (state.cr_engine_stats && state.cr_engine_stats.layer_cooldown_remaining) || {};
     html += '<div style="height:1px;background:var(--glass-border);margin:6px 0;"></div>';
     html += '<div style="font-size:8px;color:var(--text-secondary);margin-bottom:4px;font-weight:600;">';
     html += 'CR LAYERS ' + (poolOk ? '<span style="color:var(--green)">OK</span>' : '<span style="color:var(--amber)">FALLBACK</span>') + '</div>';
     html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
     html += renderLayerHealthChips(lh, streaks, cooldowns, threshold);
     html += '</div>';
   }

   html += '</div>';
   el.innerHTML = html;
}

function renderQueues() {
  var el = document.getElementById('info-queues');
  if (!el) return;
  var feedQ = state.feedPoolQueueDepth;
  var mt5Q = state.mt5QueueDepth;
  if (feedQ == null && mt5Q == null) {
    el.innerHTML = '<div class="waiting-state" style="padding:6px 0;"><span class="waiting-text">QUEUE METRICS UNAVAILABLE</span></div>';
    return;
  }

  function renderMetric(value, label) {
    if (value == null) return '<span style="color:rgba(255,255,255,0.30);font-weight:700;">&mdash;</span>';
    var col = value >= 5 ? 'var(--red)' : value >= 2 ? 'var(--amber)' : 'var(--green)';
    var txt = value >= 5 ? 'SATURATED' : value >= 2 ? 'BACKING UP' : 'IDLE';
    return '<span style="color:' + col + ';font-weight:700;">' + value + ' <span style="font-size:8px;color:' + col + ';">' + txt + '</span></span>';
  }

  function renderSparkline(history, maxH) {
    // Tiny inline bar-chart sparkline — each value is a vertical bar
    // scaled relative to maxH (or the history max if maxH is 0).
    if (!history || history.length < 2) return '';
    var peak = maxH || Math.max.apply(null, history) || 1;
    var w = 40, ht = 10, gap = 1, n = history.length;
    var barW = (w - gap * (n - 1)) / n;
    var bars = '';
    for (var i = 0; i < n; i++) {
      var bh = Math.max(1, (history[i] / peak) * ht);
      var x = i * (barW + gap);
      var y = ht - bh;
      var col = history[i] >= 5 ? 'var(--red)' : history[i] >= 2 ? 'var(--amber)' : 'var(--green)';
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + col + '" opacity="0.6" rx="1"/>';
    }
    return '<svg width="' + w + '" height="' + ht + '" viewBox="0 0 ' + w + ' ' + ht + '" style="display:block;margin:3px auto 0;">' + bars + '</svg>';
  }

  function renderPipelineGauge() {
    var ph = state.pipeline_health;
    var score = ph && ph.health_score != null ? ph.health_score : null;
    if (score == null) return '';
    var pct = Math.round(score * 100);
    var col = score >= 0.7 ? 'var(--green)' : score >= 0.4 ? 'var(--amber)' : 'var(--red)';
    return '<div style="text-align:center;">' +
      '<div style="color:rgba(255,255,255,0.40);font-size:8px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">PIPE</div>' +
      '<div style="width:40px;height:4px;background:var(--glass-border);border-radius:2px;overflow:hidden;margin:2px auto 4px;">' +
        '<div style="width:' + pct + '%;height:100%;background:' + col + ';border-radius:2px;transition:width 0.8s ease;"></div>' +
      '</div>' +
      '<span style="font-size:9px;font-weight:700;color:' + col + ';">' + pct + '%</span>' +
    '</div>';
  }

  // Visual alarm: pulse the card-info border red when either queue is saturated.
  var cardInfo = document.getElementById('card-info');
  if (cardInfo) {
    if ((mt5Q != null && mt5Q >= 5) || (feedQ != null && feedQ >= 5)) {
      cardInfo.classList.add('queue-alarm');
    } else {
      cardInfo.classList.remove('queue-alarm');
    }
  }

  var allVals = (state.mt5QHistory || []).concat(state.feedQHistory || []);
  allVals.push(mt5Q || 0, feedQ || 0);
  var maxQ = Math.max.apply(null, allVals) || 1;

  el.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size:9px;display:flex;gap:16px;justify-content:center;align-items:flex-start;padding:6px 0 2px;">' +
    '<div style="text-align:center;">' +
      '<div style="color:rgba(255,255,255,0.40);font-size:8px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">MT5 CMD Q</div>' +
      renderSparkline(state.mt5QHistory, maxQ) +
      renderMetric(mt5Q, 'MT5 CMD Q') +
    '</div>' +
    '<div style="text-align:center;">' +
      '<div style="color:rgba(255,255,255,0.40);font-size:8px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">FEED POOL</div>' +
      renderSparkline(state.feedQHistory, maxQ) +
      renderMetric(feedQ, 'FEED POOL') +
    '</div>' +
    renderPipelineGauge() +
  '</div>';
}

function renderDbHealth() {
  var el = document.getElementById('db-health-bar');
  if (!el) return;
  var dh = state.dbHealth;
  // Only render when we have data AND there is a concern to surface.
  // A healthy DB (corrupt_count=0) shows nothing so the card stays clean.
  if (!dh || dh.error) {
    el.innerHTML = '';
    return;
  }
  var corrupt = dh.corrupt_count || 0;
  var cached = dh.cached;
  var lastAge = dh.last_signal_age_s;

  if (corrupt === 0 && (lastAge == null || lastAge < 300)) {
    el.innerHTML = '';
    return;
  }

  var html = '<div style="padding:6px 14px 8px;font-family:\'JetBrains Mono\',monospace;font-size:9px;border-top:1px solid var(--glass-border);">';

  // Corrupt keys warning
  if (corrupt > 0) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span style="color:var(--red);font-weight:700;font-size:10px;">! DB CORRUPT</span>';
    html += '<span style="color:var(--red);font-weight:700;">' + corrupt + '</span>';
    html += '<span style="color:var(--text-tertiary);">corrupt key' + (corrupt !== 1 ? 's' : '') + (cached ? ' (cached)' : '') + '</span>';
    html += '</div>';
    // Show first few corrupt key names
    var keys = dh.corrupt_keys || [];
    if (keys.length > 0) {
      html += '<div style="font-size:8px;color:var(--text-tertiary);margin-bottom:4px;word-break:break-all;">';
      html += esc(keys.slice(0, 3).join(', '));
      if (keys.length > 3) html += ' +' + (keys.length - 3) + ' more';
      html += '</div>';
    }
  }

  // Stale signal warning — no TCIP signal in >5 minutes
  if (lastAge != null && lastAge > 300) {
    var ageMin = Math.round(lastAge / 60);
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span style="color:var(--amber);font-weight:700;font-size:10px;">! STALE</span>';
    html += '<span style="color:var(--amber);font-weight:700;">' + ageMin + 'm</span>';
    html += '<span style="color:var(--text-tertiary);">since last TCIP signal</span>';
    html += '</div>';
    // Show last-verified time so operators can distinguish "bridge down"
    // (verified recently, no signal) from "end of trading day" (both stale).
    if (dh.last_verified) {
      var verifiedTime = new Date(dh.last_verified * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      html += '<div style="font-size:8px;color:var(--text-tertiary);margin-top:2px;">';
      html += 'Last checked: ' + esc(verifiedTime);
      html += '</div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;
  // Pulse the health bar red when corruption is present — impossible to miss.
  if (corrupt > 0) {
    el.classList.add('db-corrupt-alert');
  } else {
    el.classList.remove('db-corrupt-alert');
  }
}

function renderInfo() {
   let d = state.decision;
   let radarEl = document.querySelector('#info-radar');
   let marketEl = document.querySelector('#info-market');
   let trustEl = document.querySelector('#info-trust');
   let devilEl = document.querySelector('#info-devil');
   let riskEl = document.querySelector('#info-risk');
   if (!radarEl || !marketEl || !trustEl) return;

   if (!d) {
     let w = '<div class="waiting-state" style="padding:12px 0;"><span class="waiting-text">WAITING SIGNAL DATA</span></div>';
     radarEl.innerHTML = w; marketEl.innerHTML = w; trustEl.innerHTML = w;
     if (devilEl) devilEl.innerHTML = w;
     if (riskEl) riskEl.innerHTML = w;
     return;
   }

    // ── DEVIL: weaknesses / counter-arguments from Devil's Advocate agent ──
    if (devilEl) {
      try {
        let devilParts = [];
        let rawW = d.weaknesses || [];
        let seenW = new Set();
        if (Array.isArray(rawW)) {
          for (let i = 0; i < rawW.length; i++) {
            let wText = (rawW[i] || '').toUpperCase().trim();
            if (wText && !seenW.has(wText)) {
              seenW.add(wText);
              devilParts.push('<div style="font-size:9px;color:var(--red);line-height:1.4;">' + esc(wText) + '</div>');
            }
          }
        }
        if (devilParts.length === 0) {
          devilEl.innerHTML = '<div style="font-size:9px;color:rgba(255,255,255,0.30);">NO CRITICAL WEAKNESSES</div>';
        } else {
          devilEl.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;">' + devilParts.slice(0, 4).join('') + '</div>';
        }
      } catch(e) { console.error('renderInfo devil', e); }
    }

    // ── RISK: Risk Manager output ──
    if (riskEl) {
      try {
        let riskParts = [];
        let rl = (d.risk_level || 'N/A').toUpperCase();
        let rlColor = rl === 'LOW' ? 'var(--green)' : rl === 'MEDIUM' || rl === 'MODERATE' ? 'var(--amber)' : rl === 'HIGH' || rl === 'CRITICAL' ? 'var(--red)' : 'var(--text-secondary)';
        riskParts.push('<span style="color:' + rlColor + ';font-weight:700;">RISK: ' + rl + '</span>');
         if (d.risk_reward != null && d.risk_reward > 0) riskParts.push('<span style="color:rgba(255,255,255,0.45);">RR: ' + d.risk_reward + '</span>');
         let slDist = d.suggested_sl_pips;
        if (slDist != null && slDist > 0) riskParts.push('<span style="color:rgba(255,255,255,0.45);">SL: ' + slDist + 'p</span>');
        riskEl.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size:9px;line-height:1.5;">' + riskParts.join('<br>') + '</div>';
      } catch(e) { console.error('renderInfo risk', e); }
    }

   let isNeutral = d.direction === 'NEUTRAL' || d.direction === 'WAIT' || !d.direction;

    // ── RADAR: CR layers hexagon (centered, top) ──
    let layers = [
      {n:'TCIP',s:d.tcip_component||0},
      {n:'KEY',s:d.key_level_score||0},
      {n:'CANDLE',s:d.candle_score||0},
      {n:'SESN',s:d.session_score||0},
      {n:'ATR',s:d.atr_score||0},
      {n:'ML',s:d.ml_component||0},
    ];
    let hasAnyScore = layers.some(function(l){ return l.s > 0; });
    let crHuman = genCrHuman(d);
    let avgScore = Math.round(layers.reduce(function(a,b){ return a+b.s; }, 0) / 6);
    let strongCount = layers.filter(function(l){ return l.s >= 60; }).length;
    let radarColor = strongCount >= 4 ? 'var(--green)' : strongCount >= 2 ? 'var(--amber)' : 'var(--red)';

    // Build layer bars (2 cols x 3 rows)
    let barHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-top:6px;">';
    for (let i = 0; i < layers.length; i++) {
      let s = layers[i].s;
      let c = s >= 60 ? 'var(--green)' : s >= 40 ? 'var(--amber)' : 'var(--red)';
      barHtml += '<div style="display:flex;align-items:center;gap:4px;">' +
        '<span style="font-size:8px;color:rgba(255,255,255,0.45);min-width:32px;">' + layers[i].n + '</span>' +
        '<div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">' +
        '<div style="width:' + s + '%;height:100%;background:' + c + ';border-radius:2px;"></div></div>' +
        '<span style="font-size:8px;color:' + c + ';font-weight:700;min-width:18px;text-align:right;">' + Math.round(s) + '</span>' +
        '</div>';
    }
    barHtml += '</div>';

    // Build metrics grid (3 rows x 3 cols)
    let ageRefTs = d.signal_born_ts || state.lastDataTs;
    let age_str = '--';
    if (ageRefTs) {
      let age_s = Math.floor((Date.now()/1000) - ageRefTs);
      let age_m = Math.floor(age_s / 60);
      let age_h = Math.floor(age_m / 60);
      age_str = age_h > 0 ? age_h + 'h' + (age_m%60) + 'm' : age_m + 'm' + (age_s%60) + 's';
    }
    let rawCvd = d.cvd;
    let cvdStr = (rawCvd != null && typeof rawCvd === 'number' && !isNaN(rawCvd)) ? (rawCvd >= 0 ? '+' : '') + rawCvd.toFixed(2) : '--';
    let cvdClr = rawCvd != null && rawCvd >= 0 ? 'var(--green)' : 'var(--red)';
    let flowStr = (d.flow_direction && d.flow_direction !== 'NEUTRAL') ? d.flow_direction : '--';
    let flowClr = flowStr === 'BULLISH' || flowStr === 'BULL' ? 'var(--green)' : flowStr !== '--' ? 'var(--red)' : 'var(--text-secondary)';
    let mqStr = (d.market_quality && d.market_quality !== 'NORMAL') ? d.market_quality : '--';
    let mqClr = mqStr.indexOf('EFFICIENT') >= 0 ? 'var(--green)' : mqStr.indexOf('IN') >= 0 ? 'var(--red)' : 'var(--text-secondary)';
    let rsiStr = d.rsi_14 != null ? d.rsi_14.toFixed(1) : '--';
    let macdStr = d.macd_hist != null ? (d.macd_hist >= 0 ? '+' : '') + d.macd_hist.toFixed(3) : '--';
    let bbStr = d.bb_pct_b != null ? d.bb_pct_b.toFixed(2) : '--';
    let safeStr = (d.safety_status || 'OK');
    let safeClr = d.safety_bounds_violated == null || d.safety_bounds_violated === 0 ? 'var(--green)' : 'var(--red)';
    let tsStr = d.ts_intrinsic != null && d.ts_intrinsic != 0 ? d.ts_intrinsic + '%' : '--';
    let snrStr = d.ts_snr != null && d.ts_snr != 0 ? d.ts_snr.toFixed(1) + 'x' : '--';

    let gridHtml = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 8px;margin-top:6px;">' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">CVD</span><br><span style="font-size:9px;color:' + cvdClr + ';font-weight:700;">' + cvdStr + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">FLOW</span><br><span style="font-size:9px;color:' + flowClr + ';font-weight:700;">' + esc(flowStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">QUAL</span><br><span style="font-size:9px;color:' + mqClr + ';font-weight:600;">' + esc(mqStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">AGE</span><br><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">' + esc(age_str) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">RSI</span><br><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">' + esc(rsiStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">MACD</span><br><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">' + esc(macdStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">BB</span><br><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">' + esc(bbStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">SAFE</span><br><span style="font-size:9px;color:' + safeClr + ';font-weight:700;">' + esc(safeStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">TS</span><br><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">' + esc(tsStr) + '</span></div>' +
      '<div><span style="font-size:8px;color:rgba(255,255,255,0.40);">SNR</span><br><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">' + esc(snrStr) + '</span></div>' +
      '</div>';

    // Assemble radar card
    let rHtml = '<div style="font-family:\'JetBrains Mono\',monospace;">' +
      '<div style="display:flex;justify-content:center;align-items:center;margin:4px 0;">' + renderRadar(d) + '</div>' +
      '<div style="text-align:center;margin-top:2px;font-size:10px;font-weight:700;color:' + radarColor + ';">' + avgScore + ' AVG</div>' +
      barHtml +
      '<div style="margin-top:6px;padding:5px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:4px;text-align:center;font-size:9px;color:' + radarColor + ';font-weight:600;">' + esc(crHuman) + '</div>' +
      gridHtml +
      '</div>';
    radarEl.innerHTML = rHtml;

   // ── MARKET: S/R/Entry + Session + Trust metrics ──
   let mHtml = '<div style="font-family:\'JetBrains Mono\',monospace;">';
   let lvlParts = [];
   // AUDIT L67 FIX (2026-08-07): these four interpolations bypassed esc()
   // while every other value in this file uses it. A price or session string
   // echoing back attacker-controlled content could break out of the markup.
   if (d.support_price) lvlParts.push('<span style="color:var(--green);font-weight:700;">SUP ' + esc(d.support_price) + '</span>');
   if (d.resistance_price) lvlParts.push('<span style="color:var(--red);font-weight:700;">RES ' + esc(d.resistance_price) + '</span>');
   if (d.entry_price) lvlParts.push('<span style="color:var(--amber);font-weight:700;">ENTRY ' + esc(d.entry_price) + '</span>');
   if (lvlParts.length > 0) {
     mHtml += '<div style="font-size:9px;margin-bottom:4px;">' + lvlParts.join('  ') + '</div>';
   }
   if (d.session) {
     mHtml += '<div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:4px;">SES ' + esc(d.session.toUpperCase()) + '</div>';
   }
   mHtml += '</div>';
   marketEl.innerHTML = mHtml;

   // ── TRUST: Composite metrics + System health row ──
   let tHtml = '<div style="font-family:\'JetBrains Mono\',monospace;">';
    let trustItems = [
      { k: 'composite_score', l: 'CMP' },
      { k: 'institutional_flow_score', l: 'FLW' },
      { k: 'tech_score', l: 'TECH' },
      { k: 'coherence_score', l: 'CHR' },
      { k: 'calibrated_confidence', l: 'CAL' },
    ];
   let trustParts = [];
   for (let it of trustItems) {
     let val = parseInt(d[it.k]);
     if (isNaN(val) || val <= 0) continue;
     let c = val >= 60 ? 'var(--green)' : val >= 40 ? 'var(--amber)' : 'var(--red)';
     trustParts.push('<span style="color:rgba(255,255,255,0.45);font-weight:500;">' + it.l + '</span><span style="color:' + c + ';font-weight:700;"> ' + val + '</span>');
   }
   let alb = parseInt(d.adaptive_lookback);
   if (!isNaN(alb) && alb > 0) trustParts.push('<span style="color:rgba(255,255,255,0.45);font-weight:500;">LB</span><span style="color:var(--green);font-weight:700;"> ' + alb + '</span>');
   if (trustParts.length > 0) {
     tHtml += '<div style="font-size:9px;line-height:1.6;white-space:nowrap;overflow-x:auto;">' + trustParts.join('<span style="color:rgba(255,255,255,0.12);"> </span>') + '</div>';
   }
   // System health row: THETA RAG SAFE ROLL CTREND TCIP
   let sysParts = [];
   let tAi = parseFloat(d.theta_ai_wr), tRules = parseFloat(d.theta_rules_wr), tN = parseInt(d.theta_total);
   if (tN > 0) {
     sysParts.push('<span style="color:rgba(255,255,255,0.40);">THETA</span> <span style="color:' + (tAi >= tRules ? 'var(--green)' : 'var(--red)') + ';font-weight:700;">AI ' + (tAi*100).toFixed(0) + '%</span>');
   }
   let ragWr = parseFloat(d.rag_win_rate), ragN = parseInt(d.rag_total_similar);
   if (ragN > 0) sysParts.push('<span style="color:rgba(255,255,255,0.40);">RAG</span> <span style="color:' + (ragWr >= 0.55 ? 'var(--green)' : ragWr >= 0.45 ? 'var(--amber)' : 'var(--red)') + ';font-weight:700;">' + (ragWr*100).toFixed(0) + '%</span>');
   let sv = parseInt(d.safety_bounds_violated);
   let safeSt = (d.safety_status || 'OK');
   // L-09-09 FIX (2026-08-09): safety_status, counter_trend_bias and
   // decomp_regime are API-derived free-text fields (counter_trend_bias is
   // TCIP free-text that passes Pydantic as a string), so a hostile producer
   // could inject markup into the trust column. Escape all three before
   // concatenation.
   sysParts.push('<span style="color:rgba(255,255,255,0.40);">SAFE</span> <span style="color:' + (sv === 0 ? 'var(--green)' : sv >= 2 ? 'var(--red)' : 'var(--amber)') + ';font-weight:700;">' + esc(safeSt) + '</span>');
   let roll = parseInt(d.roll_under_risk);
   if (roll > 0) sysParts.push('<span style="color:rgba(255,255,255,0.40);">ROLL</span> <span style="color:' + (roll >= 70 ? 'var(--red)' : 'var(--amber)') + ';font-weight:700;">' + roll + '</span>');
   let ct = (d.counter_trend_bias || 'NONE').toUpperCase();
   if (ct !== 'NONE') sysParts.push('<span style="color:rgba(255,255,255,0.40);">CTREND</span> <span style="color:var(--amber);font-weight:700;">' + esc(ct) + '</span>');
    let wOk = d.tcip_write_ok !== false;
    sysParts.push('<span style="color:rgba(255,255,255,0.40);">TCIP</span> <span style="color:' + (wOk ? 'var(--green)' : 'var(--red)') + ';font-weight:700;">' + (wOk ? 'OK' : 'FAIL') + '</span>');
    // TS intrinsic + SNR
    let tsI = parseFloat(d.ts_intrinsic), tsSnr = parseFloat(d.ts_snr);
    if (!isNaN(tsI) && tsI > 0) {
      sysParts.push('<span style="color:rgba(255,255,255,0.40);">TS</span> <span style="color:var(--green);font-weight:700;">' + tsI.toFixed(0) + '%</span>');
    }
    if (!isNaN(tsSnr) && tsSnr > 0) {
      let snrClr = tsSnr > 1.5 ? 'var(--green)' : tsSnr > 0.8 ? 'var(--amber)' : 'var(--red)';
      sysParts.push('<span style="color:rgba(255,255,255,0.40);">SNR</span> <span style="color:' + snrClr + ';font-weight:700;">' + tsSnr.toFixed(1) + 'x</span>');
    }
    // Decomposition regime
    let decomp = (d.decomp_regime || '').toUpperCase();
    if (decomp && decomp !== 'NO DATA') {
      let decompClr = decomp === 'TRENDING' ? 'var(--green)' : decomp === 'RANGING' ? 'var(--amber)' : 'var(--red)';
      sysParts.push('<span style="color:rgba(255,255,255,0.40);">DECOMP</span> <span style="color:' + decompClr + ';font-weight:700;">' + esc(decomp) + '</span>');
    }
    // Bar total score
    let barTot = parseInt(d.bar_total_score);
    if (!isNaN(barTot) && barTot > 0) {
      let barClr = barTot >= 70 ? 'var(--green)' : barTot >= 40 ? 'var(--amber)' : 'var(--red)';
      sysParts.push('<span style="color:rgba(255,255,255,0.40);">BAR</span> <span style="color:' + barClr + ';font-weight:700;">' + barTot + '</span>');
    }
    // Signal consistency
    let sigCon = parseFloat(d.signal_consistency);
    if (!isNaN(sigCon) && sigCon > 0) {
      let sigPct = sigCon > 1 ? sigCon : sigCon * 100;
      let sigClr = sigPct >= 70 ? 'var(--green)' : sigPct >= 50 ? 'var(--amber)' : 'var(--red)';
      sysParts.push('<span style="color:rgba(255,255,255,0.40);">SIG</span> <span style="color:' + sigClr + ';font-weight:700;">' + sigPct.toFixed(0) + '%</span>');
    }
    if (sysParts.length > 0) {
     tHtml += '<div style="font-size:9px;line-height:1.6;margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;white-space:nowrap;overflow-x:auto;">' + sysParts.join('<span style="color:rgba(255,255,255,0.12);"> </span>') + '</div>';
   }
   tHtml += '</div>';
    trustEl.innerHTML = tHtml;
  }

function fmtMins(m) {
  if (m == null || m <= 0) return '0M';
  return m >= 60 ? Math.round(m / 60) + 'H' : m + 'M';
}

function renderEcoCal() {
  let el = document.querySelector('#card-eco-cal');
  let barEl = document.getElementById('eco-cal-bar');
  let dotEl = document.getElementById('eco-cal-dot');
  let textEl = document.getElementById('eco-cal-text');
  let listEl = document.getElementById('eco-cal-list');
  if (!el || !barEl) return;
  let ec = state.eco_cal;
  if (!ec || !ec.next_events || ec.next_events.length === 0) {
    el.className = 'card fade-up delay-2 eco-cal-card clear';
    dotEl.className = 'eco-cal-dot green';
    textEl.textContent = 'NO HIGH-IMPACT EVENTS';
    listEl.innerHTML = '';
    return;
  }
  let blocked = ec.blocked || false;
  let first = ec.next_events[0];
  let minAway = first.minutes_away || 0;
  if (blocked) {
    el.className = 'card fade-up delay-2 eco-cal-card blocked';
    dotEl.className = 'eco-cal-dot red';
    textEl.textContent = 'TRADING BLOCKED  →  ' + (first.name || 'EVENT').toUpperCase() + ' IN ' + fmtMins(minAway);
  } else if (minAway <= 30) {
    el.className = 'card fade-up delay-2 eco-cal-card warning';
    dotEl.className = 'eco-cal-dot amber';
    textEl.textContent = 'HIGH-IMPACT EVENT APPROACHING  →  ' + (first.name || 'EVENT').toUpperCase();
  } else {
    el.className = 'card fade-up delay-2 eco-cal-card';
    dotEl.className = 'eco-cal-dot amber';
    textEl.textContent = (ec.next_events.length) + ' HIGH-IMPACT EVENT(S) UPCOMING';
  }
  let html = '';
  for (let i = 0; i < ec.next_events.length; i++) {
    let ev = ec.next_events[i];
    let name = ev.name || ev.event || '';
    let curr = ev.currency || '';
    let time = ev.time_utc || '';
    if (time && time.indexOf(':') >= 0) {
      let parts = time.split(':');
      let d = new Date();
      d.setUTCHours(parseInt(parts[0],10), parseInt(parts[1],10), 0, 0);
      time = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    let m = ev.minutes_away != null ? ev.minutes_away : 0;
    let countStr = fmtMins(m);
    let speechTag = ev.is_speech ? '<span style="color:var(--amber);font-size:8px;font-weight:700;letter-spacing:0.04em;">SPEECH</span>' : '';
    html += '<div class="eco-cal-item">' +
      '<span class="curr">' + esc(curr) + '</span>' +
      '<span class="name">' + esc(name.substring(0,50)) + ' ' + speechTag + '</span>' +
      '<span class="time">' + esc(time) + '</span>' +
      '<span class="count">' + countStr + '</span>' +
    '</div>';
  }
  listEl.innerHTML = html;
}

function renderML() {
   let el = document.querySelector('#ml-content');
   if (!el) return;
   let ms = state.ml_status;
let waitEl = document.getElementById('ml-waiting');
  if (waitEl) waitEl.style.display = 'none';
  if (!ms) {
    el.innerHTML = '<div class="ml-grid"><div class="ml-col"><div class="ml-col-title">STATUS</div><div class="ml-row"><span class="ml-label">PATTERN MODEL</span><span class="ml-value" style="color:var(--amber);">WARMING UP</span></div><div class="ml-row"><span class="ml-label">OUTCOMES</span><span class="ml-value">--</span></div></div><div class="ml-col"><div class="ml-col-title">WIN RATE</div><div style="font-size:7px;color:rgba(255,255,255,0.20);text-align:center;margin-top:4px;">LOADING...</div></div><div class="ml-col"><div class="ml-col-title">CALIBRATION</div><div style="font-size:7px;color:rgba(255,255,255,0.20);text-align:center;margin-top:4px;">LOADING...</div></div></div>';
    return;
  }

  let trained = ms.trained || false;
  let retrain = ms.retrain_count || 0;
  let outcomes = ms.total_outcomes || 0;
  let rates = ms.pattern_rates || [];
  let cal = ms.calibration || [];
  let feats = ms.feature_importance || [];

  function barHtml(name, pct, val) {
    let w = Math.min(Math.max(pct * 100, 2), 100);
    let c = pct >= 0.6 ? '#30D158' : pct >= 0.4 ? '#FFD60A' : '#FF453A';
    return '<div class="ml-bar-wrap"><span class="ml-bar-name">' + esc(name) + '</span><div class="ml-bar-bg"><div class="ml-bar-fill" style="width:' + w.toFixed(0) + '%;background:' + c + ';"></div></div><span class="ml-bar-label">' + (val != null ? val : (pct * 100).toFixed(0) + '%') + '</span></div>';
  }
  function featBar(name, imp) {
    let w = Math.min(imp * 100, 100);
    return '<div class="ml-bar-wrap"><span class="ml-bar-name">' + esc(name) + '</span><div class="ml-bar-bg"><div class="ml-bar-fill" style="width:' + w.toFixed(0) + '%;background:#BF5AF2;"></div></div><span class="ml-bar-label">' + imp.toFixed(2) + '</span></div>';
  }

  let c1 = '<div class="ml-col"><div class="ml-col-title">STATUS</div>';
  c1 += '<div class="ml-row"><span class="ml-label">PATTERN MODEL</span><span class="ml-value" style="color:' + (trained ? '#30D158' : '#FF453A') + ';">' + (trained ? 'READY' : 'NOT TRAINED') + '</span></div>';
  if (ms.accuracy != null && ms.accuracy > 0) {
    let acc = ms.accuracy;
    let accClr = acc >= 0.7 ? '#30D158' : acc >= 0.5 ? '#FFD60A' : '#FF453A';
    c1 += '<div class="ml-row"><span class="ml-label">ACCURACY</span><span class="ml-value" style="color:' + accClr + ';">' + (acc * 100).toFixed(1) + '%</span></div>';
  }
  c1 += '<div class="ml-row"><span class="ml-label">TRAINING CYCLES</span><span class="ml-value">' + retrain + '</span></div>';
  c1 += '<div class="ml-row"><span class="ml-label">RECORDED OUTCOMES</span><span class="ml-value">' + outcomes + '</span></div>';
  let filterStatus = ms.filter_status || (outcomes >= 200 ? "ACTIVE" : "WARMING UP");
  let filterClr = filterStatus === "ACTIVE" ? '#30D158' : '#FFD60A';
  c1 += '<div class="ml-row" style="margin-top:4px;"><span class="ml-label">FILTER</span><span class="ml-value" style="color:' + filterClr + ';">' + filterStatus + '</span></div>';
  if (outcomes < 80) c1 += '<div style="font-size:6px;color:rgba(255,214,10,0.40);text-align:center;margin-top:1px;">NEEDS 80 OUTCOMES (' + (80 - outcomes) + ' MORE)</div>';
  if (ms.ml_comparison) {
    let withMl = ms.ml_comparison.with_ml || {};
    let withoutMl = ms.ml_comparison.without_ml || {};
    let withPnl = withMl.total_pnl != null ? ((withMl.total_pnl >= 0 ? '+$' : '-$') + Math.abs(withMl.total_pnl).toFixed(2)) : '--';
    let withoutPnl = withoutMl.total_pnl != null ? ((withoutMl.total_pnl >= 0 ? '+$' : '-$') + Math.abs(withoutMl.total_pnl).toFixed(2)) : '--';
    c1 += '<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;">';
    c1 += '<div class="ml-col-title" style="margin-bottom:3px;">ML VS RULES</div>';
    c1 += '<div class="ml-row"><span class="ml-label">WITH ML</span><span class="ml-value" style="font-size:9px;">' + (withMl.trades || 0) + ' TR | ' + (withMl.win_rate != null ? withMl.win_rate.toFixed(1) + '%' : '--') + ' | ' + withPnl + '</span></div>';
    c1 += '<div class="ml-row"><span class="ml-label">W/O ML</span><span class="ml-value" style="font-size:9px;">' + (withoutMl.trades || 0) + ' TR | ' + (withoutMl.win_rate != null ? withoutMl.win_rate.toFixed(1) + '%' : '--') + ' | ' + withoutPnl + '</span></div>';
    c1 += '</div>';
  }
  if (ms.drift) {
    let drift = ms.drift;
    let dWinRate = drift.win_rate != null ? drift.win_rate : 0.5;
    let dThresh = drift.alert_threshold || 0.40;
    let dCrit = drift.critical_threshold || 0.30;
    let dLevel = dWinRate < dCrit ? 'CRITICAL' : dWinRate < dThresh ? 'ALERT' : 'OK';
    let driftClr = dLevel === 'OK' ? '#30D158' : dLevel === 'ALERT' ? '#FFD60A' : '#FF453A';
    c1 += '<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;">';
    c1 += '<div class="ml-col-title" style="margin-bottom:3px;">DRIFT</div>';
    c1 += '<div class="ml-row"><span class="ml-label">STATUS</span><span class="ml-value" style="color:' + driftClr + ';">' + dLevel + '</span></div>';
    c1 += '<div class="ml-row"><span class="ml-label">WR</span><span class="ml-value">' + (drift.win_rate != null ? (drift.win_rate * 100).toFixed(1) + '%' : '--') + ' (' + (drift.current_samples || 0) + '/' + (drift.window_size || 100) + ')</span></div>';
    c1 += '</div>';
  }
  if (ms.recent_alerts && ms.recent_alerts.length > 0) {
    let alertMsg = ms.recent_alerts[0];
    if (typeof alertMsg === 'object') alertMsg = alertMsg.message || alertMsg.level || JSON.stringify(alertMsg);
    if (alertMsg.length > 50) alertMsg = alertMsg.substring(0, 50) + '...';
    c1 += '<div style="margin-top:4px;font-size:8px;color:#FFD60A;">' + esc(alertMsg) + '</div>';
  }
  c1 += '</div>';

  function patLabel(p) {
    let m = {'NONE':'NONE','M':'M TOP','M_TOP':'M TOP','M_BOT':'M BOT','W':'W BOT','W_TOP':'W TOP','W_BOT':'W BOT','PIN':'PIN BAR','PIN BAR':'PIN BAR','INSIDE':'INSIDE BAR','INSIDE BAR':'INSIDE BAR','ENGULF':'ENGULFING','ENGULFING':'ENGULFING','DOJI':'DOJI','TRIANGLE':'TRIANGLE','DBL TOP':'DBL TOP','DBL BOT':'DBL BOT'};
    let u = (p || 'NONE').toUpperCase();
    return m[u] || u.substring(0, 12);
  }

  let c2 = '<div class="ml-col"><div class="ml-col-title">WIN RATE PER PATTERN</div>';
  if (rates.length === 0) {
    c2 += '<div style="font-size:7px;color:rgba(255,255,255,0.20);text-align:center;margin-top:4px;">NO DATA</div>';
  } else {
    for (let i = 0; i < Math.min(rates.length, 6); i++) {
      let r2 = rates[i];
      let pct = r2.win_rate || 0;
      c2 += barHtml(patLabel(r2.pattern), pct, (pct * 100).toFixed(0) + '%');
    }
  }
  c2 += '</div>';

  let c3 = '<div class="ml-col"><div class="ml-col-title">CALIBRATION</div>';
  if (cal.length === 0) {
    c3 += '<div style="font-size:7px;color:rgba(255,255,255,0.20);text-align:center;margin-top:4px;">NO DATA</div>';
  } else {
    for (let i = 0; i < Math.min(cal.length, 4); i++) {
      let cc = cal[i];
      let cC = cc.win_rate >= 0.6 ? '#30D158' : cc.win_rate >= 0.4 ? '#FFD60A' : '#FF453A';
      c3 += '<div class="ml-cal-row">' + (cc.bucket || '?') + '  ' + (cc.total || 0) + ' TR  <span style="color:' + cC + ';font-weight:600;">' + ((cc.win_rate || 0) * 100).toFixed(0) + '%</span></div>';
    }
  }
  c3 += '<div class="ml-col-title" style="margin-top:4px;">IMPORTANT FEATURES</div>';
  if (feats.length === 0) {
    c3 += '<div style="font-size:7px;color:rgba(255,255,255,0.20);text-align:center;margin-top:4px;">MODEL NOT YET TRAINED</div>';
  } else {
    for (let i = 0; i < Math.min(feats.length, 5); i++) {
      let f = feats[i];
      c3 += featBar((f.feature || '?').substring(0, 8).toUpperCase(), f.importance || 0);
    }
  }
  c3 += '</div>';

  el.innerHTML = c1 + c2 + c3;
}

function renderPnL() {
  let el = document.querySelector('#pnl-content');
  if (!el) return;
  let pnl = state.pnl_summary;
  let waitEl = document.getElementById('pnl-waiting');
  if (waitEl) waitEl.style.display = 'none';
  if (!pnl) {
    el.innerHTML = '<div class="ml-grid"><div class="ml-col"><div class="ml-col-title">TODAY</div><div class="ml-row"><span class="ml-label">P&amp;L</span><span class="ml-value" style="color:var(--amber);">$0.00</span></div><div class="ml-row"><span class="ml-label">TRADES</span><span class="ml-value">0</span></div><div class="ml-row"><span class="ml-label">WIN RATE</span><span class="ml-value">--</span></div></div><div class="ml-col"><div class="ml-col-title">7 DAY</div><div class="ml-row"><span class="ml-label">P&amp;L</span><span class="ml-value" style="color:var(--amber);">$0.00</span></div><div class="ml-row"><span class="ml-label">TRADES</span><span class="ml-value">0</span></div><div class="ml-row"><span class="ml-label">WIN RATE</span><span class="ml-value">--</span></div></div><div class="ml-col"><div class="ml-col-title">30 DAY</div><div class="ml-row"><span class="ml-label">P&amp;L</span><span class="ml-value" style="color:var(--green);">$0.00</span></div><div class="ml-row"><span class="ml-label">TRADES</span><span class="ml-value">0</span></div><div class="ml-row"><span class="ml-label">WIN RATE</span><span class="ml-value">--</span></div></div></div>';
    return;
  }

  let today = pnl.today || {pnl: 0, trades: 0, win_rate: 0};
  let week = pnl.week || {pnl: 0, trades: 0, win_rate: 0};
  let month = pnl.month || {pnl: 0, trades: 0, win_rate: 0};

  let todayClr = today.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  let weekClr = week.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  let monthClr = month.pnl >= 0 ? 'var(--green)' : 'var(--red)';

  let c1 = '<div class="ml-col"><div class="ml-col-title">TODAY</div>';
  c1 += '<div class="ml-row"><span class="ml-label">P&amp;L</span><span class="ml-value" style="color:' + todayClr + ';">' + fmtUSD(today.pnl) + '</span></div>';
  c1 += '<div class="ml-row"><span class="ml-label">TRADES</span><span class="ml-value">' + today.trades + '</span></div>';
  c1 += '<div class="ml-row"><span class="ml-label">WIN RATE</span><span class="ml-value" style="color:' + (today.win_rate >= 55 ? 'var(--green)' : today.win_rate >= 45 ? 'var(--amber)' : 'var(--red)') + ';">' + today.win_rate.toFixed(1) + '%</span></div>';
  c1 += '</div>';

  let c2 = '<div class="ml-col"><div class="ml-col-title">7 DAY</div>';
  c2 += '<div class="ml-row"><span class="ml-label">P&amp;L</span><span class="ml-value" style="color:' + weekClr + ';">' + fmtUSD(week.pnl) + '</span></div>';
  c2 += '<div class="ml-row"><span class="ml-label">TRADES</span><span class="ml-value">' + week.trades + '</span></div>';
  c2 += '<div class="ml-row"><span class="ml-label">WIN RATE</span><span class="ml-value" style="color:' + (week.win_rate >= 55 ? 'var(--green)' : week.win_rate >= 45 ? 'var(--amber)' : 'var(--red)') + ';">' + week.win_rate.toFixed(1) + '%</span></div>';
  c2 += '</div>';

  let c3 = '<div class="ml-col"><div class="ml-col-title">30 DAY</div>';
  c3 += '<div class="ml-row"><span class="ml-label">P&amp;L</span><span class="ml-value" style="color:' + monthClr + ';">' + fmtUSD(month.pnl) + '</span></div>';
  c3 += '<div class="ml-row"><span class="ml-label">TRADES</span><span class="ml-value">' + month.trades + '</span></div>';
  c3 += '<div class="ml-row"><span class="ml-label">WIN RATE</span><span class="ml-value" style="color:' + (month.win_rate >= 55 ? 'var(--green)' : month.win_rate >= 45 ? 'var(--amber)' : 'var(--red)') + ';">' + month.win_rate.toFixed(1) + '%</span></div>';
  c3 += '</div>';

  el.innerHTML = '<div class="ml-grid">' + c1 + c2 + c3 + '</div>';

  // Show P&L cache freshness indicator
  let age = state.pnl_cache_age;
  if (age != null) {
    let ageText = age < 60 ? Math.floor(age) + 's ago' :
                  age < 3600 ? Math.floor(age / 60) + 'm ago' :
                  Math.floor(age / 3600) + 'h ago';
    let ageClr = age < 120 ? 'var(--green)' : age < 300 ? 'var(--amber)' : 'var(--text-tertiary)';
    el.insertAdjacentHTML('beforeend', '<div style="font-size:8px;color:' + ageClr + ';text-align:right;padding:2px 14px 4px;font-family:JetBrains Mono,monospace;">updated ' + ageText + '</div>');
  }
}

function esc(s) {
  if (s == null) return '';
  let d = document.createElement('div');
  d.textContent = String(s);
  // M5 FIX (2026-08-05): also encode quotes — esc() is used inside
  // title="..." attributes (:957); innerHTML escaping leaves quotes literal.
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener("DOMContentLoaded", function() {
  init3DEngine();
  // Static-mode build: no WebSocket / live API on cangcilung. The dashboard
  // is fed entirely from the repo's tcip-data/tcip-detail.json snapshot.
  setWSStatus('online');
  // Schedule the recurring poll FIRST so a synchronous throw in the first
  // poll() can never prevent the interval from being registered (which would
  // leave the dashboard frozen on its initial skeleton state).
  setInterval(poll, 30000);
  try { poll(); } catch(e) { console.error('poll', e); setPollStatus(false); }

  let savedMin = localStorage.getItem('ksynth_minimal');
  if (savedMin === 'true') {
    state.minimal = true;
    document.querySelector('.app').classList.add('minimal');
    document.getElementById('minimal-btn').classList.add('active');
  }
  document.getElementById('minimal-btn').addEventListener('click', function() {
    state.minimal = !state.minimal;
    document.querySelector('.app').classList.toggle('minimal', state.minimal);
    this.classList.toggle('active', state.minimal);
    localStorage.setItem('ksynth_minimal', state.minimal ? 'true' : 'false');
  });

  state.m15TimerId = setInterval(function() {
    let container = document.querySelector('.m15-bar-wrap');
    if (container && state.decision) {
      let now = Math.floor(Date.now()/1000);
      let elapsed = now % 900;
      let pct = elapsed / 900 * 100;
      let grad = container.querySelector('.m15-bar-gradient');
      let ov = container.querySelector('.m15-bar-overlay');
      let tip = container.querySelector('.m15-bar-tooltip');
      if (grad) grad.style.width = pct + '%';
      if (ov) ov.style.width = (100 - pct) + '%';
      if (tip) {
        let mm = Math.floor(elapsed/60), ss = elapsed%60;
        tip.textContent = ('0'+mm).slice(-2)+':'+('0'+ss).slice(-2)+' / 15:00';
      }
    }
    if (Math.floor(Date.now()/1000)%60===0) { try { renderMarket(); } catch(e) { console.error('renderMarket', e); } }
  }, 1000);
});

setInterval(function() { renderEcoCal(); }, 10000);

function processPriceData(d) {
  var arr = [];
  for (var k in d.prices) {
    var p = d.prices[k];
    arr.push({symbol: k, bid: p.bid, ask: p.ask, spread: p.spread, change: p.change, digits: p.digits});
    if (p.digits != null) state.symbolDigits[k] = p.digits;
  }
  state.market = arr;
  try { renderMarket(); } catch(e) { console.error('renderMarket', e); }
}

function fetchWithTimeout(url, opts, ms) {
  let signal = null;
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(ms);
    }
  } catch (_) { signal = null; }
  return fetch(url, Object.assign({}, opts, signal ? { signal: signal } : {}));
}

function fetchPendingOrders() {
  // Static-mode: orders are not part of the snapshot; leave empty.
  state.orders = state.orders || [];
}

// Keep the validated MT5 source snapshot separate from Python's derived
// decision fields. Object.assign already preserves unknown fields, but this
// explicit boundary prevents a future normalizer from silently dropping the
// TCIP mirror contract.
function normalizeTcipRaw(insight) {
  var raw = insight && insight.tcip_raw;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

// Preserve source values exactly, including legitimate zeroes and false flags.
// The nested tcip_raw object remains the complete authoritative snapshot; this
// convenience projection only exists for dashboard consumers that read flat
// fields from state.decision.
function mapTcipMirror(insight) {
  var a = insight || {};
  return {
    tcip_raw: normalizeTcipRaw(a),
    tcip_signal_phase: a.tcip_signal_phase != null ? a.tcip_signal_phase : "",
    tcip_direction: a.tcip_direction != null ? a.tcip_direction : "",
    tcip_grade: a.tcip_grade != null ? a.tcip_grade : "",
    tcip_bar_direction: a.tcip_bar_direction != null ? a.tcip_bar_direction : "",
    tcip_timestamp: a.tcip_timestamp != null ? a.tcip_timestamp : null,
    tcip_clock_drift_s: a.tcip_clock_drift_s != null ? a.tcip_clock_drift_s : null,
    tcip_nearest_support: a.tcip_nearest_support != null ? a.tcip_nearest_support : null,
    tcip_nearest_resistance: a.tcip_nearest_resistance != null ? a.tcip_nearest_resistance : null,
  };
}

// ── Static-mode adapter ──────────────────────────────────────────────────────
// cangcilung serves tcip-data/tcip-detail.json (a snapshot of the original
// /public/dashboard payload, written by the monitor workflow). The render
// functions below expect the flat insight_data contract of the original API,
// so this adapter flattens the nested detail shape back into that contract.
function flattenDetail(detail) {
  var d = detail || {};
  var layers = d.layers || {};
  var mtf = d.mtf || {};
  var ind = d.indicators || {};
  var lv = d.levels || {};
  var rk = d.risk || {};
  var smc = d.smc || {};
  var saf = d.safety || {};
  var now = Date.now() / 1000;
  var bornTs = d.signal_born_ts;
  if (bornTs == null && d.signal_age_s != null) bornTs = now - d.signal_age_s;
  var mp = d.market_prices || {};
  var q = mp[d.symbol] || {};
  var currentPrice = q.last != null ? q.last : (q.bid != null ? q.bid : null);
  return {
    // top-level pass-through
    symbol: d.symbol, timeframe: d.timeframe || 'M15',
    direction: d.direction, confidence: d.confidence,
    grade: d.grade, phase: d.phase, risk_level: d.risk_level,
    verdict: d.verdict, final_reco: d.final_reco,
    regime: d.regime, decomp_regime: d.decomp_regime || d.volatility_regime,
    stability: d.stability, is_stale: d.is_stale || false,
    ts_intrinsic: d.ts_intrinsic, ts_snr: d.ts_snr,
    weighted_alignment: d.weighted_alignment, trend_consistency_pct: d.trend_consistency_pct,
    composite_score: d.composite_score, confluence_score: d.confluence_score,
    tech_score: d.tech_score, coherence_score: d.coherence_score,
    institutional_flow_score: d.institutional_flow_score, ml_confidence: d.ml_confidence,
    entry_strength: d.entry_strength, signal_consistency: d.signal_consistency,
    adaptive_lookback: d.adaptive_lookback, filter_reason: d.filter_reason,
    hierarchy_reason: d.hierarchy_reason, roll_under_reco: d.roll_under_reco,
    inferred_reversal: d.inferred_reversal, reversal_confidence: d.reversal_confidence,
    primary_context: d.primary_context, primary_bias: d.primary_bias,
    market_quality: d.market_quality, session_name: d.session_name,
    session: d.session_name || d.session || '',
    divergence_status: d.divergence_status, divergence_downgraded: d.divergence_downgraded,
    signal_born_ts: bornTs,
    current_price: currentPrice,
    position_open: (d.open_positions || 0) > 0,
    // layers → flat scores
    tcip_component: layers.tcip, key_level_score: layers.key,
    candle_score: layers.candle, session_score: layers.session,
    atr_score: layers.atr, ml_component: layers.ml,
    // mtf
    mtf_d1_dir: mtf.d1_dir, mtf_h4_dir: mtf.h4_dir,
    mtf_h1_dir: mtf.h1_dir, mtf_m30_dir: mtf.m30_dir, mtf_m15_dir: mtf.m15_dir,
    mtf_d1_score: mtf.d1_score, mtf_h4_score: mtf.h4_score,
    mtf_h1_score: mtf.h1_score, mtf_m30_score: mtf.m30_score, mtf_m15_score: mtf.m15_score,
    mtf_w1_d1_aligned: mtf.w1_d1_aligned, mtf_d1_h4_aligned: mtf.d1_h4_aligned,
    mtf_h4_h1_aligned: mtf.h4_h1_aligned, mtf_h1_m30_aligned: mtf.h1_m30_aligned,
    mtf_m30_m15_aligned: mtf.m30_m15_aligned,
    // indicators
    rsi_14: ind.rsi_14, macd_line: ind.macd_line, macd_signal: ind.macd_signal,
    macd_hist: ind.macd_hist, bb_pct_b: ind.bb_pct_b,
    cvd: ind.cvd != null ? ind.cvd : ind.current_cvd,
    current_cvd: ind.current_cvd != null ? ind.current_cvd : ind.cvd,
    cvd_efficiency: ind.cvd_efficiency, net_flow: ind.net_flow,
    flow_direction: ind.flow_direction,
    // levels
    entry_price: lv.entry_price, support_price: lv.support_price,
    resistance_price: lv.resistance_price,
    nearest_support: lv.nearest_support, nearest_resistance: lv.nearest_resistance,
    // risk
    atr: rk.atr, spread_points: rk.spread_points,
    suggested_sl_pips: rk.sl_pips, suggested_tp_pips: rk.tp_pips,
    risk_reward: rk.risk_reward,
    // smc
    smc_warning: smc.warning, smc_confluence: smc.confluence,
    // safety
    safety_status: saf.status, safety_bounds_violated: saf.violated,
    safety_bounds_total: saf.total,
    // lists
    weaknesses: d.weaknesses || [], mtf_warnings: d.mtf_warnings || [],
    rationale: d.rationale || ''
  };
}

function poll() {
  fetchWithTimeout(DATA_URL, {}, 8000)
    .then(r => { setPollStatus(r.ok); return r.ok ? r.json() : null; })
    .then(data => {
      if (!data) return;
      var detail = data;
      var insight = flattenDetail(detail);
      state.openCount = detail.open_positions || 0;
      state.positions = detail.open_details || [];
      if (detail.market_prices && Object.keys(detail.market_prices).length) {
        processPriceData({type: "tick", prices: detail.market_prices});
      }
      state.analysisMode = detail.analysis_mode || 'ai';
      try { renderMarket(); } catch(e) { console.error('renderMarket', e); }

      let a = insight;
      if (a && (a.direction || a.grade || a.symbol)) {
        // Copy ALL fields from insight_data so renderInfo() has access to everything
        state.decision = Object.assign({}, a, {
          timeframe: a.timeframe || 'M15',
          confidence: a.confidence != null ? Math.round(a.confidence) : 0,
          position_open: a.position_open || false,
          regime: a.regime || '',
          risk_level: a.risk_level || '',
          weaknesses: a.weaknesses || [],
          mtf_warnings: a.mtf_warnings || [],
          is_stale: a.is_stale || false,
          signal_born_ts: a.signal_born_ts || 0,
          god_mode: a.god_mode || 0,
          composite_score: a.composite_score || 0,
          institutional_flow_score: a.institutional_flow_score || 0,
          coherence_score: a.coherence_score || 0,
          calibrated_confidence: a.calibrated_confidence || 0,
          rsi_14: a.rsi_14 != null ? a.rsi_14 : 50.0,
          macd_line: a.macd_line != null ? a.macd_line : 0.0,
          macd_signal: a.macd_signal != null ? a.macd_signal : 0.0,
          macd_hist: a.macd_hist != null ? a.macd_hist : 0.0,
          bb_pct_b: a.bb_pct_b != null ? a.bb_pct_b : 0.5,
          adaptive_lookback: a.adaptive_lookback || 0,
          // Extended system metrics
          roll_under_risk: a.roll_under_risk || 0,
          minutes_to_roll: a.minutes_to_roll || 0,
                theta_ai_wr: a.theta_ai_wr || 0.0,
          theta_rules_wr: a.theta_rules_wr || 0.0,
          theta_total: a.theta_total || 0,
          theta_divergence: a.theta_divergence || 0,
          rag_win_rate: a.rag_win_rate || 0.0,
          rag_total_similar: a.rag_total_similar || 0,
          safety_bounds_violated: a.safety_bounds_violated || 0,
          safety_bounds_total: a.safety_bounds_total || 6,
          safety_status: a.safety_status || "N/A",
           counter_trend_bias: a.counter_trend_bias || "NONE",
           counter_trend_strength: a.counter_trend_strength || 0,
           primary_context: a.primary_context || "",
           primary_bias: a.primary_bias || "",
           additional_confirmations: a.additional_confirmations || 0,
           // New extended fields
           ts_intrinsic: a.ts_intrinsic || 0,
           ts_snr: a.ts_snr || 0,
           decomp_regime: a.decomp_regime || a.volatility_regime || "NO DATA",
           roll_under_reco: a.roll_under_reco || "",
           smc_warning: a.smc_warning || false,
           smc_confluence: a.smc_confluence || 0,
           net_flow: a.net_flow || 0,
           session_name: a.session_name || a.session || "",
           tech_mtf_aligned: a.tech_mtf_aligned || false,
           tcip_write_ok: a.tcip_write_ok !== false,
           tcip_write_attempt: a.tcip_write_attempt || 1,
           // ── AUDIT-FIX: forward remaining TCIP.mq5 fields ──
           // Exact validated MT5 payload (not the CR-derived display view).
           ...mapTcipMirror(a),
        });
      } else {
        state.decision = null;
      }
      let _mlStatus = detail.ml_status || null;
      if (_mlStatus) {
        _mlStatus.ml_comparison = _mlStatus.ml_comparison || null;
        _mlStatus.drift = _mlStatus.drift || null;
        _mlStatus.recent_alerts = _mlStatus.recent_alerts || [];
        _mlStatus.filter_status = (_mlStatus.total_outcomes >= 200 ? "ACTIVE" : "WARMING UP");
      }
      state.ml_status = _mlStatus;
      state.eco_cal = detail.eco_cal || null;
      state.pnl_summary = detail.pnl_summary || null;
      state.fast_path_gate_rejections = detail.fast_path_gate_rejections || null;
      state.rejection_counters = detail.rejection_counters || null;
      state.rejection_reasons = detail.rejection_reasons || null;
      state.cr_engine_stats = detail.cr_engine_stats || null;
      state.pnl_cache_age = detail.pnl_cache_age || null;
      state.system_analysis = detail.system_analysis || null;
      state.pipeline_health = detail.pipeline_health || null;
      state.ai_analyzing = detail.ai_analyzing || false;
      state.feedPoolQueueDepth = detail.feed_pool_queue_depth;
      state.mt5QueueDepth = detail.mt5_queue_depth;
      // Rolling history buffers for sparkline trend bars (last 20 values).
      if (detail.feed_pool_queue_depth != null) {
        state.feedQHistory.push(detail.feed_pool_queue_depth);
        if (state.feedQHistory.length > 20) state.feedQHistory = state.feedQHistory.slice(-20);
      }
      if (detail.mt5_queue_depth != null) {
        state.mt5QHistory.push(detail.mt5_queue_depth);
        if (state.mt5QHistory.length > 20) state.mt5QHistory = state.mt5QHistory.slice(-20);
      }
      state.dbHealth = detail.db_health || {};
      try { renderDbHealth(); } catch(e) { console.error('renderDbHealth', e); }
      // Wrap each render in try/catch so one card failing (e.g. stale data)
      // doesn't prevent the rest from rendering on subsequent polls.
      try { renderAnalysis(); } catch(e) { console.error('renderAnalysis', e); }
      try { renderDecision(); } catch(e) { console.error('renderDecision', e); }
      state.lastDataTs = Date.now() / 1000;
      try { renderInfo(); } catch(e) { console.error('renderInfo', e); }
      try { renderQueues(); } catch(e) { console.error('renderQueues', e); }
      try { renderML(); } catch(e) { console.error('renderML', e); }
      try { renderPnL(); } catch(e) { console.error('renderPnL', e); }
      try { renderEcoCal(); } catch(e) { console.error('renderEcoCal', e); }
    })
    .catch(() => { setPollStatus(false); });
}
