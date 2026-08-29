/* =========================================================================
   EGO-META — Stories (24h)
   ========================================================================= */

const StoryViewer = { groups: [], groupIndex: 0, storyIndex: 0, timer: null };

async function loadStoriesBar() {
  const bar = document.getElementById('storiesBar');
  if (!bar) return;
  const groups = await listActiveStoriesByUser();
  const me = App.me;
  const mine = groups.find(g => g.user?.id === me.id);
  const others = groups.filter(g => g.user?.id !== me.id);

  // Un seul cercle pour "ma story" : soit un cercle "ajouter" (si aucune story active),
  // soit ma story existante avec un badge "+" superposé pour en ajouter une autre.
  // (Avant : deux cercles quasi identiques cohabitaient et le clic sur le premier
  // ouvrait toujours la création — la story existante semblait alors "invisible".)
  let html = mine
    ? await storyBubbleHtml(mine, true)
    : `<div class="story-bubble story-add" data-add-story title="Ajouter une story">
        <div class="story-ring none">${avatarHtml(me)}<span class="story-add-badge">+</span></div>
        <span>Ta story</span>
      </div>`;
  for (const g of others) html += await storyBubbleHtml(g, false);
  bar.innerHTML = html;

  bar.querySelectorAll('[data-add-story]').forEach(b => b.addEventListener('click', openCreateStoryModal));
  bar.querySelectorAll('[data-story-add-badge]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openCreateStoryModal(); }));
  bar.querySelectorAll('[data-open-story-group]').forEach(b => b.addEventListener('click', () => openStoryViewer(groups, groups.findIndex(g => g.user?.id === b.dataset.openStoryGroup))));
}

async function storyBubbleHtml(group, isMine) {
  const unseen = isMine ? true : await hasUnseenStories(group.stories);
  return `<div class="story-bubble" data-open-story-group="${group.user.id}">
    <div class="story-ring ${unseen ? 'unseen' : 'seen'}">
      ${avatarHtml(group.user)}
      ${isMine ? `<span class="story-add-badge" data-story-add-badge title="Ajouter une story">+</span>` : ''}
    </div>
    <span>${isMine ? 'Ta story' : esc((group.user.display_name || '').split(' ')[0])}</span>
  </div>`;
}

/* -------- Création -------- */

function openCreateStoryModal() {
  document.getElementById('cs_story_text').value = '';
  document.getElementById('cs_story_file').value = '';
  document.getElementById('cs_story_preview').innerHTML = '';
  document.getElementById('cs_story_bgswatches').innerHTML = App.accentPalette.map(c =>
    `<div class="accent-swatch" style="background:${c};" data-storybg="${c}"></div>`).join('');
  document.querySelectorAll('#cs_story_bgswatches .accent-swatch')[0]?.classList.add('sel');
  openModal('modalCreateStory');
}

function wireStoryModals() {
  document.getElementById('cs_story_file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    document.getElementById('cs_story_preview').innerHTML = file.type.startsWith('video/')
      ? `<video src="${url}" style="max-width:100%;max-height:220px;border-radius:12px;" controls></video>`
      : `<img src="${url}" style="max-width:100%;max-height:220px;border-radius:12px;">`;
  });
  document.getElementById('cs_story_bgswatches').addEventListener('click', (e) => {
    const sw = e.target.closest('[data-storybg]');
    if (!sw) return;
    document.querySelectorAll('#cs_story_bgswatches .accent-swatch').forEach(s => s.classList.remove('sel'));
    sw.classList.add('sel');
  });

  document.getElementById('cs_story_submit').addEventListener('click', async () => {
    const file = document.getElementById('cs_story_file').files[0];
    const caption = document.getElementById('cs_story_text').value.trim();
    const bg = document.querySelector('#cs_story_bgswatches .sel')?.dataset.storybg || App.accentPalette[0];
    if (!file && !caption) return toast('Ajoutez une image/vidéo ou un texte.', 'error');

    document.getElementById('cs_story_submit').disabled = true;
    let mediaUrl = null, mediaType = 'text';
    if (file) {
      mediaUrl = await uploadStoryMedia(file);
      if (!mediaUrl) { document.getElementById('cs_story_submit').disabled = false; return; }
      mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    }
    await createStory({ mediaUrl, mediaType, caption, bgColor: bg });
    document.getElementById('cs_story_submit').disabled = false;
    closeModal('modalCreateStory');
    loadStoriesBar();
  });

  document.getElementById('sv_delete').addEventListener('click', async () => {
    const story = StoryViewer.groups[StoryViewer.groupIndex]?.stories[StoryViewer.storyIndex];
    if (!story || !confirm('Supprimer cette story ?')) return;
    await deleteStory(story.id);
    closeStoryViewer();
    loadStoriesBar();
  });

  document.getElementById('sv_viewers_btn').addEventListener('click', async () => {
    const story = StoryViewer.groups[StoryViewer.groupIndex]?.stories[StoryViewer.storyIndex];
    if (!story) return;
    const viewers = await listStoryViewers(story.id);
    document.getElementById('sv_viewers_list').innerHTML = viewers.length ? viewers.map(v => `
      <div class="list-item">${avatarHtml(v.profiles)}<div class="list-item-body"><div class="list-item-title">${esc(v.profiles?.display_name || '?')}</div></div></div>
    `).join('') : `<p class="muted center">Personne n'a encore vu cette story.</p>`;
    document.getElementById('sv_viewers_panel').classList.toggle('show');
  });
}

/* -------- Visionnage -------- */

function openStoryViewer(groups, groupIndex) {
  if (groupIndex < 0) return;
  StoryViewer.groups = groups;
  StoryViewer.groupIndex = groupIndex;
  StoryViewer.storyIndex = 0;
  document.getElementById('storyViewerOverlay').classList.add('show');
  renderStoryFrame();
}

function closeStoryViewer() {
  clearTimeout(StoryViewer.timer);
  document.getElementById('storyViewerOverlay').classList.remove('show');
  document.getElementById('sv_viewers_panel').classList.remove('show');
}

async function renderStoryFrame() {
  clearTimeout(StoryViewer.timer);
  const group = StoryViewer.groups[StoryViewer.groupIndex];
  if (!group) return closeStoryViewer();
  const story = group.stories[StoryViewer.storyIndex];
  if (!story) return closeStoryViewer();

  const isMine = group.user.id === App.me.id;
  document.getElementById('sv_author_avatar').innerHTML = avatarHtml(group.user);
  document.getElementById('sv_author_name').textContent = group.user.display_name;
  document.getElementById('sv_time').textContent = fmtRelative(story.created_at);
  document.getElementById('sv_delete').classList.toggle('hidden', !isMine);
  document.getElementById('sv_viewers_btn').classList.toggle('hidden', !isMine);
  document.getElementById('sv_viewers_panel').classList.remove('show');

  const stage = document.getElementById('sv_stage');
  if (story.media_type === 'image') {
    stage.style.background = '#000';
    stage.innerHTML = `<img src="${esc(story.media_url)}" style="width:100%;height:100%;object-fit:contain;">`;
  } else if (story.media_type === 'video') {
    stage.style.background = '#000';
    stage.innerHTML = `<video src="${esc(story.media_url)}" style="width:100%;height:100%;object-fit:contain;" autoplay playsinline></video>`;
  } else {
    stage.style.background = story.bg_color || 'var(--accent)';
    stage.innerHTML = '';
  }
  document.getElementById('sv_caption').textContent = story.caption || '';

  // Barres de progression
  const bars = document.getElementById('sv_progress');
  bars.innerHTML = group.stories.map((_, i) => `<div class="sv-bar"><div class="sv-bar-fill ${i < StoryViewer.storyIndex ? 'full' : ''}" data-bar="${i}"></div></div>`).join('');

  if (!isMine) markStoryViewed(story.id);

  const DURATION = story.media_type === 'video' ? 8000 : 5000;
  const fill = bars.querySelector(`[data-bar="${StoryViewer.storyIndex}"]`);
  requestAnimationFrame(() => { if (fill) { fill.style.transitionDuration = DURATION + 'ms'; fill.classList.add('full'); } });
  StoryViewer.timer = setTimeout(nextStory, DURATION);
}

function nextStory() {
  const group = StoryViewer.groups[StoryViewer.groupIndex];
  if (StoryViewer.storyIndex < group.stories.length - 1) {
    StoryViewer.storyIndex++;
  } else if (StoryViewer.groupIndex < StoryViewer.groups.length - 1) {
    StoryViewer.groupIndex++; StoryViewer.storyIndex = 0;
  } else {
    return closeStoryViewer();
  }
  renderStoryFrame();
}
function prevStory() {
  if (StoryViewer.storyIndex > 0) { StoryViewer.storyIndex--; }
  else if (StoryViewer.groupIndex > 0) { StoryViewer.groupIndex--; StoryViewer.storyIndex = StoryViewer.groups[StoryViewer.groupIndex].stories.length - 1; }
  else return;
  renderStoryFrame();
}
