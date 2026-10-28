
import { Room, RoomEvent } from 'livekit-client';
import './style.css';

const API_BASE = 'https://gpnbihar-backend.onrender.com';
const ROOM_NAME = 'gpnbihar-poc-room';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') === 'guest' ? 'guest' : 'anchor';

const statusEl = document.querySelector('#status');
const joinBtn = document.querySelector('#joinBtn');
const leaveBtn = document.querySelector('#leaveBtn');
const micBtn = document.querySelector('#micBtn');
const cameraBtn = document.querySelector('#cameraBtn');
const localVideo = document.querySelector('#localVideo');
const remoteVideo = document.querySelector('#remoteVideo');
const accessCodeInput = document.querySelector('#accessCode');
const guestNameInput = document.querySelector('#guestName');
const accessCodeLabel = document.querySelector('#accessCodeLabel');
const guestNameLabel = document.querySelector('#guestNameLabel');
const inviteBtn = document.querySelector('#inviteBtn');
const localHeading = document.querySelector('#localHeading');

const startRecordingBtn = document.querySelector('#startRecordingBtn');
const stopRecordingBtn = document.querySelector('#stopRecordingBtn');
const recordingStatus = document.querySelector('#recordingStatus');


const isAnchor = role === 'anchor';

startRecordingBtn.hidden = !isAnchor;
stopRecordingBtn.hidden = !isAnchor;

accessCodeLabel.hidden = role !== 'anchor';
guestNameLabel.hidden = role !== 'guest';
inviteBtn.hidden = role !== 'anchor';
localHeading.textContent =
  role === 'anchor' ? 'Anchor preview' : 'Guest preview';

let sessionToken = null;
let room;
let micEnabled = true;
let cameraEnabled = true;
let joining = false;

let activeEgressId = null;
let recordingBusy = false;
let statusPollTimer = null;

function setStatus(message) {
  statusEl.textContent = message;
}


function setRecordingStatus(message) {
  recordingStatus.textContent = message;
}

async function recordingRequest(path, method = 'POST') {
  if (!sessionToken) {
    throw new Error('Anchor session is missing. Rejoin the studio.');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Recording request failed (${response.status}): ${detail}`);
  }

  return response.json();
}

function clearStatusPolling() {
  if (statusPollTimer !== null) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

async function startRecording() {
  if (role !== 'anchor' || !room || recordingBusy || activeEgressId) return;

  recordingBusy = true;
  startRecordingBtn.disabled = true;
  stopRecordingBtn.disabled = true;
  setRecordingStatus('Starting recording...');

  try {
    const result = await recordingRequest(
      `/recording/start?room_name=${encodeURIComponent(room.name)}`,
    );

    activeEgressId = result.egress_id;
    setRecordingStatus(`Recording started (${activeEgressId})`);
    stopRecordingBtn.disabled = false;
  } catch (error) {
    console.error('[GPNBIHAR] Start recording failed:', error);
    setRecordingStatus(`Could not start recording: ${error.message}`);
    startRecordingBtn.disabled = false;
  } finally {
    recordingBusy = false;
  }
}

async function stopRecording() {
  if (role !== 'anchor' || !activeEgressId || recordingBusy) return;

  recordingBusy = true;
  stopRecordingBtn.disabled = true;
  setRecordingStatus('Stopping recording...');

  try {
    await recordingRequest('/recording/stop');

    setRecordingStatus('Stop requested. Waiting for the MP4 to finish...');
    clearStatusPolling();

    statusPollTimer = setInterval(async () => {
      if (!activeEgressId || recordingBusy) return;

      try {
        const egressId = activeEgressId;

        const result = await recordingRequest(
          `/recording/status/${encodeURIComponent(egressId)}`,
          'GET',
        );

        const status = String(result.status || '').toLowerCase();

        if (status.includes('complete')) {
          clearStatusPolling();
          setRecordingStatus('Recording complete. Preparing download link...');

          try {
            const downloadData = await recordingRequest(
              `/recording/download/${encodeURIComponent(egressId)}`,
              'GET',
            );

            recordingStatus.replaceChildren();

            const message = document.createElement('span');
            message.textContent = `Recording complete: ${downloadData.filename} `;

            const link = document.createElement('a');
            link.href = downloadData.download_url;
            link.textContent = 'Download MP4';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            recordingStatus.append(message, link);
          } catch (downloadError) {
            console.error('[GPNBIHAR] Download link failed:', downloadError);
            setRecordingStatus(
              `Recording completed, but the download link could not be created: ${downloadError.message}`,
            );
          }

          activeEgressId = null;
          startRecordingBtn.disabled = false;
        } else if (
          status.includes('failed') ||
          status.includes('aborted')
        ) {
          clearStatusPolling();
          setRecordingStatus(
            `Recording ended with status: ${result.status}. ${result.error || ''}`,
          );
          activeEgressId = null;
          startRecordingBtn.disabled = false;
        } else {
          setRecordingStatus(`Finalizing MP4... (${result.status})`);
        }
      } catch (error) {
        console.error('[GPNBIHAR] Recording status check failed:', error);
        setRecordingStatus('Waiting for recording status; retrying...');
      }
    }, 3000);
  } catch (error) {
    console.error('[GPNBIHAR] Stop recording failed:', error);
    setRecordingStatus(`Could not stop recording: ${error.message}`);
    stopRecordingBtn.disabled = false;
  } finally {
    recordingBusy = false;
  }
}


startRecordingBtn.addEventListener('click', startRecording);
stopRecordingBtn.addEventListener('click', stopRecording);


function addVideo(track, container, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'video-tile';

  const mediaElement = track.attach();
  wrapper.appendChild(mediaElement);

  const caption = document.createElement('span');
  caption.className = 'caption';
  caption.textContent = label;
  wrapper.appendChild(caption);

  container.appendChild(wrapper);
}

function removeTrack(track) {
  track.detach().forEach((element) => {
    element.remove();
    element.closest('.video-tile')?.remove();
  });
}


async function getCredentials() {
  let endpoint;
  let body;

  if (role === 'anchor') {
    const accessCode = accessCodeInput.value.trim();

    if (!accessCode) {
      throw new Error('Please enter the anchor access code.');
    }

    endpoint = '/anchor/session';
    body = { access_code: accessCode };
  } else {
    const invitationToken = params.get('invite');

    if (!invitationToken) {
      throw new Error(
        'This guest link has no invitation token. Ask the anchor for a new link.',
      );
    }

    endpoint = '/guest/session';
    body = {
      name: guestNameInput.value.trim() || 'Browser Guest',
      invitation_token: invitationToken,
    };
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Could not obtain ${role} credentials (${response.status}): ${errorBody}`,
    );
  }

  return response.json();
}

async function joinStudio() {
  if (joining || room) return;

  joining = true;
  joinBtn.disabled = true;
  setStatus('Connecting...');

  const newRoom = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  room = newRoom;

  try {
    newRoom.on(
      RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        const label = participant.name || participant.identity;

        if (track.kind === 'video') {
          addVideo(track, remoteVideo, label);
        } else if (track.kind === 'audio') {
          const audioElement = track.attach();
          audioElement.dataset.trackSid = publication.trackSid;
          document.body.appendChild(audioElement);
        }
      },
    );

    newRoom.on(RoomEvent.TrackUnsubscribed, removeTrack);

    newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
      setStatus(`${participant.name || participant.identity} joined`);
    });

    newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setStatus(`${participant.name || participant.identity} left`);
    });

    const credentials = await getCredentials();

    if (
      role === 'anchor' &&
      credentials.room_name !== ROOM_NAME
    ) {
      throw new Error('The backend returned an unexpected room.');
    }

    sessionToken =
      role === 'anchor' ? credentials.session_token : null;

    await newRoom.connect(
      credentials.server_url,
      credentials.livekit_token,
    );

    console.log('[GPNBIHAR] Connected:', newRoom.name);
    console.log(
      '[GPNBIHAR] Identity:',
      newRoom.localParticipant.identity,
    );

    await newRoom.localParticipant.setCameraEnabled(true);
    await newRoom.localParticipant.setMicrophoneEnabled(true);

    for (const publication of
      newRoom.localParticipant.videoTrackPublications.values()) {
      if (publication.track) {
        addVideo(publication.track, localVideo, 'YOU');
      }
    }

    micEnabled = true;
    cameraEnabled = true;
    micBtn.textContent = 'Mute microphone';
    cameraBtn.textContent = 'Turn camera off';

    micBtn.disabled = false;
    cameraBtn.disabled = false;
    leaveBtn.disabled = false;

    if (role === 'anchor') {
    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
  }
    setStatus(
      role === 'anchor'
        ? 'Anchor connected — waiting for guests'
        : 'Guest connected to the studio',
    );
  } catch (error) {
    console.error('[GPNBIHAR] Join failed:', error);

    const failedRoom = room;
    room = undefined;

    try {
      await failedRoom?.disconnect();
    } catch (cleanupError) {
      console.error('[GPNBIHAR] Cleanup failed:', cleanupError);
    }

    localVideo.replaceChildren();
    remoteVideo.replaceChildren();
    document.querySelectorAll('audio[data-track-sid]').forEach((el) => el.remove());

    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    micBtn.disabled = true;
    cameraBtn.disabled = true;
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = true;

    setStatus(`Connection failed: ${error.message || String(error)}`);
  } finally {
    joining = false;
  }
}

async function leaveStudio() {
  if (activeEgressId) {
  setRecordingStatus('Stop the recording before leaving the studio.');
  return;
}
  const oldRoom = room;
  room = undefined;

  if (oldRoom) {
    await oldRoom.disconnect();
  }

  localVideo.replaceChildren();
  remoteVideo.replaceChildren();
  document.querySelectorAll('audio[data-track-sid]').forEach((el) => el.remove());

  sessionToken = null;
  micEnabled = true;
  cameraEnabled = true;

  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  micBtn.disabled = true;
  cameraBtn.disabled = true;

  clearStatusPolling();
  sessionToken = null;
  activeEgressId = null;
  recordingBusy = false;
  startRecordingBtn.disabled = true;
  stopRecordingBtn.disabled = true;
  setRecordingStatus('Recording not started');

  setStatus('Ready to start');
}

joinBtn.addEventListener('click', joinStudio);
leaveBtn.addEventListener('click', leaveStudio);

micBtn.addEventListener('click', async () => {
  if (!room) return;

  micEnabled = !micEnabled;
  await room.localParticipant.setMicrophoneEnabled(micEnabled);
  micBtn.textContent = micEnabled
    ? 'Mute microphone'
    : 'Unmute microphone';
});

cameraBtn.addEventListener('click', async () => {
  if (!room) return;

  cameraEnabled = !cameraEnabled;
  await room.localParticipant.setCameraEnabled(cameraEnabled);
  cameraBtn.textContent = cameraEnabled
    ? 'Turn camera off'
    : 'Turn camera on';

  if (!cameraEnabled) {
    localVideo.replaceChildren();
  } else {
    for (const publication of
      room.localParticipant.videoTrackPublications.values()) {
      if (publication.track) {
        addVideo(publication.track, localVideo, 'YOU');
      }
    }
  }
});


inviteBtn.addEventListener('click', async () => {
  if (role !== 'anchor' || !sessionToken || !room) {
    setStatus('Join the studio as anchor before inviting guests.');
    return;
  }

  inviteBtn.disabled = true;
  setStatus('Generating a secure guest invitation...');

  try {
    const response = await fetch(`${API_BASE}/guest/invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Could not create invitation (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json();

    const inviteUrl = new URL(window.location.href);
    inviteUrl.search = '';
    inviteUrl.searchParams.set('role', 'guest');
    inviteUrl.searchParams.set('invite', data.invitation_token);

    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      setStatus(
        'Reusable guest link copied. Share it with all guests; it expires in 4 hours.',
      );
    } catch {
      window.prompt(
        'Copy this reusable guest invitation link. Share it with all guests; it expires in 4 hours:',
        inviteUrl.toString(),
      );
      setStatus('Guest invitation generated.');
    }
  } catch (error) {
    console.error('[GPNBIHAR] Invitation creation failed:', error);
    setStatus(`Could not create invitation: ${error.message}`);
  } finally {
    inviteBtn.disabled = false;
  }
});