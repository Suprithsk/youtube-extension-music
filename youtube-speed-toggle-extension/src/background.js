chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-speed") {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
                // Fails silently if the active tab isn't YouTube (no content script there)
                chrome.tabs.sendMessage(tab.id, { action: "toggleSpeed" }).catch(() => {});
            }
        });
    }
});
