/* lib/stream.js — SSE chunk parser for OpenAI-compatible streaming */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  var THINK_OPEN = '<' + 'think>';
  var THINK_CLOSE = '<' + '/think>';

  function parseSSEChunk(chunk, buffer, onDelta, onDone) {
    buffer.text += chunk;
    var parts = buffer.text.split('\n\n');
    buffer.text = parts.pop() || '';
    parts.forEach(function (block) {
      var lines = block.split('\n');
      var data = '';
      lines.forEach(function (l) {
        if (l.slice(0, 6) === 'data: ') data += l.slice(6);
        else if (l === 'data:') data += '';
      });
      if (!data) return;
      if (data === '[DONE]') { onDone(); return; }
      try {
        var j = JSON.parse(data);
        var delta = j.choices && j.choices[0] && j.choices[0].delta;
        if (delta && delta.content) {
          var c = delta.content;
          if (buffer.thinking) {
            var closeIdx = c.indexOf(THINK_CLOSE);
            if (closeIdx !== -1) { c = c.slice(closeIdx + THINK_CLOSE.length); buffer.thinking = false; }
            else { c = ''; }
          }
          if (!buffer.thinking && c) {
            var openIdx = c.indexOf(THINK_OPEN);
            if (openIdx !== -1) {
              c = c.slice(openIdx + THINK_OPEN.length);
              var endIdx = c.indexOf(THINK_CLOSE);
              if (endIdx !== -1) { c = c.slice(endIdx + THINK_CLOSE.length); }
              else { buffer.thinking = true; c = ''; }
            }
          }
          if (c) onDelta(c);
        }
        if (j.choices && j.choices[0] && j.choices[0].finish_reason === 'stop') onDone();
      } catch (e) {}
    });
    var tail = buffer.text;
    var tagPrefixes = [THINK_OPEN, THINK_CLOSE];
    tagPrefixes.forEach(function (p) {
      if (tail.slice(-p.length) === p) { buffer.text = buffer.text.slice(0, -p.length); }
    });
  }

  CC.stream = {
    parseSSEChunk: parseSSEChunk
  };
})();
