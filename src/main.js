
import { Room, RoomEvent, TokenSource } from 'livekit-client';
import './style.css';

const TOKEN_SERVER_ID = 'gpnbihar-2g3stl';
const ROOM_NAME = 'gpnbihar-poc-room';

const statusEl = document.querySelector('#status');
const joinBtn = document.querySelector('#joinBtn');
const leaveBtn = document.querySelector('#leaveBtn');
const micBtn = document.querySelector('#micBtn');
const cameraBtn = document.querySelector('#cameraBtn');
const nameInput = document.querySelector('#guestName');
const localVideo = document.querySelector('#localVideo');
const remoteVideo = document.querySelector('#remoteVideo');

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

  if (TOKEN_SERVER_ID === 'YOUR_TOKEN_SERVER_ID') {
    setStatus('Add your development token server ID in src/main.js.');
    return;
  }

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

    const tokenSource =
      TokenSource.developmentTokenServer(TOKEN_SERVER_ID);

    const credentials = await tokenSource.fetch({
      roomName: ROOM_NAME,
      participantName: nameInput.value.trim() || 'Browser Guest',
      participantIdentity: `guest-${crypto.randomUUID()}`,
    });

    await newRoom.connect(
      credentials.serverUrl,
      credentials.participantToken,
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
    setStatus('Connected — waiting for anchor');
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

  setStatus('Ready to join');
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
