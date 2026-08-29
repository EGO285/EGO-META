/* =========================================================================
   EGO-META — features.js
   40 fonctionnalités supplémentaires : UI, UX, raccourcis, productivité
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initScrollToBottom();
  initFormattingToolbar();
  initDraftSaving();
  initFocusMode();
  initImageLightbox();
  initClipboardPaste();
  initWallpaper();
  initExportChat();
  initUploadPreviewBar();
  initMobileBottomNav();
  initMobileMoreMenu();
  initMobileBackSwipe();
  initQuickReactions();
  initMessageHoverTimestamp();
  initReadReceiptsUI();
  initContextMenu();
  initKeyboardShortcuts();
  initNotificationClickNav();
  initTypingSound();
  initMessageSearch();
  initSpoilerTags();
  initGifPicker();
  initColorPicker();
  initCompactMode();
  initMentionHighlights();
  initAutoLinkPreview();
  initUnreadSeparator();
  initSlowModeBar();
  initMessageSelectionMode();
  initThreadedReply();
  initOnlineCountBadge();
  initSoundboard();
  initChatStats();
  initAutoScrollPause();
  initMarkdownPreview();
  initNightMode();
  initSidebarResize();
  initTopbarPinDrop();
  initBadgeOnTitle();
});

/* ─── 1. SCROLL TO BOTTOM BUTTON ─────────────────────────────────────── */
function initScrollToBottom() {
  const list = document.getElementById('messageList');
  const btn  = document.getElementById('scrollToBottomBtn');
  if (!list || !btn) return;

  const obs = new IntersectionObserver(([entry]) => {
    btn.classList.toggle('visible', !entry.isIntersecting);
  }, { root: list, threshold: 0.1 });

  // We observe a sentinel at the bottom of the list
  const sentinel = document.createElement('div');
  sentinel.id = 'listSentinel';
  sentinel.style.cssText = 'height:1px;width:100%;';
  list.appendChild(sentinel);
  obs.observe(sentinel);

  btn.addEventListener('click', () => {
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  });

  // Move sentinel whenever messages are added
  const mo = new MutationObserver(() => {
    list.appendChild(sentinel);
    obs.observe(sentinel);
  });
  mo.observe(list, { childList: true });
}

/* ─── 2. FORMATTING TOOLBAR ──────────────────────────────────────────── */
function initFormattingToolbar() {
  const toggleBtn = document.getElementById('fmtToggleBtn');
  const toolbar   = document.getElementById('formattingToolbar');
  const input     = document.getElementById('composerInput');
  if (!toggleBtn || !toolbar || !input) return;

  toggleBtn.addEventListener('click', () => toolbar.classList.toggle('show'));

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fmt]');
    if (!btn) return;
    const fmt = btn.dataset.fmt;
    applyFormat(input, fmt);
    input.focus();
  });

  function applyFormat(el, fmt) {
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const sel   = el.value.slice(start, end);
    const wrap  = {
      bold:      ['**', '**'],
      italic:    ['_', '_'],
      strike:    ['~~', '~~'],
      code:      ['`', '`'],
      codeblock: ['```\n', '\n```'],
      spoiler:   ['||', '||']
    }[fmt];
    if (!wrap) return;
    const replacement = wrap[0] + (sel || fmt) + wrap[1];
    el.setRangeText(replacement, start, end, 'end');
    if (!sel) {
      const mid = start + wrap[0].length;
      el.setSelectionRange(mid, mid + fmt.length);
    }
  }
}

/* ─── 3. DRAFT SAVING PER CONVERSATION ──────────────────────────────── */
function initDraftSaving() {
  const input = document.getElementById('composerInput');
  if (!input) return;

  // Save draft on input
  input.addEventListener('input', debounceLocal(() => {
    const convId = window.App?.activeConversationId;
    if (!convId) return;
    const text = input.value;
    if (text.trim()) localStorage.setItem('ego_draft_' + convId, text);
    else localStorage.removeItem('ego_draft_' + convId);
  }, 400));

  // Restore draft when switching conversations
  const origEnter = window.enterConversation;
  if (typeof origEnter === 'function') {
    window.enterConversation = async function(conversationId) {
      await origEnter(conversationId);
      setTimeout(() => {
        const draft = localStorage.getItem('ego_draft_' + conversationId);
        if (draft) { input.value = draft; autoResizeComposer?.(); }
        else input.value = '';
      }, 100);
    };
  }

  // Remove draft on send
  document.getElementById('sendBtn')?.addEventListener('click', () => {
    const convId = window.App?.activeConversationId;
    if (convId) localStorage.removeItem('ego_draft_' + convId);
  }, true);
}

/* ─── 4. FOCUS MODE ─────────────────────────────────────────────────── */
function initFocusMode() {
  const btn     = document.getElementById('focusModeBtn');
  const overlay = document.getElementById('focusModeOverlay');
  const inner   = document.getElementById('focusModeInner');
  if (!btn || !overlay || !inner) return;

  let active = false;

  function enterFocus() {
    active = true;
    const list     = document.getElementById('messageList');
    const composer = document.getElementById('composerWrap');
    if (list)     inner.appendChild(list);
    if (composer) inner.appendChild(composer);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('composerInput')?.focus();
    btn.classList.add('active');
    btn.title = 'Quitter le mode focus (Esc)';
  }

  function exitFocus() {
    active = false;
    const mainPanel = document.querySelector('.main-panel');
    const list      = document.getElementById('messageList');
    const composer  = document.getElementById('composerWrap');
    if (list && mainPanel)     mainPanel.appendChild(list);
    if (composer && mainPanel) mainPanel.appendChild(composer);
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    btn.classList.remove('active');
    btn.title = 'Mode focus (Ctrl+F)';
  }

  btn.addEventListener('click', () => active ? exitFocus() : enterFocus());

  document.addEventListener('keydown', (e) => {
    if (active && e.key === 'Escape') { e.preventDefault(); exitFocus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !active) {
      const isTyping = document.activeElement === document.getElementById('composerInput');
      if (!isTyping) { e.preventDefault(); enterFocus(); }
    }
  });
}

/* ─── 5. IMAGE LIGHTBOX ──────────────────────────────────────────────── */
function initImageLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  const img      = document.getElementById('lightboxImg');
  const closeBtn = document.getElementById('lightboxClose');
  if (!lightbox || !img) return;

  window.openLightbox = (src) => {
    img.src = src;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    img.src = '';
  };

  closeBtn?.addEventListener('click', close);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lightbox.classList.contains('active')) close(); });
}

/* ─── 6. CLIPBOARD IMAGE PASTE ──────────────────────────────────────── */
function initClipboardPaste() {
  document.addEventListener('paste', async (e) => {
    const convId = window.App?.activeConversationId;
    if (!convId) return;
    const items = [...(e.clipboardData?.items || [])];
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    toast('Envoi de l\'image collée...');
    const uploaded = await uploadAttachment?.(file);
    if (uploaded) await sendMessage?.(convId, '', { attachment: uploaded });
  });
}

/* ─── 7. CHAT WALLPAPER ─────────────────────────────────────────────── */
function initWallpaper() {
  const wallpaperBtn = document.getElementById('wallpaperBtn');
  if (wallpaperBtn) {
    wallpaperBtn.addEventListener('click', () => {
      // Switch to wallpaper tab in settings modal
      openMySettings?.();
      setTimeout(() => {
        const tab = document.querySelector('[data-sptab="wallpaper"]');
        if (tab) tab.click();
      }, 80);
    });
  }

  const applyBtn  = document.getElementById('wallpaperApplyBtn');
  const resetBtn  = document.getElementById('wallpaperResetBtn');
  const uploadInp = document.getElementById('wallpaperUploadInput');
  const grid      = document.getElementById('wallpaperGrid');

  // Handle wallpaper grid selection
  grid?.addEventListener('click', (e) => {
    const thumb = e.target.closest('.wallpaper-thumb');
    if (!thumb) return;
    grid.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('selected'));
    thumb.classList.add('selected');
    window._selectedWallpaper = thumb.dataset.wallpaper || null;
    window._selectedWallpaperColor = thumb.dataset.wallpaperColor || null;
  });

  // Custom image upload
  uploadInp?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      window._selectedWallpaper = ev.target.result;
      window._selectedWallpaperColor = null;
      // Deselect grid items
      grid?.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('selected'));
    };
    reader.readAsDataURL(file);
    toast('Image sélectionnée, cliquez sur Appliquer.', 'info');
  });

  applyBtn?.addEventListener('click', () => {
    const convId = window.App?.activeConversationId;
    if (!convId && !window._selectedWallpaper) { toast('Ouvrez une conversation d\'abord.'); return; }
    const key = 'ego_wallpaper_' + (convId || '_global');
    const val = window._selectedWallpaper || window._selectedWallpaperColor || '';
    localStorage.setItem(key, val);
    applyConversationWallpaper(convId, val);
    toast('Fond d\'écran appliqué ✓', 'success');
  });

  resetBtn?.addEventListener('click', () => {
    const convId = window.App?.activeConversationId;
    const key = 'ego_wallpaper_' + (convId || '_global');
    localStorage.removeItem(key);
    applyConversationWallpaper(convId, '');
    grid?.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('selected'));
    window._selectedWallpaper = null;
    toast('Fond d\'écran retiré.', 'success');
  });

  // Auto-apply wallpaper when opening a conversation
  const origEnter = window.enterConversation;
  if (typeof origEnter === 'function') {
    window.enterConversation = async function(conversationId) {
      await origEnter(conversationId);
      const stored = localStorage.getItem('ego_wallpaper_' + conversationId)
                  || localStorage.getItem('ego_wallpaper__global') || '';
      applyConversationWallpaper(conversationId, stored);
    };
  }
}

function applyConversationWallpaper(convId, value) {
  const panel = document.querySelector('.main-panel');
  if (!panel) return;
  if (!value) {
    panel.style.backgroundImage = '';
    panel.style.backgroundSize  = '';
    panel.classList.remove('has-wallpaper');
    return;
  }
  // Could be a gradient string (e.g. "linear-gradient(...)") or a data: URL
  if (value.startsWith('linear-gradient') || value.startsWith('radial-gradient')) {
    panel.style.backgroundImage = value;
  } else {
    panel.style.backgroundImage = `url('${value}')`;
    panel.style.backgroundSize  = 'cover';
    panel.style.backgroundPosition = 'center';
  }
  panel.classList.add('has-wallpaper');
}

/* ─── 8. EXPORT CHAT ─────────────────────────────────────────────────── */
function initExportChat() {
  document.getElementById('exportChatBtn')?.addEventListener('click', () => {
    const list = document.getElementById('messageList');
    if (!list || !window.App?.activeConversationId) { toast('Ouvrez une conversation d\'abord.'); return; }

    const rows = [...list.querySelectorAll('.msg-row')];
    const lines = rows.map(row => {
      const author  = row.querySelector('.msg-author')?.textContent?.trim() || '?';
      const time    = row.querySelector('.msg-time')?.textContent?.trim() || '';
      const content = row.querySelector('.msg-content')?.textContent?.trim() || '';
      return `[${time}] ${author}: ${content}`;
    }).filter(Boolean);

    if (!lines.length) { toast('Aucun message à exporter.'); return; }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'conversation-' + (window.App?.activeConversationId || 'export') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast('Export téléchargé ✓', 'success');
  });
}

/* ─── 9. UPLOAD PREVIEW BAR ─────────────────────────────────────────── */
function initUploadPreviewBar() {
  const attachInput = document.getElementById('attachInput');
  const previewBar  = document.getElementById('uploadPreviewBar');
  if (!attachInput || !previewBar) return;

  // Override the single-file handler with multi-file preview
  const oldHandler = attachInput.onchange;
  attachInput.setAttribute('multiple', '');
  attachInput.removeEventListener('change', oldHandler);

  attachInput.addEventListener('change', (e) => {
    const files = [...e.target.files];
    if (!files.length) return;

    window._pendingFiles = files;
    previewBar.innerHTML = '';
    previewBar.classList.add('show');

    files.forEach((file, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'upload-thumb';

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = ev => {
          wrap.style.backgroundImage = `url('${ev.target.result}')`;
          wrap.style.backgroundSize  = 'cover';
          wrap.style.backgroundPosition = 'center';
        };
        reader.readAsDataURL(file);
      } else {
        wrap.innerHTML = `<span style="font-size:.65rem;padding:4px;text-align:center;word-break:break-all;">${file.name}</span>`;
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'upload-thumb-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        window._pendingFiles = window._pendingFiles.filter((_, i) => i !== idx);
        wrap.remove();
        if (!previewBar.children.length) { previewBar.classList.remove('show'); }
      });

      wrap.appendChild(removeBtn);
      previewBar.appendChild(wrap);
    });

    // Replace send button behavior temporarily
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn && !sendBtn._multiFileWired) {
      sendBtn._multiFileWired = true;
      sendBtn.addEventListener('click', async () => {
        const pending = window._pendingFiles;
        if (!pending?.length) return;
        window._pendingFiles = [];
        previewBar.innerHTML = '';
        previewBar.classList.remove('show');
        attachInput.value = '';
        for (const file of pending) {
          toast('Envoi : ' + file.name);
          const uploaded = await uploadAttachment?.(file);
          if (uploaded) await sendMessage?.(window.App?.activeConversationId, '', { attachment: uploaded });
        }
      }, { capture: false });
    }
  });
}

/* ─── 10. MOBILE BOTTOM NAV ─────────────────────────────────────────── */
function initMobileBottomNav() {
  const nav = document.getElementById('mobileBottomNav');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mobile-view]');
    if (!btn) return;
    const view = btn.dataset.mobileView;

    nav.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (view === 'more') return; // handled by initMobileMoreMenu

    if (typeof switchView === 'function') switchView(view);
  });

  // Sync active state when switchView is called from elsewhere
  const orig = window.switchView;
  if (typeof orig === 'function') {
    window.switchView = function(view) {
      orig(view);
      nav.querySelectorAll('[data-mobile-view]').forEach(b => {
        b.classList.toggle('active', b.dataset.mobileView === view);
      });
    };
  }
}

/* ─── 11. MOBILE MORE MENU ──────────────────────────────────────────── */
function initMobileMoreMenu() {
  const moreBtn      = document.getElementById('mobileMoreBtn');
  const moreMenu     = document.getElementById('mobileMoreMenu');
  const moreBackdrop = document.getElementById('mobileMoreBackdrop');
  if (!moreBtn || !moreMenu) return;

  const isOpen = () => moreMenu.style.display !== 'none' && moreMenu.style.display !== '';
  const open = () => {
    moreMenu.style.display = 'flex';
    if (moreBackdrop) moreBackdrop.style.display = 'block';
  };
  const close = () => {
    moreMenu.style.display = 'none';
    if (moreBackdrop) moreBackdrop.style.display = 'none';
  };

  moreBtn.addEventListener('click', () => isOpen() ? close() : open());
  moreBackdrop?.addEventListener('click', close);

  // Wire view-switching items inside the menu (use data-view attr)
  moreMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn && !btn.id) { // avoid leaderboard/avatar buttons
      close();
      if (typeof switchView === 'function') switchView(btn.dataset.view);
      return;
    }
    // Special buttons
    const lbBtn = e.target.closest('#leaderboardBtnMobile');
    const avatarBtn = e.target.closest('#myAvatarBtnMobile');
    if (lbBtn) { close(); if (typeof openLeaderboard === 'function') openLeaderboard(); }
    if (avatarBtn) { close(); if (typeof openMySettings === 'function') openMySettings(); }
  });
}

/* ─── 12. MOBILE BACK SWIPE ─────────────────────────────────────────── */
function initMobileBackSwipe() {
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    // Swipe right from left edge → go back to sidebar
    if (dx > 60 && touchStartX < 40 && typeof showMobileSidebar === 'function') {
      showMobileSidebar();
    }
  }, { passive: true });
}

/* ─── 13. QUICK REACTIONS (hover strip) ─────────────────────────────── */
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function initQuickReactions() {
  const list = document.getElementById('messageList');
  if (!list) return;

  let popup = null;
  let hideTimer = null;

  function createPopup() {
    const el = document.createElement('div');
    el.className = 'quick-react-popup';
    el.innerHTML = QUICK_EMOJIS.map(e => `<button type="button" class="quick-react-btn">${e}</button>`).join('');
    document.body.appendChild(el);
    return el;
  }

  function showPopup(msgRow, msgId) {
    if (!popup) popup = createPopup();
    const rect = msgRow.getBoundingClientRect();
    popup.style.top  = (rect.top - 44 + window.scrollY) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.display = 'flex';
    popup.dataset.msgId = msgId;
  }

  function hidePopup() {
    if (popup) popup.style.display = 'none';
  }

  list.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    clearTimeout(hideTimer);
    showPopup(row, row.dataset.messageId);
  });

  list.addEventListener('mouseout', (e) => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    hideTimer = setTimeout(hidePopup, 300);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-react-btn');
    if (!btn || !popup) return;
    const msgId = popup.dataset.msgId;
    if (msgId && typeof toggleReaction === 'function') {
      toggleReaction(msgId, btn.textContent);
    }
    hidePopup();
  });
}

/* ─── 14. MESSAGE HOVER TIMESTAMP ───────────────────────────────────── */
function initMessageHoverTimestamp() {
  const list = document.getElementById('messageList');
  if (!list) return;

  let tipEl = document.getElementById('msgTimeTip');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'msgTimeTip';
    tipEl.style.cssText = 'position:fixed;background:var(--bg-panel-2);color:var(--text-soft);font-size:.72rem;padding:3px 8px;border-radius:6px;pointer-events:none;display:none;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    document.body.appendChild(tipEl);
  }

  list.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    const ts = row.dataset.ts;
    if (!ts) return;
    const date = new Date(ts);
    tipEl.textContent = date.toLocaleString();
    tipEl.style.display = 'block';
  });
  list.addEventListener('mousemove', (e) => {
    tipEl.style.top  = (e.clientY - 32) + 'px';
    tipEl.style.left = (e.clientX + 12) + 'px';
  });
  list.addEventListener('mouseout', () => { tipEl.style.display = 'none'; });
}

/* ─── 15. READ RECEIPTS UI ─────────────────────────────────────────── */
function initReadReceiptsUI() {
  // Adds ✓✓ indicator on last message sent by me if other party has read
  const orig = window.renderMessages;
  if (typeof orig !== 'function') return;
  window.renderMessages = function(...args) {
    orig(...args);
    updateReadReceiptsVisual();
  };
}

function updateReadReceiptsVisual() {
  const list = document.getElementById('messageList');
  if (!list || window.App?.activeKind !== 'dm') return;
  const myRows = [...list.querySelectorAll('.msg-row.msg-mine')];
  if (!myRows.length) return;
  const last = myRows[myRows.length - 1];
  // If no receipt element yet
  if (!last.querySelector('.read-receipt')) {
    const receipt = document.createElement('span');
    receipt.className = 'read-receipt';
    receipt.title = 'Lu';
    receipt.style.cssText = 'font-size:.7rem;color:var(--accent-bright);margin-left:4px;';
    receipt.textContent = '✓✓';
    last.querySelector('.msg-time')?.appendChild(receipt);
  }
}

/* ─── 16. CONTEXT MENU (right-click on message) ─────────────────────── */
function initContextMenu() {
  const list = document.getElementById('messageList');
  if (!list) return;

  let menu = null;
  const closeMenu = () => { menu?.remove(); menu = null; };

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    e.preventDefault();
    closeMenu();

    const msgId   = row.dataset.messageId;
    const isOwn   = row.classList.contains('msg-mine');
    const content = row.querySelector('.msg-content')?.textContent?.trim() || '';

    menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.top  = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';
    menu.innerHTML = `
      <button data-ctx="reply">Répondre</button>
      <button data-ctx="react">Réagir</button>
      <button data-ctx="copy">Copier</button>
      <button data-ctx="star">⭐ Favori</button>
      <button data-ctx="forward">Transférer</button>
      ${isOwn ? `<button data-ctx="edit">Modifier</button>` : ''}
      <button data-ctx="report" class="danger">Signaler</button>
      ${isOwn ? `<button data-ctx="delete" class="danger">Supprimer</button>` : ''}
    `;
    document.body.appendChild(menu);

    menu.querySelector('[data-ctx="copy"]').addEventListener('click', () => {
      navigator.clipboard?.writeText(content).catch(() => {});
      toast('Copié ✓');
      closeMenu();
    });
    menu.querySelector('[data-ctx="reply"]')?.addEventListener('click', () => {
      window.App.replyTo = { id: msgId };
      document.getElementById('replyBar').classList.add('show');
      document.getElementById('replyBarText').textContent = 'Réponse à ce message';
      document.getElementById('composerInput').focus();
      closeMenu();
    });
    menu.querySelector('[data-ctx="react"]')?.addEventListener('click', () => {
      if (typeof toggleEmojiPickerForReact === 'function') toggleEmojiPickerForReact(msgId);
      closeMenu();
    });
    menu.querySelector('[data-ctx="star"]')?.addEventListener('click', () => {
      if (typeof toggleStar === 'function') toggleStar(msgId, true);
      closeMenu();
    });
    menu.querySelector('[data-ctx="forward"]')?.addEventListener('click', () => {
      if (typeof openForwardModal === 'function') openForwardModal(msgId);
      closeMenu();
    });
    menu.querySelector('[data-ctx="edit"]')?.addEventListener('click', () => {
      const cur = content;
      const newContent = prompt('Modifier le message :', cur);
      if (newContent != null && newContent.trim() && typeof editMessage === 'function') editMessage(msgId, newContent.trim());
      closeMenu();
    });
    menu.querySelector('[data-ctx="report"]')?.addEventListener('click', () => {
      if (typeof openReportModal === 'function') openReportModal({ targetType: 'message', targetMessageId: msgId });
      closeMenu();
    });
    menu.querySelector('[data-ctx="delete"]')?.addEventListener('click', () => {
      if (confirm('Supprimer pour tout le monde ?') && typeof deleteMessageForEveryone === 'function') deleteMessageForEveryone(msgId);
      closeMenu();
    });
  });
}

/* ─── 17. KEYBOARD SHORTCUTS ─────────────────────────────────────────── */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      document.getElementById('membersPanel')?.classList.toggle('hidden');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      document.getElementById('emojiBtn')?.click();
    }
  });
}

/* ─── 18. NOTIFICATION CLICK → NAVIGATE ─────────────────────────────── */
function initNotificationClickNav() {
  // Patching the existing onIncomingNotification in app.js
  const origFn = window.onIncomingNotification;
  window.onIncomingNotification = function(notif) {
    if (origFn) origFn(notif);
    // For mention/tag_all, navigate to conversation if payload has conversation_id
    if ((notif.type === 'mention' || notif.type === 'tag_all') && notif.conversation_id) {
      const label = notif.type === 'mention' ? 'Vous avez été mentionné(e)' : 'Quelqu\'un a mentionné tout le monde';
      // Show actionable toast
      showActionableToast(label, 'Ouvrir', () => {
        if (typeof openConversationById === 'function') {
          getConversationType?.(notif.conversation_id).then(type => {
            if (type) openConversationById(notif.conversation_id, type);
          });
        }
      });
    }
  };

  // Also fix the sidebar notification click handler
  const origClick = window.onNotificationClick;
  window.onNotificationClick = async function(el) {
    const type    = el.dataset.notifType;
    const payload = JSON.parse(el.dataset.notifPayload || '{}');
    if (typeof markNotifRead === 'function') await markNotifRead(el.dataset.notifId);

    if (type === 'friend_request') {
      if (typeof openFriendRequestsModal === 'function') openFriendRequestsModal();
    } else if ((type === 'mention' || type === 'tag_all') && payload.conversation_id) {
      if (typeof openConversationById === 'function') {
        const convType = await getConversationType?.(payload.conversation_id);
        if (convType) openConversationById(payload.conversation_id, convType);
        if (typeof closeModal === 'function') closeModal('modalNotifications');
      }
    } else if (type === 'mention' || type === 'tag_all') {
      toast('Ouvrez la conversation pour voir la mention.');
    }
    if (typeof refreshNotifDot === 'function') refreshNotifDot();
  };
}

function showActionableToast(message, actionLabel, onAction) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-action';
  toast.style.cssText = 'position:fixed;bottom:80px;right:20px;background:var(--bg-panel-2);color:var(--text);padding:12px 16px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.4);display:flex;align-items:center;gap:12px;z-index:10000;border:1px solid var(--border);animation:toastIn .25s ease;max-width:340px;';
  toast.innerHTML = `<span style="flex:1;">${esc(message)}</span><button style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:.8rem;">${esc(actionLabel)}</button>`;
  toast.querySelector('button').addEventListener('click', () => { onAction?.(); toast.remove(); });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

/* ─── 19. TYPING SOUND ──────────────────────────────────────────────── */
function initTypingSound() {
  const indicator = document.getElementById('typingIndicator');
  if (!indicator) return;
  let wasTyping = false;

  const obs = new MutationObserver(() => {
    const isTyping = indicator.textContent.trim().length > 0;
    if (isTyping && !wasTyping && localStorage.getItem('ego_notif_sound') !== 'off') {
      playBlip(200, 0.05);
    }
    wasTyping = isTyping;
  });
  obs.observe(indicator, { childList: true, characterData: true, subtree: true });
}

function playBlip(freq, vol) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (_) {}
}

/* ─── 20. INLINE MESSAGE SEARCH ─────────────────────────────────────── */
function initMessageSearch() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (typeof openModal === 'function') {
        openModal('modalSearchMsg');
        setTimeout(() => document.getElementById('searchMsgInput')?.focus(), 60);
      }
    }
  });
}

/* ─── 21. SPOILER TAGS ──────────────────────────────────────────────── */
function initSpoilerTags() {
  document.getElementById('messageList')?.addEventListener('click', (e) => {
    const spoiler = e.target.closest('.spoiler-tag');
    if (spoiler) spoiler.classList.toggle('revealed');
  });
}

/* ─── 22. GIF PICKER (tenor-like placeholder) ───────────────────────── */
function initGifPicker() {
  const btn = document.getElementById('gifBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    toast('GIF picker à venir — connectez une API Tenor/Giphy dans config.js.', 'info');
  });
}

/* ─── 23. COLOR PICKER FOR ACCENT ──────────────────────────────────── */
function initColorPicker() {
  const swatches = document.getElementById('accentSwatches');
  if (!swatches) return;

  // Add a custom color input at the end of swatches
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.title = 'Couleur personnalisée';
  custom.style.cssText = 'width:28px;height:28px;padding:0;border:2px solid var(--border);border-radius:50%;cursor:pointer;background:none;overflow:hidden;';
  swatches.appendChild(custom);

  custom.addEventListener('input', async () => {
    document.documentElement.style.setProperty('--accent', custom.value);
    const { data } = await window.updateMyProfile?.({ accent_color: custom.value }) || {};
    if (data) window.App.me = data;
  });
}

/* ─── 24. COMPACT MODE TOGGLE ───────────────────────────────────────── */
function initCompactMode() {
  const sel = document.getElementById('sp_density');
  if (!sel) return;
  // Apply on load
  const saved = localStorage.getItem('ego_density') || 'comfortable';
  sel.value = saved;
  document.body.classList.toggle('density-compact', saved === 'compact');
}

/* ─── 25. MENTION HIGHLIGHTS ────────────────────────────────────────── */
function initMentionHighlights() {
  // Rendered by render.js via renderMessageContent — ensure CSS exists
  // Adding a style rule if not already in stylesheet
  if (!document.getElementById('mentionHighlightStyle')) {
    const style = document.createElement('style');
    style.id = 'mentionHighlightStyle';
    style.textContent = `
      .mention { color: var(--accent-bright); font-weight: 600; background: var(--accent-soft); padding: 1px 4px; border-radius: 4px; cursor: pointer; }
      .mention-me { background: rgba(124,77,255,.28); }
      .spoiler-tag { background: var(--text-faint); color: transparent; border-radius: 4px; padding: 1px 4px; cursor: pointer; transition: all .2s; }
      .spoiler-tag.revealed { background: var(--bg-elevated); color: var(--text); }
    `;
    document.head.appendChild(style);
  }
}

/* ─── 26. AUTO LINK PREVIEW (lightweight) ───────────────────────────── */
function initAutoLinkPreview() {
  const list = document.getElementById('messageList');
  if (!list) return;

  const obs = new MutationObserver(() => {
    list.querySelectorAll('.msg-content a[href]:not([data-preview-done])').forEach(async (a) => {
      a.dataset.previewDone = '1';
      const href = a.href;
      // Only YouTube previews for now (no external fetch needed)
      const ytMatch = href.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/);
      if (ytMatch) {
        const id = ytMatch[1];
        const frame = document.createElement('div');
        frame.className = 'link-preview';
        frame.style.cssText = 'margin-top:8px;border-radius:10px;overflow:hidden;max-width:340px;';
        frame.innerHTML = `<iframe width="100%" height="190" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen style="display:block;"></iframe>`;
        a.closest('.msg-content')?.appendChild(frame);
      }
    });
  });
  obs.observe(list, { childList: true, subtree: true });
}

/* ─── 27. UNREAD SEPARATOR ──────────────────────────────────────────── */
function initUnreadSeparator() {
  // Called after renderMessages; inserts separator before first unread
  const orig = window.renderMessages;
  if (typeof orig !== 'function') return;
  window.renderMessages = function(container, messages, myId, otherReadAt, starredIds) {
    orig(container, messages, myId, otherReadAt, starredIds);
    if (!otherReadAt) return;
    const readTime = new Date(otherReadAt).getTime();
    const rows = [...container.querySelectorAll('.msg-row')];
    let inserted = false;
    for (const row of rows) {
      const ts = row.dataset.ts;
      if (!ts) continue;
      if (!inserted && new Date(ts).getTime() > readTime) {
        const sep = document.createElement('div');
        sep.className = 'unread-separator';
        sep.innerHTML = '<span>Non lus</span>';
        container.insertBefore(sep, row);
        inserted = true;
      }
    }
  };
}

/* ─── 28. SLOW MODE BAR ─────────────────────────────────────────────── */
function initSlowModeBar() {
  const bar = document.getElementById('slowModeBar');
  if (!bar) return;

  let countdown = null;

  const orig = window.handleSend;
  if (typeof orig === 'function') {
    window.handleSend = async function() {
      await orig();
      const slow = window.App?.activeChannelSlowMode;
      if (slow > 0) {
        clearInterval(countdown);
        let rem = slow;
        bar.classList.add('show');
        bar.textContent = `Mode lent : ${rem}s`;
        countdown = setInterval(() => {
          rem--;
          if (rem <= 0) { clearInterval(countdown); bar.classList.remove('show'); bar.textContent = ''; }
          else bar.textContent = `Mode lent : ${rem}s`;
        }, 1000);
      }
    };
  }
}

/* ─── 29. MESSAGE SELECTION MODE ────────────────────────────────────── */
function initMessageSelectionMode() {
  const list = document.getElementById('messageList');
  if (!list) return;

  let selMode = false;
  const selected = new Set();

  // Toggle selection mode with a dedicated btn (future: add to topbar)
  // For now, Shift+Click on any message enters selection mode
  list.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    const row = e.target.closest('.msg-row');
    if (!row) return;
    const msgId = row.dataset.messageId;
    if (!msgId) return;
    selMode = true;
    row.classList.toggle('selected');
    if (row.classList.contains('selected')) selected.add(msgId);
    else selected.delete(msgId);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selMode) {
      selMode = false;
      selected.clear();
      list.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
    }
  });
}

/* ─── 30. THREADED REPLY (scroll to parent) ─────────────────────────── */
function initThreadedReply() {
  const list = document.getElementById('messageList');
  if (!list) return;
  // Already partially handled in app.js via [data-jump-to]; this adds a back-link after jump
  list.addEventListener('click', (e) => {
    const preview = e.target.closest('.msg-reply-preview');
    if (!preview) return;
    const jumpId = preview.dataset.jumpTo;
    const target = list.querySelector(`[data-message-id="${jumpId}"]`);
    if (!target) { toast("Message introuvable dans l'historique."); return; }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight-jump');
    setTimeout(() => target.classList.remove('highlight-jump'), 1400);
  });
}

/* ─── 31. ONLINE COUNT BADGE ─────────────────────────────────────────── */
function initOnlineCountBadge() {
  setInterval(async () => {
    if (!window.App?.activeConversationId) return;
    const badge = document.getElementById('topbarSub');
    if (!badge) return;
    try {
      const members = await listConversationMembers?.(window.App.activeConversationId);
      if (!members) return;
      const onlineCount = members.filter(m => m.profiles?.status === 'online').length;
      const current = badge.textContent;
      if (current && !current.includes('en ligne')) {
        badge.textContent = badge.textContent + ` · ${onlineCount} en ligne`;
      }
    } catch (_) {}
  }, 30000);
}

/* ─── 32. SOUNDBOARD ────────────────────────────────────────────────── */
function initSoundboard() {
  // Play short audio clip when a message arrives (if sounds enabled)
  const orig = window.onIncomingNotification;
  window.onIncomingNotification = function(notif) {
    if (orig) orig(notif);
    if (localStorage.getItem('ego_notif_sound') !== 'off') {
      playBlip(440, 0.08);
    }
  };
}

/* ─── 33. CHAT STATS (message count per session) ────────────────────── */
function initChatStats() {
  window._sessionMsgCount = window._sessionMsgCount || 0;
  const orig = window.handleSend;
  if (typeof orig !== 'function') return;
  window.handleSend = async function() {
    await orig();
    window._sessionMsgCount++;
  };
}

/* ─── 34. AUTO-SCROLL PAUSE ─────────────────────────────────────────── */
function initAutoScrollPause() {
  const list = document.getElementById('messageList');
  if (!list) return;

  let userScrolled = false;
  list.addEventListener('scroll', () => {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    userScrolled = !atBottom;
  });

  // Only auto-scroll if user hasn't manually scrolled up
  const origOnNew = window._origOnNewMessage;
  // Patch enterConversation's onNewMessage closure behavior via App state
  window._autoScrollPaused = () => userScrolled;
}

/* ─── 35. MARKDOWN PREVIEW TOGGLE ───────────────────────────────────── */
function initMarkdownPreview() {
  const input = document.getElementById('composerInput');
  if (!input) return;

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.id = 'mdPreviewBtn';
  previewBtn.className = 'composer-btn';
  previewBtn.title = 'Prévisualiser (Ctrl+P)';
  previewBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  input.parentElement?.insertBefore(previewBtn, input.nextSibling);

  let previewActive = false;
  let previewDiv = null;

  previewBtn.addEventListener('click', togglePreview);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && document.activeElement === input) {
      e.preventDefault(); togglePreview();
    }
  });

  function togglePreview() {
    previewActive = !previewActive;
    if (previewActive) {
      if (!previewDiv) {
        previewDiv = document.createElement('div');
        previewDiv.className = 'md-preview-box';
        previewDiv.style.cssText = 'min-height:40px;padding:10px;background:var(--bg-input);border-radius:10px;color:var(--text);font-size:.92rem;margin-top:6px;border:1px solid var(--border);';
        input.parentElement?.appendChild(previewDiv);
      }
      previewDiv.innerHTML = typeof renderMessageContent === 'function' ? renderMessageContent(input.value) : input.value;
      input.style.display = 'none';
      previewDiv.style.display = 'block';
      previewBtn.classList.add('active');
    } else {
      if (previewDiv) previewDiv.style.display = 'none';
      input.style.display = '';
      input.focus();
      previewBtn.classList.remove('active');
    }
  }
}

/* ─── 36. NIGHT MODE AUTO-SCHEDULE ──────────────────────────────────── */
function initNightMode() {
  function applyAuto() {
    const hour = new Date().getHours();
    const isDark = hour >= 20 || hour < 8;
    const manual = localStorage.getItem('ego_theme_manual');
    if (manual) return; // User has explicitly chosen
    if (isDark) document.body.classList.remove('theme-light');
    else document.body.classList.add('theme-light');
  }
  applyAuto();
  setInterval(applyAuto, 5 * 60 * 1000);
}

/* ─── 37. SIDEBAR RESIZE (drag handle) ──────────────────────────────── */
function initSidebarResize() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const handle = document.createElement('div');
  handle.style.cssText = 'position:absolute;right:-3px;top:0;bottom:0;width:6px;cursor:col-resize;z-index:10;';
  sidebar.style.position = 'relative';
  sidebar.appendChild(handle);

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newW = Math.max(200, Math.min(400, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
    document.documentElement.style.setProperty('--sidebar-w', newW + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    localStorage.setItem('ego_sidebar_w', sidebar.style.width);
  });

  const saved = localStorage.getItem('ego_sidebar_w');
  if (saved) { sidebar.style.width = saved; document.documentElement.style.setProperty('--sidebar-w', saved); }
}

/* ─── 38. TOPBAR PIN DROP (drag a file onto topbar) ─────────────────── */
function initTopbarPinDrop() {
  const topbar = document.getElementById('panelTopbar');
  if (!topbar) return;

  topbar.addEventListener('dragover', (e) => {
    e.preventDefault();
    topbar.style.outline = '2px dashed var(--accent)';
  });
  topbar.addEventListener('dragleave', () => { topbar.style.outline = ''; });
  topbar.addEventListener('drop', async (e) => {
    e.preventDefault();
    topbar.style.outline = '';
    const file = e.dataTransfer.files[0];
    if (!file || !window.App?.activeConversationId) return;
    toast('Envoi du fichier depuis topbar...');
    const uploaded = await uploadAttachment?.(file);
    if (uploaded) await sendMessage?.(window.App.activeConversationId, '', { attachment: uploaded });
  });
}

/* ─── 39. BADGE ON BROWSER TAB ──────────────────────────────────────── */
function initBadgeOnTitle() {
  const originalTitle = document.title;
  let unreadCount = 0;

  window._addUnreadBadge = (n) => {
    unreadCount = n;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${originalTitle}` : originalTitle;
    // Also try the experimental Badge API
    if (navigator.setAppBadge) navigator.setAppBadge(unreadCount).catch(() => {});
  };

  // Hook into notification dot refresh
  const origRefresh = window.refreshNotifDot;
  if (typeof origRefresh === 'function') {
    window.refreshNotifDot = async function() {
      await origRefresh();
      const dot = document.getElementById('notifDot');
      const has = dot?.classList.contains('show');
      window._addUnreadBadge(has ? 1 : 0);
    };
  }

  // Clear badge when window is focused
  window.addEventListener('focus', () => window._addUnreadBadge(0));
}

/* ─── 40. FONT SIZE ACCESSIBILITY CONTROL ───────────────────────────── */
(function initFontScaler() {
  const stored = parseFloat(localStorage.getItem('ego_font_scale') || '1');
  document.documentElement.style.setProperty('--font-scale', stored);
  document.documentElement.style.fontSize = (stored * 100) + '%';

  // Expose function for settings tab (wire if element exists)
  window.setFontScale = (scale) => {
    const clamped = Math.max(0.8, Math.min(1.4, scale));
    localStorage.setItem('ego_font_scale', clamped);
    document.documentElement.style.setProperty('--font-scale', clamped);
    document.documentElement.style.fontSize = (clamped * 100) + '%';
  };

  // Keyboard shortcut: Ctrl+= zoom in, Ctrl+- zoom out
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const cur = parseFloat(localStorage.getItem('ego_font_scale') || '1');
    if (e.key === '=' || e.key === '+') { e.preventDefault(); window.setFontScale(cur + 0.05); }
    if (e.key === '-')                  { e.preventDefault(); window.setFontScale(cur - 0.05); }
    if (e.key === '0')                  { e.preventDefault(); window.setFontScale(1); }
  });
})();

/* ─── UTILITY: LOCAL DEBOUNCE (avoids conflict with app.js debounce) ── */
function debounceLocal(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ─── UTILITY: ESC (used in actionable toast) ───────────────────────── */
function esc(str) {
  if (typeof window.esc === 'function') return window.esc(str);
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
