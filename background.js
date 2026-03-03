
chrome.downloads.onCreated.addListener((downloadItem) => {
    console.log("Fragment Flow detected a new download:", downloadItem.url);

    // 2. Immediately pause the default manager to prevent double-downloading
    chrome.downloads.pause(downloadItem.id, () => {
        console.log("Default download paused. Ready for parallel processing.");
    });
});

// 3. Listen for messages from the popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getStatus") {
        sendResponse({ status: "Manager Active", threads: 4 });
    }
});