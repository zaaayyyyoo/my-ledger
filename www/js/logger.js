(() => {
  'use strict';

  const STORAGE_KEY = 'daily_ledger_logs_v1';
  const MAX_ENTRIES = 500;
  const VERSION = '2.1.0-logging';

  function safeRead() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function safeWrite(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch (_) {
      // 日志不能影响记账主流程
    }
  }

  function normalize(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }

  function add(level, message, context) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message: normalize(message).slice(0, 4000),
      context: context ? normalize(context).slice(0, 4000) : ''
    };
    const entries = safeRead();
    entries.push(entry);
    safeWrite(entries);
    return entry;
  }

  const logger = {
    debug: (message, context) => add('DEBUG', message, context),
    info: (message, context) => add('INFO', message, context),
    warn: (message, context) => add('WARN', message, context),
    error: (message, context) => add('ERROR', message, context),
    getEntries: safeRead,
    clear: () => safeWrite([]),
    exportText() {
      const entries = safeRead();
      const lines = [
        'Daily Ledger 日志',
        `版本: ${VERSION}`,
        `平台: ${navigator.userAgent}`,
        `屏幕: ${window.screen?.width || 0}x${window.screen?.height || 0}`,
        `时间: ${new Date().toLocaleString('zh-CN')}`,
        `日志数量: ${entries.length}`,
        '',
        ...entries.map((e) => `[${e.ts}] [${e.level}] ${e.message}${e.context ? ` | ${e.context}` : ''}`)
      ];
      return lines.join('\n');
    }
  };

  window.LedgerLogger = logger;

  // 捕获不会影响业务的数据级错误。
  window.addEventListener('error', (event) => {
    logger.error(event.error || event.message || 'Window error', {
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled Promise rejection', event.reason);
  });

  window.addEventListener('online', () => logger.info('网络状态: online'));
  window.addEventListener('offline', () => logger.warn('网络状态: offline'));

  // 保留原 console 行为，同时把 warn/error 收进应用日志。
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  console.warn = (...args) => {
    originalWarn(...args);
    logger.warn(args.map(normalize).join(' '));
  };
  console.error = (...args) => {
    originalError(...args);
    logger.error(args.map(normalize).join(' '));
  };

  function escapeHtml(text) {
    return String(text).replace(/[&<>\"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  }

  function createUI() {
    if (document.getElementById('ledgerLogButton')) return;

    const style = document.createElement('style');
    style.id = 'ledgerLoggerStyle';
    style.textContent = `
      #ledgerLogButton {
        position: fixed; right: max(12px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom));
        z-index: 2147482000; border: 1px solid rgba(255,255,255,.16); background: rgba(21,24,36,.94);
        color: #cbd5e1; border-radius: 999px; padding: 9px 13px; font-size: 13px; box-shadow: 0 6px 22px rgba(0,0,0,.28);
      }
      #ledgerLogModal { position: fixed; inset: 0; z-index: 2147483001; display:none; background:rgba(0,0,0,.68); padding: max(18px,env(safe-area-inset-top)) 14px max(18px,env(safe-area-inset-bottom)); }
      #ledgerLogModal.show { display:flex; align-items:center; justify-content:center; }
      .ledger-log-panel { width:min(680px,100%); max-height:calc(100dvh - 36px); overflow:hidden; background:#151824; border:1px solid #2e354d; border-radius:18px; display:flex; flex-direction:column; color:#f3f4f6; }
      .ledger-log-head { display:flex; align-items:center; justify-content:space-between; padding:15px 16px; border-bottom:1px solid #2e354d; }
      .ledger-log-title { font-weight:700; }
      .ledger-log-list { overflow:auto; padding:10px; min-height:180px; }
      .ledger-log-item { padding:9px 10px; border-bottom:1px solid rgba(255,255,255,.06); font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-word; }
      .ledger-log-time { color:#94a3b8; }
      .ledger-log-error { color:#fca5a5; } .ledger-log-warn { color:#fcd34d; } .ledger-log-info { color:#a5b4fc; }
      .ledger-log-actions { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:12px; border-top:1px solid #2e354d; }
      .ledger-log-actions button { min-height:40px; border:1px solid #2e354d; border-radius:10px; background:#0e111a; color:#e5e7eb; }
      .ledger-log-actions .primary { background:#6366f1; border-color:#6366f1; color:#fff; }
      @media(max-width:420px){ .ledger-log-actions{grid-template-columns:1fr 1fr;} }
    `;
    document.head.appendChild(style);

    const button = document.createElement('button');
    button.id = 'ledgerLogButton';
    button.type = 'button';
    button.textContent = '日志';

    const modal = document.createElement('div');
    modal.id = 'ledgerLogModal';
    modal.innerHTML = `
      <div class="ledger-log-panel" role="dialog" aria-label="应用日志">
        <div class="ledger-log-head"><span class="ledger-log-title">应用日志</span><span id="ledgerLogCount">0 条</span></div>
        <div class="ledger-log-list" id="ledgerLogList"></div>
        <div class="ledger-log-actions">
          <button type="button" id="ledgerLogShare" class="primary">分享日志</button>
          <button type="button" id="ledgerLogCopy">复制</button>
          <button type="button" id="ledgerLogClear">清空</button>
          <button type="button" id="ledgerLogClose">关闭</button>
        </div>
      </div>`;

    document.body.appendChild(button);
    document.body.appendChild(modal);

    const list = document.getElementById('ledgerLogList');
    const count = document.getElementById('ledgerLogCount');

    function refresh() {
      const entries = safeRead();
      count.textContent = `${entries.length} 条`;
      list.innerHTML = entries.length ? entries.slice().reverse().map((e) => {
        const cls = e.level === 'ERROR' ? 'ledger-log-error' : e.level === 'WARN' ? 'ledger-log-warn' : 'ledger-log-info';
        return `<div class="ledger-log-item ${cls}"><span class="ledger-log-time">${escapeHtml(new Date(e.ts).toLocaleString('zh-CN'))}</span> [${escapeHtml(e.level)}] ${escapeHtml(e.message)}${e.context ? ` | ${escapeHtml(e.context)}` : ''}</div>`;
      }).join('') : '<div class="ledger-log-item">暂无日志</div>';
    }

    async function shareLogs() {
      const text = logger.exportText();
      try {
        const nativeShare = window.Capacitor?.Plugins?.Share;
        if (nativeShare?.share) {
          await nativeShare.share({ title: 'Daily Ledger 日志', text, dialogTitle: '分享日志' });
          logger.info('日志已通过原生分享面板发起分享');
          return;
        }
        if (navigator.share) {
          await navigator.share({ title: 'Daily Ledger 日志', text });
          logger.info('日志已通过系统分享面板发起分享');
          return;
        }
        await navigator.clipboard?.writeText(text);
        alert('当前系统不支持直接分享，日志已复制到剪贴板。');
      } catch (error) {
        if (error?.name !== 'AbortError') {
          logger.error('分享日志失败', error);
          alert('分享日志失败，已尝试复制日志。');
          try { await navigator.clipboard.writeText(text); } catch (_) {}
        }
      }
    }

    button.addEventListener('click', () => { refresh(); modal.classList.add('show'); });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    document.getElementById('ledgerLogClose').addEventListener('click', () => modal.classList.remove('show'));
    document.getElementById('ledgerLogShare').addEventListener('click', shareLogs);
    document.getElementById('ledgerLogCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(logger.exportText()); alert('日志已复制'); } catch (_) { alert('复制失败'); }
    });
    document.getElementById('ledgerLogClear').addEventListener('click', () => {
      logger.clear(); refresh();
    });

    logger.info('日志系统已启动', { version: VERSION });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createUI, { once: true });
  else createUI();
})();
