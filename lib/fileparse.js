/* cangcilung — File parsers (PDF, XLSX, DOCX, images).
   Extracted from app.js for modularity. */
window.cangcilungLib = window.cangcilungLib || {};

window.cangcilungLib.readFileAsText = function (file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(new Error('Gagal membaca file.')); };
    r.readAsText(file);
  });
};

window.cangcilungLib.parsePdf = function (file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var typed = new Uint8Array(r.result);
        var task = window.pdfjsLib.getDocument({ data: typed });
        task.promise.then(function (doc) {
          var pages = [];
          var chain = Promise.resolve();
          for (var i = 1; i <= doc.numPages; i++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return doc.getPage(pageNum).then(function (page) {
                  return page.getTextContent().then(function (tc) {
                    var line = tc.items.map(function (it) { return it.str || ''; }).join(' ');
                    pages.push('-- Halaman ' + pageNum + ' --\n' + line);
                  });
                });
              });
            })(i);
          }
          chain.then(function () { resolve(pages.join('\n')); }, reject);
        }, reject);
      } catch (e) { reject(new Error('PDF tidak valid: ' + e.message)); }
    };
    r.onerror = function () { reject(new Error('Gagal membaca PDF.')); };
    r.readAsArrayBuffer(file);
  });
};

window.cangcilungLib.parseXlsx = function (file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      try {
        if (typeof XLSX === 'undefined') return reject(new Error('Library Excel belum termuat. Cek koneksi internet.'));
        var wb = XLSX.read(r.result, { type: 'array' });
        if (!wb || !wb.SheetNames || !wb.SheetNames.length) return reject(new Error('File Excel kosong atau tidak valid.'));
        var out = [];
        wb.SheetNames.forEach(function (sheetName) {
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
          out.push('-- Sheet: ' + sheetName + ' --');
          rows.slice(0, 300).forEach(function (row) {
            var cells = (row || []).map(function (c) { return c === '' || c == null ? '' : String(c); });
            out.push(cells.join(' | '));
          });
        });
        var result = out.join('\n');
        if (!result.trim()) return reject(new Error('File Excel kosong.'));
        resolve(result);
      } catch (e) { reject(new Error('File Excel tidak valid: ' + e.message)); }
    };
    r.onerror = function () { reject(new Error('Gagal membaca Excel.')); };
    r.readAsArrayBuffer(file);
  });
};

window.cangcilungLib.parseDocx = function (file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      try {
        if (typeof mammoth === 'undefined') return reject(new Error('Library Word belum termuat. Cek koneksi internet.'));
        mammoth.extractRawText({ arrayBuffer: r.result }).then(function (res) {
          var result = (res.value || '').trim();
          if (!result) return reject(new Error('File Word kosong atau tanpa teks.'));
          resolve(result);
        }, reject);
      } catch (e) { reject(new Error('File Word tidak valid: ' + e.message)); }
    };
    r.onerror = function () { reject(new Error('Gagal membaca Word.')); };
    r.readAsArrayBuffer(file);
  });
};

window.cangcilungLib.parseFile = function (file) {
  var lib = window.cangcilungLib;
  var name = (file.name || '').toLowerCase();
  if (/\.(txt|md|markdown|csv|json|log)$/i.test(name)) return lib.readFileAsText(file);
  if (/\.pdf$/i.test(name)) return lib.parsePdf(file);
  if (/\.(xlsx|xls)$/i.test(name)) return lib.parseXlsx(file);
  if (/\.docx$/i.test(name)) return lib.parseDocx(file);
  return Promise.reject(new Error('Jenis file tidak didukung. Gunakan .txt, .md, .csv, .json, .log, .pdf, .xlsx, atau .docx.'));
};

window.cangcilungLib.parseImage = function (file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 1200;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        var sizeKB = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 3 / 4 / 1024);
        resolve({ dataUrl: dataUrl, width: w, height: h, sizeKB: sizeKB, name: file.name });
      };
      img.onerror = function () { reject(new Error('Gambar tidak dapat dibaca.')); };
      img.src = reader.result;
    };
    reader.onerror = function () { reject(new Error('Gagal membaca gambar.')); };
    reader.readAsDataURL(file);
  });
};
