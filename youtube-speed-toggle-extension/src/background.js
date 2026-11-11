// Session storage is cleared when the browser closes, so a share can't leave
// YouTube blurred across restarts. Content scripts need explicit access to it.
const allowContentScripts = () =>
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
allowContentScripts();
chrome.runtime.onStartup.addListener(allowContentScripts);
chrome.runtime.onInstalled.addListener(allowContentScripts);

chrome.commands.onCommand.addListener((command) => {
    if (command === "cycle-speed") {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
                // Fails silently if the active tab isn't YouTube (no content script there)
                chrome.tabs.sendMessage(tab.id, { action: "cycleSpeed" }).catch(() => {});
            }
        });
    }

    if (command === "toggle-blur") {
        // Every YouTube tab watches this key and flips its blur.
        chrome.storage.session.set({ blurToggleAt: Date.now() });
    }
});

// --- Teams screen-share detection --------------------------------------------

// Each Teams frame that is sharing holds a port open (see teams-relay.js).
const sharers = new Set();
const publishSharing = () => chrome.storage.session.set({ teamsSharing: sharers.size > 0 });

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'teams-share') return;
    sharers.add(port);
    publishSharing();
    port.onDisconnect.addListener(() => {
        sharers.delete(port);
        publishSharing();
    });
});

// If this worker was restarted mid-share, sharing frames reconnect within a
// second. Once they've had time to, correct the stored state, so a share that
// ended while the worker was down doesn't leave YouTube blurred.
setTimeout(publishSharing, 3000);
