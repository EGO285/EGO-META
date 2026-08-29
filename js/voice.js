/* =========================================================================
   EGO-META — Messages vocaux (enregistrement micro + envoi)
   ========================================================================= */

const VoiceRecorder = {
  mediaRecorder: null,
  chunks: [],
  stream: null,
  startedAt: 0,
  timerInterval: null,
  recording: false
};

async function startVoiceRecording() {
  if (VoiceRecorder.recording) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Votre navigateur ne permet pas d'enregistrer l'audio.", 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    VoiceRecorder.stream = stream;
    const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
    VoiceRecorder.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    VoiceRecorder.chunks = [];
    VoiceRecorder.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) VoiceRecorder.chunks.push(e.data); };
    VoiceRecorder.mediaRecorder.start();
    VoiceRecorder.recording = true;
    VoiceRecorder.startedAt = Date.now();

    document.getElementById('voiceRecordBar').classList.add('show');
    document.getElementById('composerBox').classList.add('hidden');
    VoiceRecorder.timerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - VoiceRecorder.startedAt) / 1000);
      document.getElementById('voiceTimer').textContent = fmtDuration(secs);
      if (secs >= 180) stopVoiceRecording(true); // limite de sécurité : 3 min
    }, 250);
  } catch (err) {
    toast("Impossible d'accéder au microphone : " + err.message, 'error');
  }
}

function cancelVoiceRecording() {
  if (!VoiceRecorder.recording) return;
  VoiceRecorder.mediaRecorder.onstop = null;
  VoiceRecorder.mediaRecorder.stop();
  VoiceRecorder.stream.getTracks().forEach(t => t.stop());
  clearInterval(VoiceRecorder.timerInterval);
  VoiceRecorder.recording = false;
  document.getElementById('voiceRecordBar').classList.remove('show');
  document.getElementById('composerBox').classList.remove('hidden');
}

function stopVoiceRecording(send = true) {
  if (!VoiceRecorder.recording) return;
  clearInterval(VoiceRecorder.timerInterval);
  VoiceRecorder.recording = false;
  document.getElementById('voiceRecordBar').classList.remove('show');
  document.getElementById('composerBox').classList.remove('hidden');

  if (!send) {
    VoiceRecorder.mediaRecorder.stop();
    VoiceRecorder.stream.getTracks().forEach(t => t.stop());
    return;
  }

  VoiceRecorder.mediaRecorder.onstop = async () => {
    VoiceRecorder.stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(VoiceRecorder.chunks, { type: VoiceRecorder.mediaRecorder.mimeType || 'audio/webm' });
    if (blob.size < 500) { toast('Enregistrement trop court, annulé.'); return; }
    const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
    const file = new File([blob], `vocal_${Date.now()}.${ext}`, { type: blob.type });
    toast('Envoi du message vocal...');
    const uploaded = await uploadAttachment(file);
    if (uploaded) await sendMessage(App.activeConversationId, '', { attachment: { ...uploaded, type: blob.type } });
  };
  VoiceRecorder.mediaRecorder.stop();
}

function fmtDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Lecteur simple pour les bulles de message contenant un fichier audio */
function voicePlayerHtml(url) {
  return `<audio controls preload="none" src="${esc(url)}" style="max-width:260px;height:38px;"></audio>`;
}
