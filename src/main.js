
import { Room, RoomEvent } from 'livekit-client';import './style.css';

const statusEl = document.querySelector('#status');
const joinBtn = document.querySelector('#joinBtn');
const leaveBtn = document.querySelector('#leaveBtn');
const micBtn = document.querySelector('#micBtn');
const cameraBtn = document.querySelector('#cameraBtn');
const localVideo = document.querySelector('#localVideo');
const remoteVideo = document.querySelector('#remoteVideo');

const API_BASE = 'https://gpnbihar-backend.onrender.com';

let sessionToken = null;
let roomName = null;
let anchorIdentity = null;

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
    // Register event listeners before connecting.
    newRoom.on(
      RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        const label = participant.name || participant.identity;

        if (track.kind === 'video') {
          addVideo(track, remoteVideo, label);
        } else if (track.kind === 'audio') {
          // Attach remote audio so the guest can hear the anchor.
          const audioElement = track.attach();
          audioElement.dataset.trackSid = publication.trackSid;
          document.body.appendChild(audioElement);
        }
      },
    );

    newRoom.on(
      RoomEvent.TrackUnsubscribed,
      (track) => removeTrack(track),
    );

    newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
      setStatus(`${participant.name || participant.identity} joined`);
    });

    newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setStatus(`${participant.name || participant.identity} left`);
    });

    newRoom.on(RoomEvent.Disconnected, () => {
      setStatus('Disconnected');
    });

    const accessCodeInput = document.querySelector('#accessCode');

if (!accessCodeInput) {
  throw new Error('Access-code input not found in index.html.');
}

const accessCode = accessCodeInput.value.trim();

if (!accessCode) {
  throw new Error('Please enter the anchor access code.');
}

const response = await fetch(`${API_BASE}/anchor/session`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    access_code: accessCode,
  }),
});

if (!response.ok) {
  const errorBody = await response.text();
  throw new Error(
    `Anchor authentication failed (${response.status}): ${errorBody}`,
  );
}

const credentials = await response.json();

sessionToken = credentials.session_token;
roomName = credentials.room_name;
anchorIdentity = credentials.identity;

await newRoom.connect(
  credentials.server_url,
  credentials.livekit_token,
);



    console.log('[GPNBIHAR] Connected to room:', newRoom.name);
console.log(
  '[GPNBIHAR] Local identity:',
  newRoom.localParticipant.identity,
);
console.log(
  '[GPNBIHAR] Existing remote participants:',
  [...newRoom.remoteParticipants.values()].map((p) => ({
    identity: p.identity,
    name: p.name,
  })),
);

setStatus(
  `Connected to ${newRoom.name}. Remotes: ${newRoom.remoteParticipants.size}`,
);

    await newRoom.localParticipant.setCameraEnabled(true);
    await newRoom.localParticipant.setMicrophoneEnabled(true);

    // Show the guest's own camera preview without playing their mic locally.
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
    setStatus('Anchor connected — waiting for guests');
  } catch (error) {
    console.error('[GPNBIHAR] Join failed:', error);

    // Clean up the failed connection without hiding the error.
    const failedRoom = room;
    room = undefined;

    try {
      await failedRoom?.disconnect();
    } catch (cleanupError) {
      console.error('[GPNBIHAR] Cleanup failed:', cleanupError);
    }

    localVideo.replaceChildren();
    remoteVideo.replaceChildren();

    document.querySelectorAll('audio[data-track-sid]').forEach((el) => {
      el.remove();
    });

    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    micBtn.disabled = true;
    cameraBtn.disabled = true;

    setStatus(`Connection failed: ${error?.message ?? String(error)}`);
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

  // Remove any remote audio elements left attached to the document.
  document.querySelectorAll('audio[data-track-sid]').forEach((el) => {
    el.remove();
  });

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
