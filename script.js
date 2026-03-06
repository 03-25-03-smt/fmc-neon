// ==UserScript==
// @name         ⚡ FMC Neon Pulse — Rail & Case Automation v2.2
// @namespace    http://tampermonkey.net/fmc-neon-pulse
// @version      2.2
// @description  Neon Violet VRID scanner — communicates with RS Scanner via localStorage
// @match        https://trans-logistics-eu.amazon.com/fmc/execution/*
// @exclude      https://trans-logistics-eu.amazon.com/fmc/execution/run-structure/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ═══════════════════════════════════════════
       COMMUNICATION KEYS — via localStorage (shared across scripts on same origin)
       ═══════════════════════════════════════════ */
    var RS_REQUEST_KEY  = 'neon_rs_check_request';
    var RS_RESULT_KEY   = 'neon_rs_check_result';
    var STORAGE_KEY     = 'fmc_neon_pulse_v22_state';   // internal, GM is fine

    /* ── Cross-script helpers (localStorage) ── */
    function rsWrite(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { console.error('[FMC] rsWrite', e); } }
    function rsRead(key)       { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
    function rsClear(key)      { try { localStorage.removeItem(key); } catch (e) {} }

    /* ── Internal state helpers (GM storage — private to this script) ── */
    function saveState(state) { try { GM_setValue(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
    function loadState()      { try { var r = GM_getValue(STORAGE_KEY, null); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
    function clearState()     { try { GM_deleteValue(STORAGE_KEY); } catch (e) {} }
    function sleep(ms)        { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* ═══════════════════════════════════════════
       STYLES — Neon Violet theme
       ═══════════════════════════════════════════ */
    GM_addStyle(`
#fmc-panel{position:fixed;top:10px;right:10px;width:660px;max-height:92vh;background:#0a0015;color:#e0d0f0;border:2px solid #a855f7;border-radius:10px;z-index:999999;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:12px;box-shadow:0 0 24px rgba(168,85,247,.35),0 8px 32px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:visible}
#fmc-panel-header{background:linear-gradient(135deg,#3b0764,#7c3aed,#a855f7);padding:12px 16px;font-size:15px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:move;border-bottom:1px solid #a855f7;user-select:none;border-radius:8px 8px 0 0;text-shadow:0 0 12px rgba(168,85,247,.6)}
#fmc-panel-header .accent{color:#e9d5ff;text-shadow:0 0 8px rgba(233,213,255,.5)}
.fbtn{padding:6px 16px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;margin:0 3px;transition:all .2s}
.fbtn:hover{transform:scale(1.05);box-shadow:0 0 12px rgba(168,85,247,.4)}.fbtn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.fbtn-start{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff}.fbtn-stop{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff}
.fbtn-export{background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}.fbtn-clear{background:linear-gradient(135deg,#4b5563,#6b7280);color:#fff}
.fbtn-min{background:#e9d5ff;color:#3b0764;font-size:14px;padding:4px 10px}
#fmc-controls{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#0f001f;border-bottom:1px solid #7c3aed;flex-wrap:wrap}
#fmc-counter-bar{display:flex;align-items:center;justify-content:center;gap:16px;padding:8px 14px;background:#08000f;border-bottom:1px solid #7c3aed;flex-wrap:wrap}
.counter-item{display:flex;align-items:center;gap:6px;font-size:12px}
.counter-label{color:#9ca3af;font-weight:600}
.counter-value{background:#7c3aed;color:#fff;padding:2px 12px;border-radius:12px;font-weight:700;font-size:13px;min-width:30px;text-align:center;box-shadow:0 0 8px rgba(124,58,237,.3)}
.counter-value.pink{background:#ec4899}.counter-value.yellow{background:#fde68a;color:#1f2937}
.counter-value.violet{background:#8b5cf6}.counter-value.green{background:#34d399;color:#0a0015}
#fmc-reload-notice{display:none;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-align:center;padding:10px;font-weight:700;font-size:13px;animation:rpulse 1s ease infinite}
#fmc-reload-notice.visible{display:block}
@keyframes rpulse{0%,100%{opacity:1}50%{opacity:.7}}
#fmc-page-indicator{display:flex;align-items:center;justify-content:center;gap:10px;padding:6px 14px;background:#1a0030;font-weight:700;font-size:12px;flex-wrap:wrap}
.pg-badge{background:#7c3aed;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px}
.pg-stat{color:#c084fc}
#fmc-progress-wrap{width:calc(100% - 28px);background:#1f1035;border-radius:8px;height:22px;margin:8px 14px;overflow:hidden;position:relative;border:1px solid #3b0764}
#fmc-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a855f7,#c084fc);border-radius:8px;transition:width .4s ease;box-shadow:0 0 12px rgba(168,85,247,.4)}
#fmc-progress-text{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.7)}
#fmc-summary{display:flex;justify-content:center;gap:14px;padding:6px 14px 2px;font-weight:700;flex-wrap:wrap}
.s-correct{color:#a78bfa}.s-false{color:#ef4444}.s-error{color:#fde68a}.s-total{color:#c084fc}.s-eta{color:#f472b6}.s-rail{color:#8b5cf6}.s-etapast{color:#f97316}.s-multi{color:#ec4899}.s-updated{color:#34d399}
#fmc-results{overflow-y:auto!important;overflow-x:hidden;flex:1;padding:8px;min-height:80px;max-height:46vh}
#fmc-results::-webkit-scrollbar{width:8px!important;display:block!important}
#fmc-results::-webkit-scrollbar-track{background:#0a0015}
#fmc-results::-webkit-scrollbar-thumb{background:#7c3aed;border-radius:4px;min-height:40px}
.scan-complete-banner{background:linear-gradient(135deg,#7c3aed,#a855f7,#c084fc);color:#fff;text-align:center;padding:14px;font-size:16px;font-weight:700;border-radius:8px;margin:8px;animation:bpulse 1.5s ease infinite}
@keyframes bpulse{0%,100%{box-shadow:0 0 10px rgba(168,85,247,.3)}50%{box-shadow:0 0 30px rgba(168,85,247,.6)}}
.page-separator{background:linear-gradient(90deg,transparent,#7c3aed,transparent);color:#c084fc;text-align:center;padding:8px;font-weight:700;font-size:12px;margin:10px 0;border-radius:6px;border:1px dashed #a855f7}
.fmc-card{background:#0f001f;border-radius:8px;margin-bottom:6px;border-left:4px solid #6b7280;overflow:hidden;transition:border-color .3s}
.fmc-card.result-correct{border-left-color:#a78bfa}.fmc-card.result-false{border-left-color:#ef4444}
.fmc-card.result-error{border-left-color:#fde68a}.fmc-card.result-eta{border-left-color:#f472b6}
.fmc-card.result-rail{border-left-color:#8b5cf6}.fmc-card.result-etapast{border-left-color:#f97316}
.fmc-card.result-multi{border-left-color:#ec4899}.fmc-card.result-updated{border-left-color:#34d399}
.fmc-card.processing{border-left-color:#c084fc;box-shadow:0 0 12px rgba(168,85,247,.2)}
.fmc-card-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;user-select:none}
.fmc-card-header:hover{background:rgba(168,85,247,.08)}
.fmc-card-title{font-weight:700;font-size:12px}
.fmc-card-message{padding:4px 12px 8px;font-size:11px;color:#d1d5db;background:rgba(0,0,0,.2);border-top:1px solid rgba(168,85,247,.15);display:none}
.fmc-card-message.visible{display:block}
.msg-label{font-weight:700;padding:2px 6px;border-radius:4px;margin-right:6px;font-size:10px}
.msg-label-eta{background:#f472b6;color:#fff}.msg-label-rail{background:#8b5cf6;color:#fff}
.msg-label-etapast{background:#f97316;color:#fff}.msg-label-case{background:#7c3aed;color:#fff}
.msg-label-updated{background:#34d399;color:#0a0015}
.vbadge{padding:2px 10px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase;white-space:nowrap}
.vb-pending{background:#4b5563;color:#d1d5db}.vb-processing{background:#6366f1;color:#fff;animation:neonPulse 1s ease infinite}
.vb-correct{background:#a78bfa;color:#0a0015}.vb-false{background:#ef4444;color:#fff}
.vb-error{background:#fde68a;color:#1f2937}.vb-eta{background:#f472b6;color:#fff}
.vb-rail{background:#8b5cf6;color:#fff}.vb-etapast{background:#f97316;color:#fff}
.vb-multi{background:linear-gradient(135deg,#ec4899,#f472b6);color:#fff}
.vb-case-created{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 0 8px rgba(168,85,247,.4)}
.vb-timeout{background:#6b7280;color:#fde68a}
.vb-updated{background:#34d399;color:#0a0015;box-shadow:0 0 8px rgba(52,211,153,.3)}
@keyframes neonPulse{0%,100%{box-shadow:0 0 6px rgba(168,85,247,.4)}50%{box-shadow:0 0 16px rgba(168,85,247,.7)}}
.fmc-card-steps{display:none;padding:4px 12px 10px;font-size:11px}
.fmc-card.expanded .fmc-card-steps{display:block}
.step-row{display:flex;align-items:center;padding:3px 0;gap:8px;border-bottom:1px solid rgba(168,85,247,.08)}
.step-row.hidden-step{display:none}.step-row.visible-step{display:flex}
.step-icon{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.step-icon.pending{background:#4b5563}.step-icon.running{background:#6366f1;animation:pulse .8s infinite alternate}
.step-icon.success{background:#a78bfa;color:#0a0015}.step-icon.fail{background:#ef4444}
.step-label{flex:1}.step-time{color:#6b7280;font-size:10px}
@keyframes pulse{from{opacity:.5}to{opacity:1}}
#fmc-speed{background:#1a0030;color:#d1d5db;border:1px solid #7c3aed;border-radius:4px;padding:4px 6px;font-size:11px}
#fmc-case-summary{background:#08000f;border:1px solid #7c3aed;border-radius:8px;margin:8px;padding:8px;font-size:11px;display:none}
#fmc-case-summary.visible{display:block}
#fmc-case-summary h4{color:#a855f7;margin:0 0 6px;font-size:13px}
.case-entry{display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#0f001f;border-radius:4px;margin-bottom:3px;border-left:3px solid #7c3aed}
.case-entry .case-id{color:#fde68a;font-weight:700;font-size:12px}
.case-entry .case-type{color:#c084fc;font-size:10px}
#fmc-user-prompt{position:fixed;top:100px;left:10px;width:380px;background:#12002a;color:#e0d0f0;border:2px solid #a855f7;border-radius:10px;z-index:9999999;font-family:'Segoe UI',sans-serif;font-size:13px;box-shadow:0 0 24px rgba(168,85,247,.4);display:none;flex-direction:column}
#fmc-user-prompt.visible{display:flex}
#fmc-user-prompt-header{background:linear-gradient(135deg,#5b21b6,#7c3aed,#a855f7);padding:10px 14px;font-size:14px;font-weight:700;border-radius:8px 8px 0 0;text-align:center;cursor:move;user-select:none}
#fmc-user-prompt-body{padding:16px;text-align:center}
#fmc-user-prompt-msg{margin-bottom:14px;line-height:1.5}
#fmc-user-prompt-btn{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:8px;padding:10px 32px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s}
#fmc-user-prompt-btn:hover{transform:scale(1.05)}
#fmc-user-prompt-step{color:#c084fc;font-size:11px;margin-top:8px}
#fmc-user-prompt-timer{color:#fde68a;font-size:16px;font-weight:700;margin-bottom:10px;display:none}
#fmc-user-prompt-timer.urgent{color:#ef4444;animation:timerPulse .5s ease infinite}
@keyframes timerPulse{0%,100%{opacity:1}50%{opacity:.5}}
#fmc-user-prompt-progress{width:100%;height:6px;background:#1a0030;border-radius:3px;margin-bottom:12px;overflow:hidden;display:none}
#fmc-user-prompt-progress.visible{display:block}
#fmc-user-prompt-progress-bar{height:100%;width:100%;background:linear-gradient(90deg,#7c3aed,#a855f7,#fde68a);border-radius:3px;transition:width 1s linear}
html,body{overflow-y:auto!important}
    `);

    /* ═══════════════════════════════════════════
       BUILD PANELS
       ═══════════════════════════════════════════ */
    var panel = document.createElement('div');
    panel.id = 'fmc-panel';
    panel.innerHTML = [
        '<div id="fmc-panel-header">',
        '  <div>⚡ <span class="accent">FMC Neon Pulse</span> v2.2</div>',
        '  <div><button class="fbtn fbtn-min" id="fmc-minimize">−</button></div>',
        '</div>',
        '<div id="fmc-body">',
        '  <div id="fmc-controls">',
        '    <button class="fbtn fbtn-start" id="fmc-start">▶ Start Full Scan</button>',
        '    <button class="fbtn fbtn-stop" id="fmc-stop" disabled>⏹ Stop</button>',
        '    <button class="fbtn fbtn-export" id="fmc-export" disabled>📥 CSV</button>',
        '    <button class="fbtn fbtn-clear" id="fmc-clear">🗑 Clear</button>',
        '    <label style="margin-left:8px;font-size:11px;">Delay: <select id="fmc-speed">',
        '      <option value="100">Turbo</option><option value="500">Fast</option>',
        '      <option value="1000" selected>Normal</option><option value="2000">Slow</option>',
        '    </select></label>',
        '  </div>',
        '  <div id="fmc-counter-bar">',
        '    <div class="counter-item"><span class="counter-label">📊 Total:</span><span class="counter-value" id="cnt-global-vrids">0</span></div>',
        '    <div class="counter-item"><span class="counter-label">📋 Cases:</span><span class="counter-value pink" id="cnt-cases-created">0</span></div>',
        '    <div class="counter-item"><span class="counter-label">✅ 3rdOK:</span><span class="counter-value green" id="cnt-3rd-updated">0</span></div>',
        '    <div class="counter-item"><span class="counter-label">📄 Page:</span><span class="counter-value violet" id="cnt-current-page">1</span></div>',
        '    <div class="counter-item"><span class="counter-label">📑 Pages:</span><span class="counter-value yellow" id="cnt-total-pages">?</span></div>',
        '  </div>',
        '  <div id="fmc-reload-notice">🔄 Navigating…</div>',
        '  <div id="fmc-page-indicator">',
        '    <span class="pg-stat">VRIDs: <span class="pg-badge" id="pg-vrid-count">—</span></span>',
        '    <span class="pg-stat">Status: <span id="pg-status" style="color:#c084fc;">Ready</span></span>',
        '  </div>',
        '  <div id="fmc-progress-wrap"><div id="fmc-progress-bar"></div><div id="fmc-progress-text">Ready — Click Start</div></div>',
        '  <div id="fmc-summary">',
        '    <span class="s-total">Total: <span id="sum-total">0</span></span>',
        '    <span class="s-correct">✅ <span id="sum-correct">0</span></span>',
        '    <span class="s-false">❌ <span id="sum-false">0</span></span>',
        '    <span class="s-eta">🕐 <span id="sum-eta">0</span></span>',
        '    <span class="s-rail">🚂 <span id="sum-rail">0</span></span>',
        '    <span class="s-multi">🚛 <span id="sum-multitrailer">0</span></span>',
        '    <span class="s-updated">🔄 <span id="sum-updated">0</span></span>',
        '    <span class="s-etapast">⏰ <span id="sum-etapast">0</span></span>',
        '    <span class="s-error">⚠️ <span id="sum-error">0</span></span>',
        '  </div>',
        '  <div id="fmc-case-summary"><h4>📋 Created Cases</h4><div id="fmc-case-list"></div></div>',
        '  <div id="fmc-results"></div>',
        '</div>'
    ].join('\n');
    document.body.appendChild(panel);

    var promptPanel = document.createElement('div');
    promptPanel.id = 'fmc-user-prompt';
    promptPanel.innerHTML = [
        '<div id="fmc-user-prompt-header">⚡ Action Required</div>',
        '<div id="fmc-user-prompt-body">',
        '  <div id="fmc-user-prompt-timer"></div>',
        '  <div id="fmc-user-prompt-progress"><div id="fmc-user-prompt-progress-bar"></div></div>',
        '  <div id="fmc-user-prompt-msg"></div>',
        '  <button id="fmc-user-prompt-btn">✅ Continue</button>',
        '  <div id="fmc-user-prompt-step"></div>',
        '</div>'
    ].join('\n');
    document.body.appendChild(promptPanel);

    /* ═══════════════════════════════════════════
       DRAG
       ═══════════════════════════════════════════ */
    (function () {
        var h = document.getElementById('fmc-panel-header'), d = false, ox, oy;
        h.addEventListener('mousedown', function (e) { if (e.target.tagName === 'BUTTON') return; d = true; ox = e.clientX - panel.getBoundingClientRect().left; oy = e.clientY - panel.getBoundingClientRect().top; });
        document.addEventListener('mousemove', function (e) { if (!d) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; });
        document.addEventListener('mouseup', function () { d = false; });
    })();
    (function () {
        var h = document.getElementById('fmc-user-prompt-header'), d = false, ox, oy;
        h.addEventListener('mousedown', function (e) { d = true; ox = e.clientX - promptPanel.getBoundingClientRect().left; oy = e.clientY - promptPanel.getBoundingClientRect().top; });
        document.addEventListener('mousemove', function (e) { if (!d) return; promptPanel.style.left = (e.clientX - ox) + 'px'; promptPanel.style.top = (e.clientY - oy) + 'px'; });
        document.addEventListener('mouseup', function () { d = false; });
    })();

    var bodyEl = document.getElementById('fmc-body');
    document.getElementById('fmc-minimize').addEventListener('click', function () {
        var h = bodyEl.style.display === 'none'; bodyEl.style.display = h ? '' : 'none'; this.textContent = h ? '−' : '+';
    });

    /* ═══════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════ */
    var running = false, stopRequested = false;
    var results = [], createdCases = [];
    var counts = { total: 0, correct: 0, false: 0, error: 0, eta: 0, rail: 0, etapast: 0, multiTrailer: 0, thirdLegUpdated: 0 };
    var globalIndex = 0, currentPage = 1, totalPages = 1;
    var $id = function (s) { return document.getElementById(s); };
    function getDelay() { return parseInt($id('fmc-speed').value, 10) || 1000; }

    /* ═══════════════════════════════════════════
       DATATABLE API
       ═══════════════════════════════════════════ */
    function getDataTable() { try { if (typeof jQuery !== 'undefined' && jQuery.fn.DataTable) { var t = jQuery('#fmc-execution-plans-vrs'); if (t.length > 0 && jQuery.fn.DataTable.isDataTable(t)) return t.DataTable(); } } catch (e) {} return null; }
    function getPageInfo() { var dt = getDataTable(); if (dt) { try { var i = dt.page.info(); return { page: i.page, pages: i.pages, total: i.recordsDisplay }; } catch (e) {} } return null; }
    async function goToNextPage() { var dt = getDataTable(); if (!dt) return false; var info = dt.page.info(); if (info.page >= info.pages - 1) return false; var old = info.page; dt.page('next').draw('page'); var w = 0; while (w < 10000) { await sleep(300); w += 300; if (dt.page.info().page !== old) { await sleep(800); return true; } } return false; }
    function hasMorePages() { var dt = getDataTable(); if (dt) { try { var i = dt.page.info(); return i.page < i.pages - 1; } catch (e) {} } return false; }

    /* ═══════════════════════════════════════════
       USER PROMPT
       ═══════════════════════════════════════════ */
    var promptResolve = null, promptTimerInterval = null;
    function showUserPrompt(message, stepInfo, timeoutSec) {
        timeoutSec = timeoutSec || 15;
        return new Promise(function (resolve) {
            var remaining = timeoutSec; promptResolve = resolve;
            $id('fmc-user-prompt-msg').innerHTML = message;
            $id('fmc-user-prompt-step').textContent = stepInfo || '';
            var te = $id('fmc-user-prompt-timer'); te.textContent = '⏱ ' + remaining + 's'; te.style.display = 'block'; te.classList.remove('urgent');
            var pw = $id('fmc-user-prompt-progress'), pb = $id('fmc-user-prompt-progress-bar');
            pw.classList.add('visible'); pb.style.width = '100%';
            promptPanel.classList.add('visible');
            promptTimerInterval = setInterval(function () {
                remaining--; te.textContent = '⏱ ' + remaining + 's'; pb.style.width = Math.round((remaining / timeoutSec) * 100) + '%';
                if (remaining <= 5) te.classList.add('urgent');
                if (remaining <= 0) { clearInterval(promptTimerInterval); promptTimerInterval = null; te.style.display = 'none'; pw.classList.remove('visible'); promptPanel.classList.remove('visible'); if (promptResolve) { var r = promptResolve; promptResolve = null; r('timeout'); } }
            }, 1000);
        });
    }
    function hideUserPrompt() { if (promptTimerInterval) { clearInterval(promptTimerInterval); promptTimerInterval = null; } $id('fmc-user-prompt-timer').style.display = 'none'; $id('fmc-user-prompt-progress').classList.remove('visible'); promptPanel.classList.remove('visible'); }
    $id('fmc-user-prompt-btn').addEventListener('click', function () { hideUserPrompt(); if (promptResolve) { var r = promptResolve; promptResolve = null; r('continue'); } });

    /* ═══════════════════════════════════════════
       DOM HELPERS
       ═══════════════════════════════════════════ */
    function extractVridCode(row) { var s = row.querySelector('td.borderless-fix span.clickable-text.vr-audit-dialog'); if (s) return s.textContent.trim(); s = row.querySelector('span.vr-audit-dialog'); if (s) return s.textContent.trim(); var td = row.querySelector('td.borderless-fix'); if (td) { s = td.querySelector('span'); if (s) return s.textContent.trim(); } return row.id; }
    function getCurrentPageRows() { return Array.from(document.querySelectorAll('table#fmc-execution-plans-vrs tbody tr[role="row"]')).filter(function (tr) { return tr.id && /^c\d+/.test(tr.id); }); }
    async function waitForTableReady(t) { t = t || 30000; var s = Date.now(); while (Date.now() - s < t) { if (getCurrentPageRows().length > 0) { await sleep(500); return true; } await sleep(500); } return false; }
    function setNativeInputValue(input, value) { var p = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    function closeDialogs() { document.querySelectorAll('.ui-dialog .ui-dialog-titlebar-close').forEach(function (b) { try { b.click(); } catch (_) {} }); }
    function closeCaseCreationDialog() { var d = document.querySelectorAll('div[role="dialog"][aria-modal="true"]'); if (!d.length) return; var dl = d[d.length - 1]; var c = dl.querySelector('button[mdn-popover-offset]'); if (!c) { var bs = dl.querySelectorAll('button'); for (var i = 0; i < bs.length; i++) { var pa = bs[i].querySelector('path'); if (pa && (pa.getAttribute('d') || '').indexOf('1.76') !== -1) { c = bs[i]; break; } } } if (c) c.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); }

    /* ═══════════════════════════════════════════
       UI HELPERS
       ═══════════════════════════════════════════ */
    function updateCounters() { $id('cnt-global-vrids').textContent = globalIndex; $id('cnt-cases-created').textContent = createdCases.length; $id('cnt-3rd-updated').textContent = counts.thirdLegUpdated; $id('cnt-current-page').textContent = currentPage; var pi = getPageInfo(); if (pi) { totalPages = pi.pages; $id('cnt-total-pages').textContent = pi.pages; } }
    function updateProgress(c, t) { var p = t ? Math.round((c / t) * 100) : 0; $id('fmc-progress-bar').style.width = p + '%'; $id('fmc-progress-text').textContent = 'Page ' + currentPage + ' — ' + c + '/' + t + ' — Global: ' + globalIndex; }
    function updateSummary() { $id('sum-total').textContent = counts.total; $id('sum-correct').textContent = counts.correct; $id('sum-false').textContent = counts.false; $id('sum-eta').textContent = counts.eta; $id('sum-rail').textContent = counts.rail; $id('sum-multitrailer').textContent = counts.multiTrailer; $id('sum-updated').textContent = counts.thirdLegUpdated; $id('sum-etapast').textContent = counts.etapast; $id('sum-error').textContent = counts.error; }
    function updateCaseSummary() { var cs = $id('fmc-case-summary'), cl = $id('fmc-case-list'); if (createdCases.length > 0) { cs.classList.add('visible'); cl.innerHTML = ''; createdCases.forEach(function (c) { var d = document.createElement('div'); d.className = 'case-entry'; d.innerHTML = '<span><strong>' + c.vridCode + '</strong> <span class="case-type">(' + c.caseType + ')</span></span><span class="case-id">📋 ' + c.caseId + '</span>'; cl.appendChild(d); }); } }
    function addPageSep(p, c) { var d = document.createElement('div'); d.className = 'page-separator'; d.innerHTML = '📄 PAGE ' + p + '/' + totalPages + ' — ' + c + ' VRIDs'; $id('fmc-results').appendChild(d); }
    function showComplete() { var b = document.createElement('div'); b.className = 'scan-complete-banner'; b.innerHTML = '🎉 ALL PAGES SCANNED 🎉<br><span style="font-size:13px;">' + counts.total + ' VRIDs | ✅' + counts.correct + ' ❌' + counts.false + ' 🕐' + counts.eta + ' 🚂' + counts.rail + ' 🚛' + counts.multiTrailer + ' 🔄' + counts.thirdLegUpdated + ' ⏰' + counts.etapast + ' ⚠️' + counts.error + (createdCases.length > 0 ? '<br>📋 ' + createdCases.length + ' case(s)' : '') + '</span>'; $id('fmc-results').appendChild(b); $id('fmc-results').scrollTop = $id('fmc-results').scrollHeight; $id('fmc-progress-bar').style.width = '100%'; $id('fmc-progress-text').textContent = '✅ DONE'; }

    /* ═══════════════════════════════════════════
       CARD / STEP HELPERS
       ═══════════════════════════════════════════ */
    var STEPS = ['Scroll & click', 'Extract VRID', 'Click toggle', 'Wait expand', 'Detect trailers', 'Find colspan', 'Details container', 'Child container', 'Child table', 'Access tbody', '2nd stop-start', 'Stop-arrival td', 'Clear-table', 'Inner tbody>tr', 'CHECK no-wrap', '[Rail] Click icon', '[Rail] Wait dialog', '[Rail] Late-truck', '[Rail] Scan dates', '[Rail] Compare dates', '[Rail] Close dialog', '[RS] Send request', '[RS] Open RS tab', '[RS] Wait result', '[RS] Compare ETAs', '[Case] Click Cases', '[Case] Wait dialog', '[Case] Create tab', '[Case] FMC-Support', '[Case] Title', '[Case] Details', '[Case] CC List', '[Case] Status', '[Case] Submit', '[Case] Case ID', '[Case] Close'];
    function createCard(g, v, r) { var c = document.createElement('div'); c.className = 'fmc-card'; c.id = 'vc-' + g; c.innerHTML = '<div class="fmc-card-header"><span class="fmc-card-title">#' + (g + 1) + ' — <strong>' + v + '</strong> <small style="color:#6b7280">(' + r + ')</small></span><span class="vbadge vb-pending" id="vb-' + g + '">PENDING</span></div><div class="fmc-card-message" id="vm-' + g + '"></div><div class="fmc-card-steps" id="vs-' + g + '"></div>'; c.querySelector('.fmc-card-header').addEventListener('click', function () { c.classList.toggle('expanded'); }); $id('fmc-results').appendChild(c); }
    function initSteps(g) { $id('vs-' + g).innerHTML = STEPS.map(function (n, i) { return '<div class="step-row ' + (i >= 15 ? 'hidden-step' : '') + '" id="sr-' + g + '-' + i + '"><div class="step-icon pending" id="si-' + g + '-' + i + '">⏳</div><span class="step-label">' + n + '</span><span class="step-time" id="st-' + g + '-' + i + '"></span></div>'; }).join(''); }
    function showStepsRange(g, f, t) { for (var i = f; i <= t; i++) { var s = $id('sr-' + g + '-' + i); if (s) { s.classList.remove('hidden-step'); s.classList.add('visible-step'); } } }
    function setSS(g, s, st, x) { var ic = $id('si-' + g + '-' + s), tm = $id('st-' + g + '-' + s); if (!ic) return; ic.className = 'step-icon ' + st; ic.textContent = { running: '⏳', success: '✅', fail: '❌' }[st] || '⏳'; if (x) tm.textContent = x; }
    function setBadge(g, s, t) { var b = $id('vb-' + g); if (b) { b.className = 'vbadge vb-' + s; b.textContent = t; } }
    function setResult(g, r) { var c = $id('vc-' + g); if (!c) return; c.classList.remove('processing', 'result-correct', 'result-false', 'result-error', 'result-eta', 'result-rail', 'result-etapast', 'result-multi', 'result-updated'); c.classList.add('result-' + r); }
    function setMsg(g, h) { var m = $id('vm-' + g); if (m) { m.innerHTML = h; m.classList.add('visible'); } }

    function scanAllDatesInDialog(dlg) { var ad = [], now = Date.now(); var dc = dlg.querySelector('.ui-dialog-content'); if (!dc) return ad; var lt = dc.querySelector('.late-truck-dialog'); if (!lt) return ad; var ch = lt.querySelectorAll(':scope > div'); if (ch.length < 5) return ad; var dt = ch[4].querySelector('table.dataTable'); if (!dt) return ad; var tb = dt.querySelector('tbody'); if (!tb) return ad; tb.querySelectorAll('tr').forEach(function (tr) { tr.querySelectorAll('td').forEach(function (td) { td.querySelectorAll('.audit-details .audit-details-first-line span[data-epoch-millis]').forEach(function (sp) { var ep = parseInt(sp.getAttribute('data-epoch-millis'), 10); ad.push({ epoch: ep, dateText: sp.textContent.trim(), isPast: !isNaN(ep) && ep < now, timezone: sp.getAttribute('data-timezone') || '' }); }); }); }); return ad; }
    function getTrailerCountFromExpandedRow(exp) { try { var a = exp.querySelector('td[colspan] .expanded-plan-execution-details-container .expanded-child-table-container:first-child table.expanded-child-table tbody tr:nth-child(3) td.assets'); if (!a) return 0; return a.querySelectorAll('div.asset-box.asset-ASSIGNED').length; } catch (e) { return 0; } }

    /* ═══════════════════════════════════════════
       ★ RS COMMUNICATION (via localStorage) ★
       ═══════════════════════════════════════════ */
    function findRunStructureLink(row) {
        var rsCell = row.querySelector('td.run-structure-id');
        if (rsCell) {
            var a = rsCell.querySelector('span.run-structure-text a[href*="/run-structure/"]');
            if (a) return a;
            a = rsCell.querySelector('a[href*="/run-structure/"]');
            if (a) return a;
        }
        var allA = row.querySelectorAll('a[href*="/run-structure/"]');
        if (allA.length > 0) return allA[allA.length - 1];
        return null;
    }

    async function requestRSCheck(row, g, vrid, fmcEta) {
        var _st;
        var _ss = function (s) { _st = Date.now(); setSS(g, s, 'running'); };
        var _ps = function (s, x) { setSS(g, s, 'success', (Date.now() - _st) + 'ms' + (x ? ' — ' + x : '')); };
        var _fs = function (s, m) { setSS(g, s, 'fail', (Date.now() - _st) + 'ms — ' + m); };
        showStepsRange(g, 21, 24);

        try {
            /* STEP 21 — Send request to localStorage */
            _ss(21);
            var rsLink = findRunStructureLink(row);
            if (!rsLink) throw { step: 21, msg: 'Run Structure link not found in row' };
            var rsHref = rsLink.href;
            if (!rsHref.startsWith('http')) rsHref = 'https://trans-logistics-eu.amazon.com' + rsLink.getAttribute('href');
            var normalizedEta = (fmcEta || '').replace(/\s+/g, ' ').trim();

            /* Clear any old result first */
            rsClear(RS_RESULT_KEY);

            rsWrite(RS_REQUEST_KEY, {
                vrid: vrid,
                fmc_eta: normalizedEta,
                rs_link: rsHref,
                timestamp: Date.now()
            });
            _ps(21, 'Request saved for ' + rsHref.split('/').pop());

            /* STEP 22 — Open RS tab */
            _ss(22);
            GM_openInTab(rsHref, { active: false });
            _ps(22, 'RS tab opened');

            /* STEP 23 — Wait for result from Script 2 */
            _ss(23);
            var rsResult = null;
            var waitStart = Date.now();
            var maxWait = 30000;

            while (Date.now() - waitStart < maxWait) {
                await sleep(800);
                try {
                    rsResult = rsRead(RS_RESULT_KEY);
                    if (rsResult && rsResult.checked) {
                        rsClear(RS_RESULT_KEY);
                        break;
                    }
                    rsResult = null;
                } catch (parseErr) {
                    console.warn('[FMC] RS result parse error:', parseErr);
                }
            }

            if (!rsResult) {
                _fs(23, 'Timeout waiting for RS Scanner result');
                rsClear(RS_REQUEST_KEY);
                rsClear(RS_RESULT_KEY);
                return { updated: false, rsVrid: null, rsEta: '', fmcEta: normalizedEta, error: 'RS timeout' };
            }

            if (rsResult.error) {
                _fs(23, 'RS error: ' + rsResult.error);
                return { updated: false, rsVrid: null, rsEta: '', fmcEta: normalizedEta, error: rsResult.error };
            }

            _ps(23, 'RS ETA: "' + rsResult.rs_eta + '" | VRID: ' + rsResult.rs_vrid);

            /* STEP 24 — Compare ETAs */
            _ss(24);
            var etasMatch = rsResult.etas_match === true;

            if (etasMatch) {
                _ps(24, '✅ ETAs MATCH — 3rd leg updated');
                return { updated: true, rsVrid: rsResult.rs_vrid, rsEta: rsResult.rs_eta, fmcEta: normalizedEta };
            } else {
                _ps(24, '❌ DIFFER — FMC:"' + normalizedEta + '" RS:"' + rsResult.rs_eta + '"');
                return { updated: false, rsVrid: rsResult.rs_vrid, rsEta: rsResult.rs_eta, fmcEta: normalizedEta };
            }

        } catch (rsErr) {
            var errStep = rsErr.step !== undefined ? rsErr.step : 21;
            _fs(errStep, rsErr.msg || rsErr.message || String(rsErr));
            rsClear(RS_REQUEST_KEY);
            rsClear(RS_RESULT_KEY);
            return { updated: false, rsVrid: null, rsEta: '', fmcEta: fmcEta, error: rsErr.msg || String(rsErr) };
        }
    }

    /* ═══════════════════════════════════════════
       CASE TITLE & DETAILS BUILDERS
       ═══════════════════════════════════════════ */
    function buildCaseTitle(vrid, f) {
        var p = [];
        if (f.multiTrailer) p.push('Multiple Trailers (x' + f.trailerCount + ')');
        if (f.railDelay) p.push('Rail Delay');
        if (f.etaPast) p.push('ETA in the Past');
        return p.join(' + ') + ' — VRID: ' + vrid;
    }

    function buildCaseDetails(vrid, f) {
        var l = ['Hello Rail Problem Solver Team,', ''];
        var issues = [];
        if (f.multiTrailer) issues.push('Multiple trailers assigned (x' + f.trailerCount + ')');
        if (f.railDelay) issues.push('Rail delay — 3rd leg TT needs update');
        if (f.etaPast) issues.push('ETA is in the past and needs to be updated');
        l.push(issues.length > 1 ? 'Multiple issues detected:' : 'An issue has been detected:');
        l.push('');
        l.push('VRID: ' + vrid);
        if (f.rsVrid && f.rsVrid !== vrid) l.push('Run Structure VRID: ' + f.rsVrid);
        if (f.multiTrailer) l.push('Trailer count: ' + f.trailerCount);
        if (f.dateDisplay) l.push('Date: ' + f.dateDisplay);
        if (f.fmcEta) l.push('FMC ETA: ' + f.fmcEta);
        if (f.rsEta) l.push('RS 3rd Leg ETA: ' + f.rsEta);
        l.push('');
        l.push('Issues:');
        issues.forEach(function (x) { l.push('  • ' + x); });
        if (f.allDates && f.allDates.length > 0) {
            l.push('');
            l.push('All dates:');
            f.allDates.forEach(function (d) { l.push('  - ' + d.dateText + (d.isPast ? ' [PAST]' : ' [OK]')); });
        }
        l.push('');
        l.push('Required actions:');
        if (f.multiTrailer) { l.push('  • Identify correct trailer from 1st leg'); l.push('  • Remove incorrect trailer'); l.push('  • Provide correct unit to Note section'); }
        if (f.railDelay) l.push('  • Update 3rd leg Transit Time');
        if (f.etaPast) l.push('  • Review and provide updated ETA');
        l.push('');
        l.push('Thank you,');
        l.push('ROC Team');
        return l.join('\n');
    }

    /* ═══════════════════════════════════════════
       ★ DIRECT FMC CASE CREATION ★
       ═══════════════════════════════════════════ */
    async function createFMCCase(exp, g, vrid, issueFlags) {
        var dl = getDelay(), _st;
        var _ss = function (s) { _st = Date.now(); setSS(g, s, 'running'); };
        var _ps = function (s, x) { setSS(g, s, 'success', (Date.now() - _st) + 'ms' + (x ? ' — ' + x : '')); };
        var _fs = function (s, m) { setSS(g, s, 'fail', (Date.now() - _st) + 'ms — ' + m); };
        showStepsRange(g, 25, 35);

        try {
            /* STEP 25 — Click Create/View Cases */
            _ss(25);
            var cTd = exp.querySelector('td[colspan="25"]') || exp.querySelector('td[colspan]');
            if (!cTd) throw { step: 25, msg: 'colspan td missing' };
            var detCont = cTd.querySelector('.expanded-plan-execution-details-container');
            if (!detCont) throw { step: 25, msg: 'details container missing' };
            var casesBtn = detCont.querySelector('.clickable-text.expanded-child-table.cases-button');
            if (!casesBtn) {
                var allCl = detCont.querySelectorAll('.clickable-text');
                for (var ci = 0; ci < allCl.length; ci++) {
                    var sp = allCl[ci].querySelector('span');
                    if ((allCl[ci].textContent.indexOf('Create/View Cases') !== -1) || (sp && sp.textContent.indexOf('Create/View Cases') !== -1)) { casesBtn = allCl[ci]; break; }
                }
            }
            if (!casesBtn) throw { step: 25, msg: 'Create/View Cases not found' };
            casesBtn.click();
            await sleep(dl + 1500);
            _ps(25, 'clicked');

            /* STEP 26 — Wait for dialog */
            _ss(26);
            var dialog = null, dS = Date.now();
            while (Date.now() - dS < 15000) {
                var ad = document.querySelectorAll('div[role="dialog"][aria-modal="true"]');
                if (ad.length > 0) { dialog = ad[ad.length - 1]; break; }
                await sleep(500);
            }
            if (!dialog) throw { step: 26, msg: 'Dialog not found' };
            _ps(26);

            /* STEP 27 — Click Create a Case tab */
            _ss(27);
            var createRadio = null, rS = Date.now();
            while (Date.now() - rS < 10000) {
                var radios = dialog.querySelectorAll('input[type="radio"][value="2"]');
                if (radios.length > 0) { createRadio = radios[0]; break; }
                var lbs = dialog.querySelectorAll('label');
                for (var li = 0; li < lbs.length; li++) {
                    var ld = lbs[li].querySelector('div');
                    if (ld && ld.textContent.indexOf('Create a Case') !== -1) { createRadio = lbs[li].querySelector('input[type="radio"]'); if (createRadio) break; }
                }
                if (createRadio) break;
                await sleep(500);
            }
            if (!createRadio) throw { step: 27, msg: 'Create a Case radio not found' };
            createRadio.click();
            await sleep(dl + 1000);
            _ps(27);

            /* STEP 28 — User selects FMC-Support */
            _ss(28);
            var topicResult = await showUserPrompt(
                '🔧 <strong>Select Topic:</strong><br><br><span style="font-size:16px;color:#fde68a;font-weight:700;">FMC - Support</span><br><br><em style="color:#a0a0a0;">Then click Continue.</em>',
                'Topic → FMC - Support', 15
            );
            if (topicResult === 'timeout') { _fs(28, 'TIMEOUT'); await sleep(500); closeCaseCreationDialog(); await sleep(1000); return { caseId: null, timedOut: true }; }
            await sleep(1000);
            _ps(28, 'confirmed');

            /* STEP 29 — Fill Title */
            _ss(29);
            dialog = document.querySelector('div[role="dialog"][aria-modal="true"]') || dialog;
            var noAui = dialog.querySelectorAll('.no-aui');
            noAui = noAui.length > 0 ? noAui[noAui.length - 1] : dialog;
            var titleInput = dialog.querySelector('input[aria-label="Title"]');
            if (!titleInput) { var sec = noAui.querySelectorAll('.css-x2r2h7'); if (sec.length >= 2) titleInput = sec[1].querySelector('input[type="text"]'); }
            if (!titleInput) { var ai = dialog.querySelectorAll('input[type="text"]'); for (var ii = 0; ii < ai.length; ii++) { if ((ai[ii].getAttribute('aria-label') || '').toLowerCase().indexOf('title') !== -1) { titleInput = ai[ii]; break; } } }
            if (!titleInput) { var ib = dialog.querySelectorAll('.css-y50mei input[type="text"]'); if (ib.length > 0) titleInput = ib[0]; }
            if (!titleInput) throw { step: 29, msg: 'Title input not found' };
            titleInput.focus(); await sleep(200);
            setNativeInputValue(titleInput, buildCaseTitle(vrid, issueFlags));
            await sleep(500);
            _ps(29);

            /* STEP 30 — Fill Details */
            _ss(30);
            var detTa = dialog.querySelector('textarea[aria-label="Details"]');
            if (!detTa) { var sec2 = noAui.querySelectorAll('.css-x2r2h7'); if (sec2.length >= 3) detTa = sec2[2].querySelector('textarea'); }
            if (!detTa) { var at = dialog.querySelectorAll('textarea'); for (var ti = 0; ti < at.length; ti++) { if ((at[ti].getAttribute('aria-label') || '').toLowerCase().indexOf('detail') !== -1) { detTa = at[ti]; break; } } if (!detTa && at.length > 0) detTa = at[0]; }
            if (!detTa) throw { step: 30, msg: 'Details textarea not found' };
            detTa.focus(); await sleep(200);
            setNativeInputValue(detTa, ''); await sleep(200);
            setNativeInputValue(detTa, buildCaseDetails(vrid, issueFlags));
            await sleep(500);
            _ps(30);

            /* STEP 31 — Fill CC List */
            _ss(31);
            var ccIn = dialog.querySelector('input[aria-label="CC List"]');
            if (!ccIn) { var sec3 = noAui.querySelectorAll('.css-x2r2h7'); if (sec3.length >= 4) ccIn = sec3[3].querySelector('input[type="text"]'); }
            if (!ccIn) { var ai2 = dialog.querySelectorAll('input[type="text"]'); for (var c2 = 0; c2 < ai2.length; c2++) { if ((ai2[c2].getAttribute('aria-label') || '').toLowerCase().indexOf('cc') !== -1) { ccIn = ai2[c2]; break; } } }
            if (!ccIn) { var ib2 = dialog.querySelectorAll('.css-y50mei input[type="text"]'); if (ib2.length >= 2) ccIn = ib2[ib2.length - 1]; }
            if (!ccIn) throw { step: 31, msg: 'CC List not found' };
            ccIn.focus(); await sleep(200);
            setNativeInputValue(ccIn, 'eu-roc-rail-problemsolver@amazon.com,eu-roc-ob-support@amazon.com');
            await sleep(500);
            _ps(31);

            /* STEP 32 — User selects Status */
            _ss(32);
            var statusResult = await showUserPrompt(
                '⚡ <strong>Select Status:</strong><br><br><span style="font-size:16px;color:#fde68a;font-weight:700;">Pending Amazon Action</span><br><br><em style="color:#a0a0a0;">Then click Continue.</em>',
                'Status → Pending Amazon Action', 15
            );
            if (statusResult === 'timeout') { _fs(32, 'TIMEOUT'); await sleep(500); closeCaseCreationDialog(); await sleep(1000); return { caseId: null, timedOut: true }; }
            await sleep(1000);
            _ps(32, 'confirmed');

            /* STEP 33 — Click Submit */
            _ss(33);
            dialog = document.querySelector('div[role="dialog"][aria-modal="true"]') || dialog;
            var submitBtn = null, sS = Date.now();
            while (Date.now() - sS < 10000) {
                var ab = dialog.querySelectorAll('button');
                for (var bi = 0; bi < ab.length; bi++) {
                    var bsp = ab[bi].querySelector('span');
                    if ((bsp && bsp.textContent.trim() === 'Submit') || ab[bi].textContent.trim() === 'Submit') { submitBtn = ab[bi]; break; }
                }
                if (submitBtn) break;
                await sleep(500);
            }
            if (!submitBtn) throw { step: 33, msg: 'Submit not found' };
            submitBtn.click();
            await sleep(dl + 2000);
            _ps(33);

            /* STEP 34 — Collect Case ID */
            _ss(34);
            var caseId = null, cS = Date.now();
            while (Date.now() - cS < 20000) {
                var allP = document.querySelectorAll('p');
                for (var pi = 0; pi < allP.length; pi++) {
                    var cm = allP[pi].textContent.trim().match(/Case\s*ID\s*(\d+)/i);
                    if (cm) { caseId = cm[1]; break; }
                }
                if (caseId) break;
                await sleep(500);
            }
            _ps(34, caseId ? 'Case ID: ' + caseId : 'UNKNOWN');
            if (!caseId) caseId = 'UNKNOWN';

            /* STEP 35 — Close dialog */
            _ss(35);
            var closed = false;
            var curDlg = document.querySelectorAll('div[role="dialog"][aria-modal="true"]');
            var lastDlg = curDlg.length > 0 ? curDlg[curDlg.length - 1] : document;
            var cBtns = lastDlg.querySelectorAll('button');
            for (var cb = 0; cb < cBtns.length; cb++) {
                var csp = cBtns[cb].querySelector('span');
                if ((csp && csp.textContent.trim() === 'Close') || cBtns[cb].textContent.trim() === 'Close') { cBtns[cb].click(); closed = true; break; }
            }
            if (!closed) closeCaseCreationDialog();
            await sleep(dl + 500);
            _ps(35, closed ? 'Closed' : 'Fallback');

            return { caseId: caseId, timedOut: false };

        } catch (caseErr) {
            var cStep = caseErr.step !== undefined ? caseErr.step : 25;
            _fs(cStep, caseErr.msg || caseErr.message || String(caseErr));
            try { closeCaseCreationDialog(); await sleep(500); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); await sleep(500); } catch (_) {}
            return { caseId: null, timedOut: false };
        }
    }

    /* ═══════════════════════════════════════════
       ★ PROCESS ONE VRID ★
       ═══════════════════════════════════════════ */
    async function processVrid(row, g, vrid) {
        var card = $id('vc-' + g);
        card.classList.add('processing', 'expanded');
        setBadge(g, 'processing', 'PROCESSING');
        var dl = getDelay(), _st;
        var _ss = function (s) { _st = Date.now(); setSS(g, s, 'running'); };
        var _ps = function (s, x) { setSS(g, s, 'success', (Date.now() - _st) + 'ms' + (x ? ' — ' + x : '')); };
        var _fs = function (s, m) { setSS(g, s, 'fail', (Date.now() - _st) + 'ms — ' + m); };

        var issueFlags = {
            multiTrailer: false, trailerCount: 0,
            railDelay: false, etaPast: false,
            dateDisplay: '', allDates: [],
            pendingInvestigation: false,
            isFalse: false, falseText: '',
            rsVrid: null, rsEta: '', fmcEta: '',
            thirdLegUpdated: false
        };

        var exp = null;

        try {
            /* STEP 0 */
            _ss(0); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); await sleep(Math.max(dl, 200)); row.click(); await sleep(dl); _ps(0);

            /* STEP 1 */
            _ss(1); if (!vrid || vrid === row.id) vrid = extractVridCode(row); _ps(1, vrid);

            /* STEP 2 */
            _ss(2); var tog = row.querySelector('td.dashboard-details-toggle'); if (!tog) throw { step: 2, msg: 'toggle missing' }; tog.click(); await sleep(dl); _ps(2);

            /* STEP 3 */
            _ss(3); var tb = row.closest('tbody'); if (!tb) throw { step: 3, msg: 'tbody missing' };
            var p0 = Date.now();
            while (Date.now() - p0 < 12000) { var sib = row.nextElementSibling; for (var i = 0; i < 5 && sib; i++) { if (sib.tagName === 'TR' && sib.querySelector('td[colspan]')) { exp = sib; break; } sib = sib.nextElementSibling; } if (exp) break; await sleep(250); }
            if (!exp) throw { step: 3, msg: 'expanded tr timeout' }; _ps(3);

            /* STEP 4 — Trailer count */
            _ss(4); var trailerCount = getTrailerCountFromExpandedRow(exp);
            if (trailerCount >= 2) { issueFlags.multiTrailer = true; issueFlags.trailerCount = trailerCount; counts.multiTrailer++; _ps(4, '🚛 x' + trailerCount); setBadge(g, 'multi', 'MULTI x' + trailerCount); setResult(g, 'multi'); }
            else { _ps(4, trailerCount + ' OK'); }

            /* STEPS 5-9 */
            _ss(5); var cTd = exp.querySelector('td[colspan="25"]') || exp.querySelector('td[colspan]'); if (!cTd) throw { step: 5, msg: 'colspan missing' }; _ps(5);
            _ss(6); var dc = cTd.querySelector('.expanded-plan-execution-details-container'); if (!dc) throw { step: 6, msg: 'details missing' }; _ps(6);
            _ss(7); var ccArr = dc.querySelectorAll('.expanded-child-table-container'); if (!ccArr.length) throw { step: 7, msg: 'child missing' }; _ps(7);
            _ss(8); var ct = ccArr[0].querySelector('table.expanded-child-table'); if (!ct) throw { step: 8, msg: 'table missing' }; _ps(8);
            _ss(9); var tby = ct.querySelector('tbody'); if (!tby) throw { step: 9, msg: 'tbody missing' }; _ps(9);

            /* STEPS 10-13 */
            _ss(10); var stopStarts = tby.querySelectorAll('tr.stop-start'); if (stopStarts.length < 2) throw { step: 10, msg: 'only ' + stopStarts.length }; _ps(10);
            _ss(11); var aTd = stopStarts[1].querySelector('td.section-start.section-end.stop-arrival.delay') || stopStarts[1].querySelector('td.stop-arrival.delay') || stopStarts[1].querySelector('td.stop-arrival'); if (!aTd) throw { step: 11, msg: 'stop-arrival missing' }; _ps(11);
            _ss(12); var clrT = aTd.querySelector('table.clear-table.full-width') || aTd.querySelector('table.clear-table'); if (!clrT) throw { step: 12, msg: 'clear-table missing' }; _ps(12);
            _ss(13); var innerTbody = clrT.querySelector('tbody'); if (!innerTbody) throw { step: 13, msg: 'inner tbody missing' }; var innerRow = innerTbody.querySelector('tr'); if (!innerRow) throw { step: 13, msg: 'inner tr missing' }; _ps(13);

            /* STEP 14 — CHECK */
            _ss(14); var nw = innerRow.querySelector('td.no-wrap'); if (!nw) throw { step: 14, msg: 'no-wrap missing' };
            var iSp = nw.querySelector('span'); var raw = nw.textContent.trim(); var sTx = iSp ? iSp.textContent.trim() : '';

            /* ═══ A: CORRECT ═══ */
            if (!iSp && raw === '') { _ps(14, '✅ CORRECT'); counts.correct++; }

            /* ═══ B: PENDING INVESTIGATION ═══ */
            else if (sTx.toLowerCase().indexOf('pending investigation') !== -1) { _ps(14, '🕐 Pending'); issueFlags.pendingInvestigation = true; counts.eta++; }

            /* ═══ C: RAIL DELAY ═══ */
            else if (/rail\s*delay/i.test(sTx)) {
                _ps(14, '🚂 Rail delay');
                showStepsRange(g, 15, 20);
                var railEtaFromDialog = '';

                try {
                    _ss(15); var iconBtn = innerRow.querySelector('td.icon-button') || clrT.querySelector('td.icon-button') || aTd.querySelector('td.icon-button');
                    if (!iconBtn) throw { step: 15, msg: 'icon-button missing' };
                    (iconBtn.querySelector('button,a,span,div') || iconBtn).click(); await sleep(dl + 500); _ps(15);

                    _ss(16); var dlg = null, dp = Date.now();
                    while (Date.now() - dp < 10000) { var dls = document.querySelectorAll('.ui-dialog.ui-widget.ui-widget-content'); for (var di = 0; di < dls.length; di++) { if (dls[di].style.display !== 'none' && dls[di].offsetHeight > 0) dlg = dls[di]; } if (dlg) break; await sleep(300); }
                    if (!dlg) throw { step: 16, msg: 'dialog timeout' }; _ps(16);

                    _ss(17); var dialogContent = dlg.querySelector('.ui-dialog-content'); if (!dialogContent) throw { step: 17, msg: 'content missing' };
                    var lateTruck = dialogContent.querySelector('.late-truck-dialog'); if (!lateTruck) throw { step: 17, msg: 'late-truck missing' }; _ps(17);

                    _ss(18); var epochSpans = [], waitStart = Date.now();
                    while (Date.now() - waitStart < 10000) { epochSpans = dlg.querySelectorAll('span[data-epoch-millis]'); if (epochSpans.length > 0) break; await sleep(300); }
                    var allDates = scanAllDatesInDialog(dlg);
                    if (allDates.length === 0 && epochSpans.length > 0) { for (var fb = 0; fb < epochSpans.length; fb++) { var fbE = parseInt(epochSpans[fb].getAttribute('data-epoch-millis'), 10); allDates.push({ epoch: fbE, dateText: epochSpans[fb].textContent.trim(), isPast: !isNaN(fbE) && fbE < Date.now(), timezone: epochSpans[fb].getAttribute('data-timezone') || '' }); } }
                    if (allDates.length === 0) throw { step: 18, msg: 'no dates' };
                    issueFlags.allDates = allDates;
                    var pastDates = allDates.filter(function (d) { return d.isPast; });
                    var futureDates = allDates.filter(function (d) { return !d.isPast; });
                    _ps(18, allDates.length + ' dates, ' + pastDates.length + ' past');

                    _ss(19);
                    if (pastDates.length > 0) {
                        issueFlags.etaPast = true;
                        issueFlags.dateDisplay = pastDates.map(function (d) { return d.dateText; }).join(', ');
                        counts.etapast++;
                        railEtaFromDialog = issueFlags.dateDisplay;
                        _ps(19, '⏰ PAST');
                    } else {
                        railEtaFromDialog = futureDates.length > 0 ? futureDates[futureDates.length - 1].dateText : allDates[allDates.length - 1].dateText;
                        issueFlags.dateDisplay = railEtaFromDialog;
                        issueFlags.fmcEta = railEtaFromDialog;
                        _ps(19, '🚂 ETA: ' + railEtaFromDialog);
                    }

                    _ss(20); var closeBtn2 = dlg.querySelector('.ui-dialog-titlebar-close');
                    if (closeBtn2) { closeBtn2.click(); await sleep(400); _ps(20); }
                    else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); await sleep(400); _ps(20, 'Escape'); }
                } catch (de) { _fs(de.step || 17, de.msg || String(de)); closeDialogs(); await sleep(300); }

                /* ═══ RS CHECK via Script 2 (only if NOT etaPast) ═══ */
                if (!issueFlags.etaPast && railEtaFromDialog) {
                    setMsg(g, '<span class="msg-label msg-label-rail">🚂 RAIL</span> ETA: ' + railEtaFromDialog + '<br><em style="color:#c084fc;">Sending to RS Scanner…</em>');
                    setBadge(g, 'processing', 'RS CHECK…');

                    var rsResult = await requestRSCheck(row, g, vrid, railEtaFromDialog);

                    if (rsResult.updated) {
                        issueFlags.thirdLegUpdated = true;
                        counts.thirdLegUpdated++;
                    } else {
                        issueFlags.railDelay = true;
                        issueFlags.rsVrid = rsResult.rsVrid;
                        issueFlags.rsEta = rsResult.rsEta;
                        counts.rail++;
                    }
                } else if (!issueFlags.etaPast) {
                    issueFlags.railDelay = true;
                    counts.rail++;
                }
            }

            /* ═══ D: FALSE ═══ */
            else { setSS(g, 14, 'fail', '❌ "' + (sTx || raw) + '"'); issueFlags.isFalse = true; issueFlags.falseText = sTx || raw; counts.false++; }

            /* ═══════════════════════════════════════════
               DECIDE: CASE OR NOT
               ═══════════════════════════════════════════ */
            var needCase = issueFlags.multiTrailer || issueFlags.railDelay || issueFlags.etaPast;
            if (issueFlags.thirdLegUpdated && !issueFlags.multiTrailer && !issueFlags.etaPast) needCase = false;

            var caseIdCreated = null, caseTimedOut = false, resultType = '';
            var msgParts = [];

            if (issueFlags.multiTrailer) msgParts.push('<span style="background:#ec4899;color:white;padding:2px 6px;border-radius:4px;">🚛 MULTI x' + issueFlags.trailerCount + '</span>');
            if (issueFlags.thirdLegUpdated && !issueFlags.railDelay) msgParts.push('<span class="msg-label msg-label-updated">🔄 3RD LEG OK</span>');
            if (issueFlags.railDelay) msgParts.push('<span class="msg-label msg-label-rail">🚂 RAIL (NOT updated)</span> ' + issueFlags.dateDisplay + (issueFlags.rsVrid ? ' | RS: ' + issueFlags.rsVrid : ''));
            if (issueFlags.etaPast) msgParts.push('<span class="msg-label msg-label-etapast">⏰ ETA PAST</span> ' + issueFlags.dateDisplay);
            if (issueFlags.pendingInvestigation) msgParts.push('<span class="msg-label msg-label-eta">🕐 NEED ETA</span>');
            if (issueFlags.isFalse) msgParts.push('<span style="color:#ef4444;font-weight:700;">❌ FALSE</span> — "' + issueFlags.falseText + '"');

            if (issueFlags.thirdLegUpdated && !issueFlags.multiTrailer && !issueFlags.etaPast) resultType = '3RD_LEG_UPDATED';
            else if (issueFlags.multiTrailer && issueFlags.etaPast) resultType = 'MULTI_ETA_PAST';
            else if (issueFlags.multiTrailer && issueFlags.railDelay) resultType = 'MULTI_RAIL';
            else if (issueFlags.multiTrailer) resultType = 'MULTI_TRAILER';
            else if (issueFlags.etaPast) resultType = 'ETA_PAST';
            else if (issueFlags.railDelay) resultType = 'RAIL_DELAY';
            else if (issueFlags.pendingInvestigation) resultType = 'NEED_ETA';
            else if (issueFlags.isFalse) resultType = 'FALSE';
            else resultType = 'CORRECT';

            /* CREATE CASE */
            if (needCase) {
                var caseVrid = (issueFlags.railDelay && issueFlags.rsVrid) ? issueFlags.rsVrid : vrid;
                setMsg(g, msgParts.join('<br>') + '<br><em style="color:#c084fc;">Creating case for ' + caseVrid + '…</em>');
                var caseResult = await createFMCCase(exp, g, caseVrid, issueFlags);
                caseIdCreated = caseResult.caseId;
                caseTimedOut = caseResult.timedOut;

                if (caseIdCreated && caseIdCreated !== 'UNKNOWN') {
                    var caseTypeLabel = '';
                    if (issueFlags.multiTrailer && (issueFlags.railDelay || issueFlags.etaPast)) caseTypeLabel = 'Multi + ' + (issueFlags.etaPast ? 'ETA Past' : 'Rail');
                    else if (issueFlags.multiTrailer) caseTypeLabel = 'Multi-Trailer';
                    else if (issueFlags.etaPast) caseTypeLabel = 'ETA Past';
                    else caseTypeLabel = 'Rail Delay';
                    createdCases.push({ vridCode: caseVrid, caseId: caseIdCreated, caseType: caseTypeLabel });
                    updateCaseSummary(); updateCounters();
                    msgParts.push('<span class="msg-label msg-label-case">📋 ' + caseIdCreated + '</span>');
                    setBadge(g, 'case-created', 'CASE ' + caseIdCreated);
                } else if (caseTimedOut) {
                    msgParts.push('<span style="color:#fde68a;">⏱ SKIPPED</span>');
                    setBadge(g, 'timeout', 'TIMEOUT');
                } else {
                    msgParts.push('<span style="color:#ef4444;">❌ CASE FAILED</span>');
                }
            }

            setMsg(g, msgParts.join('<br>'));

            if (!needCase) {
                if (resultType === 'CORRECT') { setBadge(g, 'correct', 'CORRECT'); setResult(g, 'correct'); setMsg(g, '<span style="color:#a78bfa;">✅ CORRECT</span> — ' + vrid); }
                else if (resultType === '3RD_LEG_UPDATED') { setBadge(g, 'updated', '3RD LEG OK'); setResult(g, 'updated'); }
                else if (resultType === 'NEED_ETA') { setBadge(g, 'eta', 'NEED ETA'); setResult(g, 'eta'); }
                else if (resultType === 'FALSE') { setBadge(g, 'false', 'FALSE'); setResult(g, 'false'); }
            } else {
                if (issueFlags.multiTrailer) setResult(g, 'multi');
                else if (issueFlags.etaPast) setResult(g, 'etapast');
                else if (issueFlags.railDelay) setResult(g, 'rail');
            }

            results.push({ index: g, page: currentPage, rowId: row.id, vridCode: vrid, result: resultType, message: msgParts.map(function (p) { return p.replace(/<[^>]*>/g, ''); }).join(' | '), detail: issueFlags.falseText || '', date: issueFlags.dateDisplay || '', caseId: caseIdCreated || '', trailerCount: issueFlags.trailerCount, timedOut: caseTimedOut, rsVrid: issueFlags.rsVrid || '', rsEta: issueFlags.rsEta || '', fmcEta: issueFlags.fmcEta || '', thirdLegUpdated: issueFlags.thirdLegUpdated });

        } catch (err) {
            var errStep = err.step !== undefined ? err.step : 14;
            _fs(errStep, err.msg || err.message || String(err));
            setBadge(g, 'error', 'ERROR'); setResult(g, 'error');
            setMsg(g, '<span style="color:#fde68a;">⚠️ ERROR</span> — ' + vrid + ' — Step ' + errStep + ': ' + (err.msg || String(err)));
            counts.error++;
            results.push({ index: g, page: currentPage, rowId: row.id, vridCode: vrid, result: 'ERROR', message: err.msg || String(err), detail: '', date: '', caseId: '', trailerCount: 0, timedOut: false, rsVrid: '', rsEta: '', fmcEta: '', thirdLegUpdated: false });
            closeDialogs();
        }

        try { var tg = row.querySelector('td.dashboard-details-toggle'); if (tg) { tg.click(); await sleep(Math.max(dl, 300)); } } catch (_) {}
        card.classList.remove('processing'); card.classList.remove('expanded');
        counts.total++; updateSummary(); updateCounters();
    }

    /* ═══════════════════════════════════════════
       PROCESS PAGE
       ═══════════════════════════════════════════ */
    async function processCurrentPage() {
        var rows = getCurrentPageRows(); var n = rows.length;
        $id('pg-vrid-count').textContent = n;
        $id('pg-status').textContent = 'Processing page ' + currentPage; $id('pg-status').style.color = '#c084fc';
        var pi = getPageInfo(); if (pi) { totalPages = pi.pages; $id('cnt-total-pages').textContent = pi.pages; }
        $id('cnt-current-page').textContent = currentPage;
        if (n === 0) return 0;
        addPageSep(currentPage, n);
        var codes = rows.map(function (r) { return extractVridCode(r); });
        var si = globalIndex;
        rows.forEach(function (r, i) { createCard(si + i, codes[i], r.id); initSteps(si + i); });
        for (var i = 0; i < n; i++) {
            if (stopRequested) break;
            var g = si + i;
            await processVrid(rows[i], g, codes[i]);
            globalIndex = g + 1; updateProgress(i + 1, n); updateCounters();
            $id('fmc-results').scrollTop = $id('fmc-results').scrollHeight;
            await sleep(Math.max(getDelay() * 0.2, 50));
        }
        return n;
    }

    /* ═══════════════════════════════════════════
       MAIN SCAN LOOP
       ═══════════════════════════════════════════ */
    async function startFullScan() {
        if (running) return; running = true; stopRequested = false;
        $id('fmc-start').disabled = true; $id('fmc-stop').disabled = false; $id('fmc-export').disabled = true;
        globalIndex = 0; currentPage = 1; results = []; createdCases = [];
        counts = { total: 0, correct: 0, false: 0, error: 0, eta: 0, rail: 0, etapast: 0, multiTrailer: 0, thirdLegUpdated: 0 };
        $id('fmc-results').innerHTML = ''; $id('fmc-case-summary').classList.remove('visible'); $id('fmc-case-list').innerHTML = '';
        updateSummary(); updateCounters();
        /* Clean localStorage RS keys */
        rsClear(RS_REQUEST_KEY); rsClear(RS_RESULT_KEY);

        var pi = getPageInfo();
        if (pi) { totalPages = pi.pages; currentPage = pi.page + 1; $id('cnt-total-pages').textContent = pi.pages; $id('cnt-current-page').textContent = currentPage; }
        var ready = await waitForTableReady(); if (!ready) { finishScan(); return; }

        var cont = true;
        while (cont && !stopRequested) {
            $id('pg-status').textContent = '📄 Page ' + currentPage + '/' + totalPages; $id('pg-status').style.color = '#c084fc';
            var processed = await processCurrentPage();
            if (stopRequested || processed === 0) break;
            if (!hasMorePages()) { cont = false; break; }
            $id('pg-status').textContent = '🔄 Next page…'; $id('pg-status').style.color = '#fde68a';
            $id('fmc-reload-notice').textContent = '🔄 Page ' + (currentPage + 1); $id('fmc-reload-notice').classList.add('visible');
            var nav = await goToNextPage(); $id('fmc-reload-notice').classList.remove('visible');
            if (!nav) break;
            currentPage++;
            var nr = await waitForTableReady(15000); if (!nr) break;
            var np = getPageInfo(); if (np) { totalPages = np.pages; $id('cnt-total-pages').textContent = np.pages; }
            await sleep(500);
        }
        finishScan();
    }

    function finishScan() {
        clearState(); showComplete(); running = false;
        $id('fmc-start').disabled = false; $id('fmc-stop').disabled = true; $id('fmc-export').disabled = false;
        $id('pg-status').textContent = '✅ Done'; $id('pg-status').style.color = '#c084fc';
        rsClear(RS_REQUEST_KEY); rsClear(RS_RESULT_KEY);
    }

    /* ═══════════════════════════════════════════
       CSV EXPORT
       ═══════════════════════════════════════════ */
    function exportCSV() {
        if (!results.length) return;
        var h = 'Index,Page,RowID,VRID,Result,Message,Detail,Date,CaseID,Trailers,TimedOut,RS_VRID,RS_ETA,FMC_ETA,3rdLegOK\n';
        var r = results.map(function (r) { return [r.index + 1, r.page || 1, '"' + r.rowId + '"', '"' + r.vridCode + '"', '"' + r.result + '"', '"' + (r.message || '').replace(/"/g, '""') + '"', '"' + (r.detail || '').replace(/"/g, '""') + '"', '"' + (r.date || '') + '"', '"' + (r.caseId || '') + '"', r.trailerCount || 0, r.timedOut ? 'YES' : 'NO', '"' + (r.rsVrid || '') + '"', '"' + (r.rsEta || '') + '"', '"' + (r.fmcEta || '') + '"', r.thirdLegUpdated ? 'YES' : 'NO'].join(','); }).join('\n');
        var b = new Blob([h + r], { type: 'text/csv' }); var u = URL.createObjectURL(b); var a = document.createElement('a'); a.href = u; a.download = 'fmc_neon_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv'; a.click(); URL.revokeObjectURL(u);
    }

    /* ═══════════════════════════════════════════
       EVENTS
       ═══════════════════════════════════════════ */
    $id('fmc-start').addEventListener('click', startFullScan);
    $id('fmc-stop').addEventListener('click', function () { stopRequested = true; $id('fmc-stop').disabled = true; $id('pg-status').textContent = '⏹ Stopping…'; $id('pg-status').style.color = '#ef4444'; clearState(); });
    $id('fmc-export').addEventListener('click', exportCSV);
    $id('fmc-clear').addEventListener('click', function () {
        if (running) return;
        $id('fmc-results').innerHTML = ''; $id('fmc-case-summary').classList.remove('visible'); $id('fmc-case-list').innerHTML = '';
        results = []; createdCases = [];
        counts = { total: 0, correct: 0, false: 0, error: 0, eta: 0, rail: 0, etapast: 0, multiTrailer: 0, thirdLegUpdated: 0 };
        globalIndex = 0; currentPage = 1; totalPages = 1;
        updateSummary(); updateCounters();
        $id('fmc-progress-bar').style.width = '0%'; $id('fmc-progress-text').textContent = 'Ready — Click Start';
        $id('pg-status').textContent = 'Ready'; $id('pg-status').style.color = '#c084fc';
        $id('pg-vrid-count').textContent = '—'; $id('cnt-current-page').textContent = '1'; $id('cnt-total-pages').textContent = '?'; $id('cnt-3rd-updated').textContent = '0';
        rsClear(RS_REQUEST_KEY); rsClear(RS_RESULT_KEY); clearState();
    });

    /* AUTO-INIT */
    (async function () {
        await sleep(2000);
        var pi = getPageInfo();
        if (pi) { totalPages = pi.pages; currentPage = pi.page + 1; $id('cnt-total-pages').textContent = pi.pages; $id('cnt-current-page').textContent = currentPage; }
    })();

})();


