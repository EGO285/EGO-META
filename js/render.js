/* =========================================================================
   EGO-META — Fonctions de rendu (listes, messages, membres)
   ========================================================================= */

function renderDMList(container, dms, activeId) {
  if (!dms.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.2-1.1L3 20l1.1-5.3A8.38 8.38 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3a8.38 8.38 0 0 1 9.5 8.5Z"/></svg></div><p>Aucune conversation.<br>Cherchez un membre pour démarrer !</p></div>`;
    return;
  }
  container.innerHTML = dms.map(d => `
    <div class="list-item ${d.conversation_id === activeId ? 'active' : ''} ${d.pinned ? 'pinned' : ''}" data-open-dm="${d.conversation_id}" data-conv-item="${d.conversation_id}">
      ${d.pinned ? '<span class="pin-flag" title="Épinglé"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/></svg></span>' : ''}
      ${avatarHtml(d.other)}
      <div class="list-item-body">
        <div class="list-item-title">${esc(d.other?.display_name || 'Utilisateur')} ${d.muted ? '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.7 5A6 6 0 0 1 18 11c0 3.3.9 4.9 1.5 5.6"/><path d="M6 8a6 6 0 0 0-.4 3c0 5-2 6-2 6h13"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M2 2l20 20"/></svg>' : ''}</div>
        <div class="list-item-sub">${d.lastMsg ? (d.lastMsg.deleted ? '<i>message supprimé</i>' : esc((d.lastMsg.content || '').slice(0, 40))) : 'Dites bonjour <svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12V6a2 2 0 0 1 4 0v5"/><path d="M12 11V4a2 2 0 0 1 4 0v7"/><path d="M16 11V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-6-3.4L2.7 13a2 2 0 0 1 3.4-2l1.9 2.6"/></svg>'}</div>
      </div>
      <div class="list-item-meta">
        <span class="list-item-time">${d.lastMsg ? fmtRelative(d.lastMsg.created_at) : ''}</span>
        ${d.unread ? `<span class="unread-badge">${d.unread > 99 ? '99+' : d.unread}</span>` : ''}
        <button class="btn-icon list-item-menu-btn" data-conv-menu="${d.conversation_id}" data-conv-pinned="${!!d.pinned}" data-conv-muted="${!!d.muted}" title="Options">⋮</button>
      </div>
    </div>
  `).join('');
}

function renderGroupList(container, groups, activeId) {
  if (!groups.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>Aucun groupe.<br>Créez-en un ou rejoignez avec un code !</p></div>`;
    return;
  }
  container.innerHTML = groups.map(g => `
    <div class="list-item ${g.conversation_id === activeId ? 'active' : ''} ${g.pinned ? 'pinned' : ''}" data-open-group="${g.conversation_id}" data-conv-item="${g.conversation_id}">
      ${g.pinned ? '<span class="pin-flag" title="Épinglé"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/></svg></span>' : ''}
      ${avatarHtml({ display_name: g.group.name, avatar_url: g.group.icon_url })}
      <div class="list-item-body">
        <div class="list-item-title">${esc(g.group.name)} ${g.muted ? '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.7 5A6 6 0 0 1 18 11c0 3.3.9 4.9 1.5 5.6"/><path d="M6 8a6 6 0 0 0-.4 3c0 5-2 6-2 6h13"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M2 2l20 20"/></svg>' : ''}</div>
        <div class="list-item-sub">${g.lastMsg ? esc((g.lastMsg.content || '').slice(0, 40)) : g.group.description || 'Aucun message'}</div>
      </div>
      <div class="list-item-meta">
        <span class="list-item-time">${g.lastMsg ? fmtRelative(g.lastMsg.created_at) : ''}</span>
        ${g.unread ? `<span class="unread-badge">${g.unread > 99 ? '99+' : g.unread}</span>` : ''}
        <button class="btn-icon list-item-menu-btn" data-conv-menu="${g.conversation_id}" data-conv-pinned="${!!g.pinned}" data-conv-muted="${!!g.muted}" title="Options">⋮</button>
      </div>
    </div>
  `).join('');
}

function renderCommunityList(container, communities, activeId) {
  if (!communities.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V9l3-2V5h2v2l2-2v3l2-2v3l2-3v3l2-2v2l3 2v12Z"/><path d="M3 21h18"/><path d="M9 21v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5"/></svg></div><p>Aucune communauté rejointe.</p></div>`;
    return;
  }
  container.innerHTML = communities.map(c => `
    <div class="list-item ${c.id === activeId ? 'active' : ''}" data-open-community="${c.id}">
      ${avatarHtml({ display_name: c.name, avatar_url: c.icon_url })}
      <div class="list-item-body">
        <div class="list-item-title">${esc(c.name)}</div>
        <div class="list-item-sub">${c.myRole === 'owner' ? '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17 2.5 7.5 8 11l4-7 4 7 5.5-3.5L20 17Z"/><path d="M4 20h16"/></svg> Propriétaire' : c.is_public ? 'Publique' : 'Privée'}</div>
      </div>
    </div>
  `).join('');
}

function renderChannelList(container, categories, channels, activeChannelId) {
  const byCat = {};
  channels.forEach(ch => {
    const key = ch.category_id || 'none';
    (byCat[key] = byCat[key] || []).push(ch);
  });
  let html = '';
  categories.forEach(cat => {
    const chs = byCat[cat.id] || [];
    if (!chs.length) return;
    html += `<div class="section-label">${esc(cat.name)}</div>`;
    chs.forEach(ch => {
      html += `<div class="list-item ${ch.conversation_id === activeChannelId ? 'active' : ''}" data-open-channel="${ch.conversation_id}" data-channel-id="${ch.id}">
        <div class="list-item-body"><div class="list-item-title">#&nbsp;${esc(ch.name)}</div></div>
      </div>`;
    });
  });
  if (byCat['none']) {
    byCat['none'].forEach(ch => {
      html += `<div class="list-item ${ch.conversation_id === activeChannelId ? 'active' : ''}" data-open-channel="${ch.conversation_id}" data-channel-id="${ch.id}">
        <div class="list-item-body"><div class="list-item-title">#&nbsp;${esc(ch.name)}</div></div>
      </div>`;
    });
  }
  container.innerHTML = html || `<p class="muted" style="padding:10px;">Aucun salon.</p>`;
}

function renderFriendList(container, friends) {
  if (!friends.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12 4.5 8.5a2 2 0 0 1 2.8-2.8L11 9"/><path d="M13 9l3.7-3.3a2 2 0 0 1 2.8 2.8L15 13"/><path d="M8 12l3 3 2-2"/><path d="M11 15l2 2 5-5"/><path d="M2 15l3 3 2-2-3-3Z"/></svg></div><p>Pas encore d'amis.<br>Cherchez des membres pour en ajouter !</p></div>`;
    return;
  }
  container.innerHTML = friends.map(f => `
    <div class="list-item" data-open-dm-user="${f.id}">
      ${avatarHtml(f)}
      <div class="list-item-body">
        <div class="list-item-title">${esc(f.display_name)} ${levelBadgeHtml(f.level, f.title)}</div>
        <div class="list-item-sub">${statusDotHtml(f.status)} ${esc(f.status_message || f.status)}</div>
      </div>
      <button class="btn-icon" data-remove-friend="${f.id}" title="Retirer"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg></button>
    </div>
  `).join('');
}

function renderStarredList(container, messages) {
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg icon-filled" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.6-5 4.4 1.5 6.5-6-3.5-6 3.5 1.5-6.5-5-4.4 6.6-.6Z"/></svg></div><p>Aucun message favori.<br>Cliquez sur l'étoile d'un message pour le retrouver ici.</p></div>`;
    return;
  }
  container.innerHTML = messages.map(m => `
    <div class="list-item" data-open-starred="${m.id}" data-starred-conv="${m.conversation_id}">
      ${avatarHtml(m.profiles)}
      <div class="list-item-body">
        <div class="list-item-title">${esc(m.profiles?.display_name || '?')}</div>
        <div class="list-item-sub">${m.deleted ? '<i>message supprimé</i>' : esc((m.content || '').slice(0, 50))}</div>
      </div>
      <div class="list-item-meta"><span class="list-item-time">${fmtRelative(m.created_at)}</span></div>
    </div>
  `).join('');
}

function renderArchivedList(container, items) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/></svg></div><p>Aucune conversation archivée.</p></div>`;
    return;
  }
  container.innerHTML = items.map(it => {
    const title = it.kind === 'dm' ? esc(it.other?.display_name || 'Utilisateur') : esc(it.group.name);
    const avatar = it.kind === 'dm' ? avatarHtml(it.other) : avatarHtml({ display_name: it.group.name, avatar_url: it.group.icon_url });
    return `
      <div class="list-item" data-archived-item="${it.conversation_id}">
        ${avatar}
        <div class="list-item-body">
          <div class="list-item-title">${title}</div>
          <div class="list-item-sub">${it.lastMsg ? (it.lastMsg.deleted ? '<i>message supprimé</i>' : esc((it.lastMsg.content || '').slice(0, 40))) : 'Aucun message'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-unarchive="${it.conversation_id}">Désarchiver</button>
      </div>`;
  }).join('');
}

function pollItemHtml(poll, myId) {
  const votes = poll.poll_votes || [];
  const totalVoters = new Set(votes.map(v => v.user_id)).size;
  const closed = poll.closes_at && new Date(poll.closes_at) < new Date();
  const myVotes = new Set(votes.filter(v => v.user_id === myId).map(v => v.option_index));
  const optionsHtml = (poll.options || []).map((opt, i) => {
    const count = votes.filter(v => v.option_index === i).length;
    const pct = totalVoters ? Math.round((count / totalVoters) * 100) : 0;
    const mine = myVotes.has(i);
    return `
      <button class="poll-option ${mine ? 'mine' : ''}" data-poll-vote="${poll.id}" data-poll-option="${i}" ${closed ? 'disabled' : ''}>
        <span class="poll-option-bar" style="width:${pct}%"></span>
        <span class="poll-option-label">${mine ? '✓ ' : ''}${esc(opt)}</span>
        <span class="poll-option-pct">${pct}% (${count})</span>
      </button>`;
  }).join('');
  return `
    <div class="poll-card" data-poll-id="${poll.id}">
      <div class="poll-question">${esc(poll.question)}${closed ? ' <span class="muted">— clos</span>' : ''}</div>
      <div class="poll-options">${optionsHtml}</div>
      <div class="poll-meta muted">${totalVoters} vote${totalVoters !== 1 ? 's' : ''}${poll.allow_multiple ? ' · choix multiple' : ''}</div>
    </div>`;
}

function renderNotifications(container, notifs) {
  if (!notifs.length) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg></div><p>Aucune notification.</p></div>`;
    return;
  }
  const labels = {
    mention: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.2-1.1L3 20l1.1-5.3A8.38 8.38 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3a8.38 8.38 0 0 1 9.5 8.5Z"/></svg> vous a mentionné',
    tag_all: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a2 2 0 0 0 2 2h1l2 5h2l-1-5h2l7 4V6l-7 4H6a2 2 0 0 0-2 2"/></svg> a mentionné tout le monde',
    friend_request: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12 4.5 8.5a2 2 0 0 1 2.8-2.8L11 9"/><path d="M13 9l3.7-3.3a2 2 0 0 1 2.8 2.8L15 13"/><path d="M8 12l3 3 2-2"/><path d="M11 15l2 2 5-5"/><path d="M2 15l3 3 2-2-3-3Z"/></svg> vous a envoyé une demande d\'ami',
    friend_accept: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> a accepté votre demande d\'ami',
    group_invite: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> vous a invité dans un groupe',
    community_invite: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V9l3-2V5h2v2l2-2v3l2-2v3l2-3v3l2-2v2l3 2v12Z"/><path d="M3 21h18"/><path d="M9 21v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5"/></svg> vous a invité dans une communauté',
    system: 'ℹ️ Notification système'
  };
  container.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-notif-id="${n.id}" data-notif-type="${n.type}" data-notif-payload='${esc(JSON.stringify(n.payload))}'>
      <div class="notif-text">${labels[n.type] || n.type}</div>
      <div class="notif-time">${fmtRelative(n.created_at)}</div>
    </div>
  `).join('');
}

/* ---------------- messages ---------------- */

function renderMessages(container, messages, myId, otherReadAt = null, starredIds = new Set()) {
  let html = '';
  let lastDay = null, lastSender = null, lastTime = 0;
  messages.forEach((m, i) => {
    const day = fmtDayLabel(m.created_at);
    if (day !== lastDay) {
      html += `<div class="center" style="margin:16px 0 8px;"><span class="muted" style="font-size:.74rem;">${day}</span></div>`;
      lastDay = day; lastSender = null;
    }
    const grouped = lastSender === m.sender_id && (new Date(m.created_at) - lastTime) < 5 * 60 * 1000;
    const isLastMine = m.sender_id === myId && (i === messages.length - 1 || messages.slice(i + 1).every(mm => mm.sender_id !== myId));
    html += renderOneMessage(m, myId, grouped, isLastMine && otherReadAt ? (otherReadAt >= m.created_at) : null, starredIds.has(m.id));
    lastSender = m.sender_id; lastTime = new Date(m.created_at);
  });
  container.innerHTML = html;
}

function renderOneMessage(m, myId, grouped, readState = null, starred = false) {
  const p = m.profiles || {};
  const mine = m.sender_id === myId;
  const reactionsByEmoji = {};
  (m.message_reactions || []).forEach(r => {
    (reactionsByEmoji[r.emoji] = reactionsByEmoji[r.emoji] || []).push(r.user_id);
  });
  const reactionsHtml = Object.entries(reactionsByEmoji).map(([emoji, users]) => `
    <span class="reaction-pill ${users.includes(myId) ? 'mine' : ''}" data-react="${m.id}" data-emoji="${emoji}">${emoji} ${users.length}</span>
  `).join('');

  const replyHtml = m.reply ? `
    <div class="msg-reply-preview" data-jump-to="${m.reply.id}"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/></svg> ${esc(m.reply.profiles?.display_name || '')} : ${esc((m.reply.content || '').slice(0, 60))}</div>
  ` : '';

  const content = m.deleted
    ? `<span class="muted"><i>Message supprimé</i></span>`
    : renderMessageContent(m.content);

  const isAudio = (m.attachment_type || '').startsWith('audio/');
  const isImage = (m.attachment_type || '').startsWith('image/');
  const attachment = m.attachment_url ? `
    <div class="msg-attachment">
      ${isImage
        ? `<img src="${esc(m.attachment_url)}" alt="pièce jointe" data-lightbox="${esc(m.attachment_url)}">`
        : isAudio
          ? voicePlayerHtml(m.attachment_url)
          : `<a href="${esc(m.attachment_url)}" target="_blank" rel="noopener" style="display:block;padding:10px;"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5 12.5 20a4.5 4.5 0 0 1-6.4-6.4L15 4.7a3 3 0 0 1 4.3 4.2l-8.9 8.9a1.5 1.5 0 0 1-2.1-2.1l8-8"/></svg> Fichier joint</a>`}
    </div>` : '';

  return `
    <div class="msg-row ${grouped ? 'grouped' : ''}" data-message-id="${m.id}" data-sender-id="${m.sender_id}">
      <div class="msg-avatar-col">${avatarHtml(p)}</div>
      <div class="msg-body">
        ${!grouped ? `<div class="msg-head">
          <span class="msg-author">${esc(p.display_name || '?')}</span>
          ${levelBadgeHtml(p.level, p.title)}
          <span class="msg-time">${fmtTime(m.created_at)}</span>
        </div>` : ''}
        ${m.pinned ? `<div class="msg-pinned-flag"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/></svg> Épinglé</div>` : ''}
        ${m.forwarded_from_id ? `<div class="msg-forwarded-flag"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> Transféré</div>` : ''}
        ${replyHtml}
        <div class="msg-content">${content}${m.edited_at ? '<span class="msg-edited">(modifié)</span>' : ''}</div>
        ${attachment}
        ${reactionsHtml ? `<div class="reactions-row">${reactionsHtml}</div>` : ''}
        ${readState !== null ? `<div class="msg-receipt">${readReceiptHtml(true, readState)}</div>` : ''}
      </div>
      ${!m.deleted ? `<div class="msg-actions">
        <button data-action-react="${m.id}" title="Réagir"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg></button>
        <button data-action-reply="${m.id}" title="Répondre"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/></svg></button>
        <button data-action-forward="${m.id}" title="Transférer"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>
        <button data-action-star="${m.id}" data-starred="${starred}" title="${starred ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${starred ? '<svg class="icon-svg icon-filled" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.6-5 4.4 1.5 6.5-6-3.5-6 3.5 1.5-6.5-5-4.4 6.6-.6Z"/></svg>' : '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.6-5 4.4 1.5 6.5-6-3.5-6 3.5 1.5-6.5-5-4.4 6.6-.6Z"/></svg>'}</button>
        <button data-action-copy="${m.id}" title="Copier le texte"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        ${mine ? `<button data-action-edit="${m.id}" title="Modifier"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>` : ''}
        <button data-action-pin="${m.id}" data-pinned="${m.pinned}" title="Épingler"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="2"/></svg></button>
        ${mine ? `<button data-action-delete="${m.id}" title="Supprimer"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6Z"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>` : `
          <button data-action-hide-me="${m.id}" title="Masquer pour moi"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20"/><path d="M9.9 5.2A9.4 9.4 0 0 1 12 5c6.5 0 10 7 10 7a15.3 15.3 0 0 1-3.4 4.3"/><path d="M6.6 6.6A15.3 15.3 0 0 0 2 12s3.5 7 10 7a9.4 9.4 0 0 0 4-.9"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/></svg></button>
          <button data-action-report="${m.id}" title="Signaler"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3v18"/><path d="M5 4h11l-2 4 2 4H5"/></svg></button>`}
      </div>` : ''}
    </div>
  `;
}

function renderMembersPanel(container, members, myRole, myId, kind) {
  const order = { owner: 0, admin: 1, moderator: 2, member: 3 };
  const sorted = [...members].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  container.innerHTML = `<div class="section-label">Membres — ${members.length}</div>` + sorted.map(m => `
    <div class="member-row" data-member-id="${m.user_id}" data-member-role="${m.role}" data-open-member-profile="${m.user_id}">
      ${avatarHtml(m.profiles)}
      <div class="list-item-body">
        <div class="list-item-title" style="${roleColorStyle(m.role)}">${esc(m.nickname || m.profiles?.display_name)}</div>
        <div class="member-role-tag" style="${roleColorStyle(m.role)}">${roleLabel(m.role)}</div>
      </div>
      ${statusDotHtml(m.profiles?.status)}
    </div>
  `).join('');
}

function roleLabel(role) {
  return { owner: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17 2.5 7.5 8 11l4-7 4 7 5.5-3.5L20 17Z"/><path d="M4 20h16"/></svg> Propriétaire', admin: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6Z"/></svg> Admin', moderator: '<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7a4.5 4.5 0 0 1-6 4.2L8 18.3a2 2 0 0 1-2.8-2.8L12.3 8.5A4.5 4.5 0 0 1 17 3l-3 3 1 1 3-3Z"/></svg> Modérateur', member: 'Membre' }[role] || role;
}

function roleBadgeHtml(role) {
  const cls = { owner: 'pill-owner', admin: 'pill-admin', moderator: 'pill-mod' }[role] || 'pill-private';
  return `<span class="pill ${cls}">${roleLabel(role)}</span>`;
}
