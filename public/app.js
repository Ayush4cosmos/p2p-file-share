const socket = io();
let peerConnection;
let dataChannel;
let myId = null;
let peerId = null;
let selectedFile = null;
let receivedChunks = [];

let iceQueue = [];
let isRemoteDescriptionSet = false;

socket.emit('get-id');
socket.on('your-id', id => {
  myId = id;
  const myIdSpan = document.getElementById('myId');
  if (myIdSpan) myIdSpan.textContent = id;

  const myTransferIdInput = document.getElementById('myTransferId');
  if (myTransferIdInput) myTransferIdInput.value = id;
});


document.getElementById('connectBtn').onclick = async () => {
  peerId = document.getElementById('peerId').value;
  peerConnection = new RTCPeerConnection();
  dataChannel = peerConnection.createDataChannel('file');
  setupConnection(peerConnection, dataChannel);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('signal', { to: peerId, data: { offer }, from: myId });
  document.getElementById('connection-status').textContent = 'Calling ' + peerId;
};

socket.on('signal', async ({ from, data }) => {
  if (data.offer) {
    peerId = from;

    const incomingDiv = document.getElementById('incomingRequest');
    incomingDiv.innerHTML = '';
    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = `Click here to receive call from ${peerId}`;
    acceptBtn.style.padding = '10px';
    acceptBtn.style.backgroundColor = 'green';
    acceptBtn.style.color = 'white';
    acceptBtn.style.border = 'none';
    acceptBtn.style.borderRadius = '5px';
    acceptBtn.style.cursor = 'pointer';

    acceptBtn.onclick = async () => {
      incomingDiv.style.display = 'none';

      // ✅ Init peerConnection with STUN server
      peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupConnection(peerConnection, dataChannel);
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', { to: peerId, data: { ice: event.candidate }, from: myId });
        }
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      isRemoteDescriptionSet = true;

      // ✅ Apply any queued ICE candidates
      for (const ice of iceQueue) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(ice));
      }
      iceQueue = [];

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { to: peerId, data: { answer }, from: myId });
    };

    incomingDiv.appendChild(acceptBtn);
    incomingDiv.style.display = 'block';

  } else if (data.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    isRemoteDescriptionSet = true;

    for (const ice of iceQueue) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(ice));
    }
    iceQueue = [];

  } else if (data.ice) {
    if (peerConnection && isRemoteDescriptionSet) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.ice));
    } else {
      iceQueue.push(data.ice); // ✅ Queue if not ready
      console.warn("❗ ICE queued: peerConnection not ready yet.");
    }
  }
});


function setupConnection(pc, dc) {
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', { to: peerId, data: { ice: candidate }, from: myId });
    }
  };

 dc.onopen = () => {
  document.getElementById('connect-ui').style.display = 'none';
  document.getElementById('transfer-ui').style.display = 'flex';

  // ✅ Directly update input fields
  document.getElementById('myTransferId').value = myId;
  document.getElementById('peerTransferId').value = peerId;

  // ✅ Also update legacy ID info section
  document.getElementById('idInfo').innerHTML = `
    🆔 Your ID: <b>${myId}</b><br>
    🤝 Connected to: <b>${peerId}</b>
  `;
};





  dc.onmessage = async (event) => {
  if (typeof event.data === 'string') {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'chat') {
        displayChatMessage(msg.message, 'peer');
        return;
      }

      if (msg.done) {
        const blob = new Blob(receivedChunks);
        addFileToList('download-list', msg.fileName, 'download', blob);
        receivedChunks = [];
        return;
      }

    } catch (e) {
      console.warn("Non-JSON message received:", event.data);
    }
  } else {
    receivedChunks.push(event.data);
  }
};



  document.getElementById('fileInput').onchange = () => {
    selectedFile = document.getElementById('fileInput').files[0];
    if (selectedFile) {
      addFileToList('upload-list', selectedFile.name, 'upload');
    }
  };

  document.getElementById('uploadFileBtn').onclick = () => {
    if (!selectedFile || !dataChannel) return;

    const chunkSize = 16 * 1024;
    let offset = 0;
    const reader = new FileReader();
    const fileName = selectedFile.name;

    function sendChunk() {
      if (offset < selectedFile.size) {
        const slice = selectedFile.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
      } else {
        dataChannel.send(JSON.stringify({ done: true, fileName }));
      }
    }

    reader.onloadend = () => {
      dataChannel.send(reader.result);
      offset += chunkSize;
      sendChunk();
    };

    sendChunk();
  };
}

function addFileToList(containerId, fileName, type, blob = null) {
  const container = document.getElementById(containerId);
  const item = document.createElement('div');
  item.style.display = 'flex';
  item.style.justifyContent = 'space-between';
  item.style.alignItems = 'center';
  item.style.margin = '4px 0';

  const nameSpan = document.createElement('span');
  nameSpan.textContent = fileName;
  item.appendChild(nameSpan);

  if (type === 'download') {
    const button = document.createElement('button');
    button.textContent = '⬇';

    if (blob) {
      const url = URL.createObjectURL(blob);
      button.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
      };
    }

    item.appendChild(button);
  }

  container.appendChild(item);
}
// ✅ Chat functionality
function displayChatMessage(msg, who) {
  const container = document.getElementById('chat-messages');
  const msgEl = document.createElement('div');
  msgEl.textContent = `${who === 'self' ? '🧑 You' : '👤 Peer'}: ${msg}`;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chatSend').onclick = () => {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || !dataChannel) return;

  const msgObj = { type: 'chat', message };
  dataChannel.send(JSON.stringify(msgObj));
  displayChatMessage(message, 'self');
  input.value = '';
};
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // allow newline
      return;
    }
    e.preventDefault();
    document.getElementById('chatSend').click();
  }
});


