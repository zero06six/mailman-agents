let audioContext = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_CAPTURE') {
    navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: message.streamId
        }
      }
    }).then((stream) => {
      if (!audioContext) {
        audioContext = new AudioContext();
      }
      
      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; 
      
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

    }).catch((err) => console.error('Capture failed:', err));
  }
});

