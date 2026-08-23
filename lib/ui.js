/* lib/ui.js — Pure UI utility functions for cangcilung
 * Functions: showToast, setStatus, setSendUI, closeToolsMenu, closeInputMore,
 *            toggleSidebar, closeSidebar
 * These have no state dependencies — only DOM APIs.
 */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  function $(id) { return document.getElementById(id); }

  function showToast(msg, isError) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function setStatus(msg, isError) {
    var el = $('chat-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'chat-status' + (isError ? ' error' : '');
    if (isError) el.setAttribute('role', 'alert');
    else el.removeAttribute('role');
  }

  function setSendUI(streaming) {
    var btn = $('btn-send');
    if (!btn) return;
    if (streaming) {
      btn.textContent = '⏹';
      btn.title = 'Hentikan jawaban';
      btn.disabled = false;
    } else {
      btn.textContent = '➤';
      btn.title = 'Kirim pesan';
      btn.disabled = false;
    }
  }

  function closeToolsMenu() {
    var menu = $('tools-menu');
    if (menu) { menu.hidden = true; }
    var tb = $('btn-tools');
    if (tb) tb.setAttribute('aria-expanded', 'false');
  }

  function closeInputMore() {
    var m = $('input-more-menu');
    if (m) { m.hidden = true; }
    var imb = $('btn-input-more');
    if (imb) imb.setAttribute('aria-expanded', 'false');
  }

  function toggleSidebar() {
    var sb = $('sidebar');
    if (!sb) return;
    sb.classList.toggle('open');
  }

  function closeSidebar() {
    var sb = $('sidebar');
    if (sb) sb.classList.remove('open');
  }

  CC.ui = {
    showToast: showToast,
    setStatus: setStatus,
    setSendUI: setSendUI,
    closeToolsMenu: closeToolsMenu,
    closeInputMore: closeInputMore,
    toggleSidebar: toggleSidebar,
    closeSidebar: closeSidebar
  };
})();
