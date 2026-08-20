/* cangcilung — Safe math evaluator + logic detection.
   Extracted from app.js for modularity. */
window.cangcilungLib = window.cangcilungLib || {};

window.cangcilungLib.safeEval = function (expr) {
  expr = String(expr).replace(/[^\d+\-*/().^,%\s]/g, '');
  if (!/[\d]/.test(expr) || !/[-+*/^]/.test(expr)) return null;
  expr = expr.replace(/\s+/g, '').replace(/,/g, '.').replace(/\^/g, '**');
  if (/\.\./.test(expr) || /^\./.test(expr) || /\.$/.test(expr)) return null;
  if (/[^0-9)]\*{2}[^0-9(]/.test(expr) || /\*{3,}/.test(expr)) return null;
  var result = (function parse(s, pos) {
    pos = pos || { i: 0 };
    function parseExpr() {
      var left = parseTerm();
      while (pos.i < s.length && (s[pos.i] === '+' || s[pos.i] === '-')) {
        var op = s[pos.i++];
        var right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      while (pos.i < s.length && (s[pos.i] === '*' || s[pos.i] === '/')) {
        var op = s[pos.i++];
        var right = parseUnary();
        left = op === '*' ? left * right : left / right;
      }
      return left;
    }
    function parseUnary() {
      if (s[pos.i] === '-') { pos.i++; return -parsePrimary(); }
      if (s[pos.i] === '+') { pos.i++; }
      return parsePrimary();
    }
    function parsePrimary() {
      if (s[pos.i] === '(') {
        pos.i++;
        var val = parseExpr();
        if (s[pos.i] === ')') pos.i++;
        return val;
      }
      var numStr = '';
      while (pos.i < s.length && /[0-9.]/.test(s[pos.i])) { numStr += s[pos.i++]; }
      var num = parseFloat(numStr);
      if (pos.i < s.length && s[pos.i] === '*') {
        if (s[pos.i + 1] === '*') { pos.i += 2; return Math.pow(num, parseUnary()); }
      }
      return num;
    }
    var r = parseExpr();
    return (pos.i >= s.length && isFinite(r)) ? r : null;
  })(expr);
  return result;
};

window.cangcilungLib.calcAnswer = function (text) {
  var trimmed = text.trim();
  trimmed = trimmed.replace(/^(berapa|hitung|jumlahkan|hasil\s+dari)\s*/i, '').trim();
  if (/^[?]/.test(trimmed)) trimmed = trimmed.slice(1).trim();
  if (!/^\d/.test(trimmed) && !/^[(]/.test(trimmed)) return null;
  var expr = trimmed.replace(/%/g, '/100').replace(/,/g, '.').replace(/\^/g, '**').replace(/\s+/g, '');
  if (/\D{4,}/.test(expr.replace(/\/100/g, ''))) return null;
  var result = window.cangcilungLib.safeEval(expr);
  return result;
};
