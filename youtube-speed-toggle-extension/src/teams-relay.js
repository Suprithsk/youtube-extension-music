// Passes share start/stop from teams-hook.js to the background worker.
// While a share is running, this frame holds a port open; the background
// treats an open port as "sharing". If the tab is closed or reloaded the port
// drops on its own, so a share can never be left stuck "on".
let port = null;
let sharing = false;

const connect = () => {
    if (!chrome.runtime?.id) return; // extension was reloaded; this script is orphaned
    try {
        port = chrome.runtime.connect({ name: 'teams-share' });
    } catch {
        port = null;
        return;
    }
    // The service worker can be shut down mid-share. Reconnect so it relearns the state.
    port.onDisconnect.addListener(() => {
        port = null;
        if (sharing) setTimeout(connect, 500);
    });
};

window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.__ytBlurShare !== true) return;

    sharing = event.data.sharing === true;
    if (sharing && !port) connect();
    if (!sharing && port) {
        port.disconnect();
        port = null;
    }
});
