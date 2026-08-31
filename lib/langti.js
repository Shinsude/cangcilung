/* cangcilung — Utilities bahasa & sentimen (murni, tanpa DOM/state).
   Diekstrak dari app.js untuk modularitas. */
window.cangcilungLang = window.cangcilungLang || {};

window.cangcilungLang.detectLanguage = function (text) {
  var idWords = ['apa', 'itu', 'ini', 'dan', 'adalah', 'dengan', 'untuk', 'dari', 'pada', 'tidak', 'bisa', 'mau', 'bagaimana', 'cara', 'kenapa', 'kapan', 'dimana', 'siapa', 'berapa', 'ada', 'saya', 'kamu', 'kami', 'mereka', 'juga', 'sudah', 'akan', 'sedang', 'telah', 'hanya', 'dalam', 'oleh', 'ke', 'di', 'yang', 'lebih', 'sangat', 'jika', 'maka', 'karena', 'tetapi', 'atau', 'juga', 'halo', 'hai', 'selamat', 'tolong', 'jelaskan', 'berikan', 'buat', 'tulis', 'bantu'];
  var enWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'is', 'are', 'the', 'and', 'or', 'but', 'can', 'could', 'would', 'should', 'will', 'do', 'does', 'did', 'have', 'has', 'had', 'make', 'give', 'write', 'help', 'explain', 'hello', 'hi', 'please', 'thanks', 'thank', 'you', 'your', 'this', 'that', 'these', 'those', 'with', 'from', 'about', 'into', 'just', 'also', 'very', 'really', 'more', 'most', 'than', 'then', 'now', 'here', 'there'];
  var words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(function (w) { return w.length > 1; });
  var idScore = 0, enScore = 0;
  words.forEach(function (w) {
    if (idWords.indexOf(w) !== -1) idScore += 3;
    if (enWords.indexOf(w) !== -1) enScore += 3;
  });
  words.forEach(function (w) { if (w.length > 4 && w.slice(-3) === 'kan' || w.slice(-3) === 'nya' || w.slice(-3) === 'lah' || w.slice(-3) === 'kah') idScore += 2; });
  words.forEach(function (w) { if (w.length > 4 && (w.slice(-3) === 'ing' || w.slice(-3) === 'tion' || w.slice(-4) === 'ment')) enScore += 2; });
  return enScore > idScore + 2 ? 'en' : 'id';
};

window.cangcilungLang.detectLanguageMismatch = function (text, history) {
  var self = window.cangcilungLang;
  var lang = self.detectLanguage(text);
  if (lang === 'en' && history.length > 0) {
    var lastUser = history.filter(function (m) { return m.role === 'user'; }).slice(-1)[0];
    if (lastUser) {
      var prevLang = self.detectLanguage(lastUser.content || '');
      if (prevLang === 'id') return { switched: true, from: 'id', to: 'en' };
    }
  }
  if (lang === 'id' && history.length > 0) {
    var lastUser2 = history.filter(function (m) { return m.role === 'user'; }).slice(-1)[0];
    if (lastUser2) {
      var prevLang2 = self.detectLanguage(lastUser2.content || '');
      if (prevLang2 === 'en') return { switched: true, from: 'en', to: 'id' };
    }
  }
  return { switched: false, lang: lang };
};

window.cangcilungLang.detectSentiment = function (text) {
  var t = text.toLowerCase();
  if (/\b(marah|kesal|frustrasi|annoyed|tidak puas|buruk|jelek|parah|sampah|useless|gabisa|gak bisa|ga bisa|tidak bisa|bodo|bodoh|tolol|idiot|stupid|memalukan)\b/i.test(t)) return 'frustrated';
  if (/\b(mohon|please|tolong|bantuan|urgent|segera|cepat|penting|darurat|emergency|asap)\b/i.test(t)) return 'urgent';
  if (/\b(keren|bagus|mantap|hebat|luar biasa|amazing|great|awesome|terbaik|top|suka|love)\b/i.test(t)) return 'positive';
  if (/\b(bingung|confused|tidak mengerti|gak ngerti|kurang jelas|agak aneh|aneh|bingung\b)/i.test(t)) return 'confused';
  return 'neutral';
};

window.cangcilungLang.getSentimentHint = function (sentiment) {
  var HINTS = {
    frustrated: '\n[SENTIMEN: FRUSTRASI] User tampak kesal. Akui frustrasi dengan empati, fokus pada solusi langsung, hindari basa-basi. Mulai dengan: "Saya paham ini menjengkelkan." atau setara.',
    urgent: '\n[SENTIMEN: URGENT] User membutuhkan bantuan segera. Jawab langsung ke poin, langkah-langkah konkret, tanpa penjelasan berlebihan. Mulai dengan solusi.',
    positive: '\n[SENTIMEN: POSITIF] User antusias. Manfaatkan energi positif ini, berikan respons yang match dengan enthusiasm-nya.',
    confused: '\n[SENTIMEN: BINGUNG] User tampak bingung. Mulai dari konsep paling dasar, gunakan analogi sederhana, langkah per langkah yang sangat jelas.'
  };
  return HINTS[sentiment] || '';
};

window.cangcilungLang.buildSessionSummary = function (history) {
  if (!history || history.length < 4) return '';
  var userMsgs = history.filter(function (m) { return m.role === 'user'; }).slice(-6);
  var topics = [];
  var seen = {};
  userMsgs.forEach(function (m) {
    var words = (m.content || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length > 4 && !seen[w]; });
    words.slice(0, 5).forEach(function (w) { seen[w] = true; topics.push(w); });
  });
  if (topics.length < 3) return '';
  var last = userMsgs[userMsgs.length - 1];
  var snippet = last ? last.content.slice(0, 100) : '';
  return 'Topik sebelumnya: ' + topics.slice(0, 8).join(', ') + (snippet ? '. Pertanyaan terakhir: "' + snippet + '..."' : '');
};

window.cangcilungLang.detectMomentum = function (history) {
  if (!history || history.length < 6) return null;
  var recent = history.slice(-8);
  var userMsgs = recent.filter(function (m) { return m.role === 'user'; });
  if (userMsgs.length < 3) return null;
  var lastFew = userMsgs.slice(-3);
  var words1 = (lastFew[0].content || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length > 3; });
  var words2 = (lastFew[1].content || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length > 3; });
  var words3 = (lastFew[2].content || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length > 3; });
  var common12 = 0, common23 = 0;
  var s1 = {}; words1.forEach(function (w) { s1[w] = 1; });
  var s2 = {}; words2.forEach(function (w) { s2[w] = 1; });
  words3.forEach(function (w) { if (s1[w]) common12++; if (s2[w]) common23++; });
  var r1 = common12 / (Math.min(words1.length, words3.length) || 1);
  var r2 = common23 / (Math.min(words2.length, words3.length) || 1);
  if (r1 > 0.5 && r2 > 0.5) {
    return 'Pertanyaan berulang dengan topik sama. Coba arahkan ke aspek yang lebih spesifik atau berikan contoh praktis yang berbeda.';
  }
  return null;
};
