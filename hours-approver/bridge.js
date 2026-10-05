// Runs inside claude.ai pages (all frames). It stays silent unless Droplet (or the older
// Action Desk artifact) says hello, then hands over the approval reports waiting in the extension.
//
//   page   → { source: 'droplet' | 'action-desk', type: 'hello' }
//   bridge → { source: 'sf-approver', type: 'reports', reports: [...] }
//   page   → { source: 'droplet' | 'action-desk', type: 'ack', ids: [...] }   (after storing them)
//   page   → { source: 'droplet', type: 'done', ids: [...] }                  (its reminder run finished)
//
// background.js also pushes new reports here the moment a run finishes, so the page
// doesn't wait for its next hello.

(() => {
  const PAGES = ['droplet', 'action-desk'];
  let deskHere = false; // only frames where the page said hello get reports

  async function sendReports() {
    const { reports = [] } = await chrome.runtime.sendMessage({ action: 'bridgePending' }) || {};
    window.postMessage({ source: 'sf-approver', type: 'reports', reports }, '*');
  }

  async function onMessage(e) {
    if (e.source !== window || !e.data || !PAGES.includes(e.data.source)) return;
    // After an extension reload this copy is cut off from the extension: step aside for the new one.
    if (!chrome.runtime?.id) { window.removeEventListener('message', onMessage); return; }
    try {
      if (e.data.type === 'hello') { deskHere = true; await sendReports(); }
      if (e.data.type === 'ack' && Array.isArray(e.data.ids)) {
        await chrome.runtime.sendMessage({ action: 'bridgeAck', ids: e.data.ids.map(String) });
      }
      if (e.data.type === 'done' && Array.isArray(e.data.ids)) {
        await chrome.runtime.sendMessage({ action: 'bridgeDone', ids: e.data.ids.map(String) });
      }
    } catch { /* extension reloaded mid-call: the next hello reaches the new copy */ }
  }

  // Injected again on extension update: replace the previous copy's listener.
  if (window.__sfApproverBridge) window.removeEventListener('message', window.__sfApproverBridge);
  window.__sfApproverBridge = onMessage;
  window.addEventListener('message', onMessage);

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'pushReports' && deskHere) sendReports().catch(() => {});
  });
})();
