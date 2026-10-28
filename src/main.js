
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

function setStatus(message) {
  statusEl.textContent = message;
}

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
    endpoint = '/guest/session';
    body = {
      name: guestNameInput.value.trim() || 'Browser Guest',
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

    setStatus(`Connection failed: ${error.message || String(error)}`);
  } finally {
    joining = false;
  }
}

async function leaveStudio() {
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
  const inviteUrl = new URL(window.location.href);
  inviteUrl.search = '';
  inviteUrl.searchParams.set('role', 'guest');

  try {
    await navigator.clipboard.writeText(inviteUrl.toString());
    setStatus('Guest invitation link copied');
  } catch (error) {
    console.error('[GPNBIHAR] Copy link failed:', error);
    window.prompt('Copy this guest invitation link:', inviteUrl.toString());
  }
});
