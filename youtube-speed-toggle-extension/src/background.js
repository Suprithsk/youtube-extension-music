const togglePlaybackSpeed = (tab) => {
    chrome.tabs.sendMessage(tab.id, { action: "toggleSpeed" });
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.commands.onCommand.addListener((command) => {
        if (command === "toggle-speed") {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                togglePlaybackSpeed(tabs[0]);
            });
        }
    });
});