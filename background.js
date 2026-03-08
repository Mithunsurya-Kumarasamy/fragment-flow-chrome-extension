
chrome.downloads.onCreated.addListener((downloadItem) => {
    console.log("Fragment Flow detected a new download:", downloadItem.url);

    chrome.downloads.pause(downloadItem.id, () => {
        console.log("Default download paused. Ready for parallel processing.");
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received from Popup:", message.action);

    if (message.action === "getStatus") {
        // Sends initial state when the popup opens
        sendResponse({ status: "Manager Active", threads: 4 });
    } 
    else if (message.action === "testConnection") {
        // This is what the 'Check Connection' button is looking for!
        console.log("Handshake successful. Communication bridge active.");
        sendResponse({ success: true });
    }

    return true;
});