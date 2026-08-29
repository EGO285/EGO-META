/* =========================================================================
   EGO-META — Logique du panneau d'administration (admin.html)
   ========================================================================= */

let AdminMe = null;

document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  if (!sbConfigured) { document.getElementById('loadingScreen').textContent = 'Supabase non configuré — voir js/config.js et README.md.'; return; }

  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) { window.location.href = 'index.html'; return; }

  AdminMe = await getMyProfile();
  document.getElementById('loadingScreen').classList.add('hidden');

  if (!AdminMe?.is_site_admin) {
    document.getElementById('accessDenied').classList.remove('hidden');
    return;
  }

  document.getElementById('adminShell').classList.remove('hidden');
  wireAdminTabs();
  loadOverview();
  wireUsersPanel();
  wireReportsPanel();
  wireInvitesPanel();
  wireAnnouncePanel();
  wireConversationsPanel();
});

function wireAdminTabs() {
  document.querySelectorAll('.admin-tab-btn[data-atab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn[data-atab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('apanel-' + btn.dataset.atab).classList.add('active');
      if (btn.dataset.atab === 'users') loadUsers();
      if (btn.dataset.atab === 'reports') loadReports();
      if (btn.dataset.atab === 'invites') loadInvites();
      if (btn.dataset.atab === 'audit') loadAudit();
      if (btn.dataset.atab === 'conversations') { document.getElementById('convListView').classList.remove('hidden'); document.getElementById('convThreadView').classList.add('hidden'); loadConversations(); }
    });
  });
}

/* -------- Conversations (accès total admin — voir sql/migration_v4.sql et privacy.html) -------- */

let AdminConversations = [];

function wireConversationsPanel() {
  document.getElementById('convSearchInput').addEventListener('input', debounce(() => renderConversationsTable(), 250));
  document.getElementById('convBackBtn').addEventListener('click', () => {
    document.getElementById('convThreadView').classList.add('hidden');
    document.getElementById('convListView').classList.remove('hidden');
  });
}

async function loadConversations() {
  AdminConversations = await adminListConversations();
  renderConversationsTable();
}

function renderConversationsTable() {
  const q = document.getElementById('convSearchInput').value.trim().toLowerCase();
  const typeLabels = { dm: 'Message privé', group: 'Groupe', channel: 'Salon' };
  const list = q ? AdminConversations.filter(c => c.label.toLowerCase().includes(q)) : AdminConversations;
  document.getElementById('conversationsTableBody').innerHTML = list.map(c => `
    <tr>
      <td>${esc(c.label)}</td>
      <td>${typeLabels[c.type] || c.type}</td>
      <td>${c.memberCount}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
      <td><button class="btn btn-ghost btn-sm" data-view-conv="${c.id}">Voir</button></td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;">Aucune conversation.</td></tr>`;
  document.getElementById('conversationsTableBody').querySelectorAll('[data-view-conv]').forEach(b => b.addEventListener('click', () => openConversationThread(b.dataset.viewConv)));
}

async function openConversationThread(conversationId) {
  const conv = AdminConversations.find(c => c.id === conversationId);
  document.getElementById('convThreadTitle').textContent = conv ? conv.label : 'Conversation';
  document.getElementById('convThreadMessages').innerHTML = `<p class="muted">Chargement…</p>`;
  document.getElementById('convListView').classList.add('hidden');
  document.getElementById('convThreadView').classList.remove('hidden');

  const messages = await adminListConversationMessages(conversationId);
  document.getElementById('convThreadMessages').innerHTML = messages.length ? messages.map(m => `
    <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;">
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:.8rem;color:var(--text-faint);margin-bottom:4px;">
        <strong style="color:var(--text);">${esc(m.profiles?.display_name || 'Utilisateur supprimé')}</strong>
        <span>${new Date(m.created_at).toLocaleString()}</span>
      </div>
      <div style="white-space:pre-wrap;word-break:break-word;">${m.deleted ? '<em class="muted">Message supprimé</em>' : esc(m.content || (m.attachment_url ? '[pièce jointe]' : ''))}</div>
    </div>
  `).join('') : `<p class="muted">Aucun message dans cette conversation.</p>`;
}

async function loadOverview() {
  const stats = await adminStats();
  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card"><div class="num">${stats.users || 0}</div><div class="lbl">Membres inscrits</div></div>
    <div class="stat-card"><div class="num">${stats.messages || 0}</div><div class="lbl">Messages envoyés</div></div>
    <div class="stat-card"><div class="num">${stats.groups || 0}</div><div class="lbl">Groupes</div></div>
    <div class="stat-card"><div class="num">${stats.communities || 0}</div><div class="lbl">Communautés</div></div>
    <div class="stat-card"><div class="num">${stats.openReports || 0}</div><div class="lbl">Signalements ouverts</div></div>
  `;
}

function wireUsersPanel() {
  loadUsers();
  document.getElementById('userSearchInput').addEventListener('input', debounce(loadUsers, 250));
}

async function loadUsers() {
  const q = document.getElementById('userSearchInput').value.trim().toLowerCase();
  let users = await adminListUsers();
  if (q) users = users.filter(u => u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q));
  document.getElementById('usersTableBody').innerHTML = users.map(u => `
    <tr>
      <td style="display:flex;align-items:center;gap:8px;">${avatarHtml(u, 'sm')} ${esc(u.display_name)} <span class="muted">@${esc(u.username)}</span> ${u.is_site_admin ? '<span class="pill pill-owner">Admin</span>' : ''}</td>
      <td>${u.level} — ${esc(u.title)}</td>
      <td>${u.xp}</td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td>${u.is_banned ? `<span class="pill" style="background:var(--danger-soft);color:var(--danger);">Banni</span>` : `<span class="pill pill-mod">Actif</span>`}</td>
      <td>
        ${u.id === AdminMe.id ? '' : u.is_banned
          ? `<button class="btn btn-ghost btn-sm" data-unban="${u.id}">Débannir</button>`
          : `<button class="btn btn-danger-outline btn-sm" data-ban="${u.id}">Bannir</button>`}
      </td>
    </tr>
  `).join('');
  document.getElementById('usersTableBody').querySelectorAll('[data-ban]').forEach(b => b.addEventListener('click', async () => {
    const reason = prompt('Raison du bannissement :', 'Non-respect des règles');
    if (reason == null) return;
    await adminBanUser(b.dataset.ban, reason);
    loadUsers();
  }));
  document.getElementById('usersTableBody').querySelectorAll('[data-unban]').forEach(b => b.addEventListener('click', async () => {
    await adminUnbanUser(b.dataset.unban);
    loadUsers();
  }));
}

function wireReportsPanel() { loadReports(); }

async function loadReports() {
  const reports = await adminListReports();
  document.getElementById('reportsTableBody').innerHTML = reports.map(r => `
    <tr>
      <td>${r.target_type === 'user' ? '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg> Utilisateur' : '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.2-1.1L3 20l1.1-5.3A8.38 8.38 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3a8.38 8.38 0 0 1 9.5 8.5Z"/></svg> Message'}</td>
      <td>${esc(r.reporter?.display_name || '?')}</td>
      <td>${esc(r.target_user?.display_name || (r.target_message_id ? 'Message #' + r.target_message_id.slice(0, 6) : '—'))}</td>
      <td>${esc(r.reason)}${r.details ? '<br><span class="muted" style="font-size:.78rem;">' + esc(r.details) + '</span>' : ''}</td>
      <td><span class="pill ${r.status === 'open' ? 'pill-admin' : r.status === 'resolved' ? 'pill-mod' : 'pill-private'}">${r.status}</span></td>
      <td>
        ${r.status === 'open' ? `
          <button class="btn btn-ghost btn-sm" data-resolve="${r.id}" data-status="resolved">Résoudre</button>
          <button class="btn btn-ghost btn-sm" data-resolve="${r.id}" data-status="dismissed">Ignorer</button>
        ` : ''}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted" style="text-align:center;">Aucun signalement.</td></tr>`;
  document.getElementById('reportsTableBody').querySelectorAll('[data-resolve]').forEach(b => b.addEventListener('click', async () => {
    await adminResolveReport(b.dataset.resolve, b.dataset.status);
    loadReports();
  }));
}

function wireInvitesPanel() {
  loadInvites();
  document.getElementById('inv_create').addEventListener('click', async () => {
    const code = document.getElementById('inv_code').value.trim() || randHex(8);
    const maxUses = parseInt(document.getElementById('inv_maxuses').value, 10) || 1;
    const expires = document.getElementById('inv_expires').value ? new Date(document.getElementById('inv_expires').value).toISOString() : null;
    await adminCreateInviteCode(code, maxUses, expires);
    document.getElementById('inv_code').value = '';
    loadInvites();
  });
}

async function loadInvites() {
  const codes = await adminListInviteCodes();
  document.getElementById('invitesTableBody').innerHTML = codes.map(c => `
    <tr>
      <td><code>${esc(c.code)}</code> <button class="btn-icon" data-copy-code="${esc(c.code)}" title="Copier"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></td>
      <td>${c.uses} / ${c.max_uses}</td>
      <td>${c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Jamais'}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="muted" style="text-align:center;">Aucun code créé.</td></tr>`;
  document.getElementById('invitesTableBody').querySelectorAll('[data-copy-code]').forEach(b => b.addEventListener('click', () => copyToClipboard(b.dataset.copyCode)));
}

function wireAnnouncePanel() {
  getSiteSettings().then(s => {
    if (!s) return;
    document.getElementById('ann_text').value = s.announcement || '';
    document.getElementById('ann_active').checked = s.announcement_active;
    document.getElementById('maint_active').checked = s.maintenance_mode;
  });
  document.getElementById('ann_save').addEventListener('click', async () => {
    await adminSetAnnouncement(document.getElementById('ann_text').value.trim(), document.getElementById('ann_active').checked);
  });
  document.getElementById('maint_active').addEventListener('change', async (e) => {
    await adminToggleMaintenance(e.target.checked);
  });
}

async function loadAudit() {
  const log = await adminListAuditLog();
  document.getElementById('auditTableBody').innerHTML = log.map(a => `
    <tr>
      <td>${new Date(a.created_at).toLocaleString()}</td>
      <td>${esc(a.profiles?.display_name || '?')}</td>
      <td>${esc(a.action)}</td>
      <td class="muted" style="font-size:.78rem;">${esc(JSON.stringify(a.details || {}))}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="muted" style="text-align:center;">Aucune action enregistrée.</td></tr>`;
}
