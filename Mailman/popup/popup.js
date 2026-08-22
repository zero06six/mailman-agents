document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const promptInput = document.getElementById('initial-prompt');
  const statusText = document.getElementById('status-text');
  const resetBtn = document.getElementById('reset-btn');

  // Load saved state if any
  chrome.storage.local.get(['bridgeState', 'bridgeStatus', 'bridgeOriginalPrompt'], (result) => {
    if (result.bridgeStatus) {
      statusText.textContent = result.bridgeStatus;
    }
    if (result.bridgeState && result.bridgeState !== 'idle') {
      startBtn.disabled = true;
    }
    if (result.bridgeOriginalPrompt) {
      promptInput.value = result.bridgeOriginalPrompt;
    }
  });

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
      statusText.textContent = message.status;
      if (message.status === 'Finished!' || message.status.startsWith('Error') || message.status === 'Reset manually.') {
        startBtn.disabled = false;
      }
    }
  });

  startBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert('Please enter a prompt first.');
      return;
    }

    startBtn.disabled = true;
    statusText.textContent = 'Starting...';

    // Start the process by sending a message to background.js
    chrome.runtime.sendMessage({
      type: 'START_BRIDGE',
      prompt: prompt
    });
  });

  resetBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RESET_BRIDGE' });
    startBtn.disabled = false;
    statusText.textContent = 'Reset manually.';
  });
});
