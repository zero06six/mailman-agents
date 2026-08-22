// Dashboard Bridge: Stateless messaging to survive Service Worker suspension

// UI -> Background
window.addEventListener('AI_COUNCIL_SEND', function(e) {
    var data = JSON.parse(e.detail);

    chrome.runtime.sendMessage({ type: 'START_DYNAMIC_BRIDGE', payload: data }).catch(err => console.log(err));
});

window.addEventListener('AI_COUNCIL_ABORT', function() {

    chrome.runtime.sendMessage({ type: 'ABORT_PIPELINE' }).catch(() => {});
});

window.addEventListener('AI_COUNCIL_SETUP', function(e) {
    var data = JSON.parse(e.detail);

    chrome.runtime.sendMessage({ type: 'START_SETUP', payload: data }).catch(err => console.log(err));
});

window.addEventListener('AI_COUNCIL_SILENT_UPDATE', function(e) {
    var data = JSON.parse(e.detail);

    chrome.runtime.sendMessage({ type: 'SILENT_UPDATE', payload: data }).catch(err => console.log(err));
});

// Background -> UI
chrome.runtime.onMessage.addListener(function(msg) {

    if (msg.type === 'SETUP_COMPLETE') {
        window.dispatchEvent(new CustomEvent('AI_COUNCIL_SETUP_COMPLETE'));
    } else if (msg.type === 'NODE_SKIPPED') {
        window.dispatchEvent(new CustomEvent('AI_COUNCIL_NODE_SKIPPED', { detail: JSON.stringify(msg.data) }));
    } else if (msg.type === 'NODE_UPDATE') {
        window.dispatchEvent(new CustomEvent('AI_COUNCIL_NODE_UPDATE', { detail: JSON.stringify(msg.data) }));
    } else if (msg.type === 'FINAL_RESPONSE') {
        window.dispatchEvent(new CustomEvent('AI_COUNCIL_FINAL_RESPONSE', { detail: JSON.stringify(msg.data) }));
    } else if (msg.type === 'PIPELINE_ERROR') {
        window.dispatchEvent(new CustomEvent('AI_COUNCIL_PIPELINE_ERROR', { detail: JSON.stringify({ error: msg.error }) }));
    }
});



