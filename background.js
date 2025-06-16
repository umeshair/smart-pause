// Track the currently active tab and tabs with paused media
let currentActiveTabId = null;
let autoResume = true; // Default setting for auto-resuming media
let tabsWithPausedMedia = new Map(); // Map to track tabs where media was paused by the extension
let youtubeTabIds = new Set(); // Set to track all YouTube tabs

// Initialize settings from storage or use defaults
chrome.storage.local.get(['autoResume'], (result) => {
  if (result.autoResume !== undefined) {
    autoResume = result.autoResume;
  }
});

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const previousTabId = currentActiveTabId;
  currentActiveTabId = activeInfo.tabId;
  
  // If there was a previously active tab, pause media on it and mark it
  if (previousTabId !== null && previousTabId !== currentActiveTabId) {
    chrome.tabs.sendMessage(previousTabId, { action: "pauseMedia" }, (response) => {
      // If we got a response that media was paused, mark this tab
      if (response && response.mediaPaused) {
        tabsWithPausedMedia.set(previousTabId, Date.now());
      }
    }).catch(error => console.log("Error sending message to tab:", error));
  }
  
  // Always try to resume media on the newly activated tab if it was previously paused by us
  if (tabsWithPausedMedia.has(currentActiveTabId)) {
    chrome.tabs.sendMessage(currentActiveTabId, { action: "resumeMedia" })
      .catch(error => console.log("Error sending message to tab:", error));
    
    // Remove this tab from our tracking map
    tabsWithPausedMedia.delete(currentActiveTabId);
  }
  // If auto-resume is enabled but the tab wasn't in our tracking map, still try to resume
  else if (autoResume) {
    chrome.tabs.sendMessage(currentActiveTabId, { action: "resumeMedia" })
      .catch(error => console.log("Error sending message to tab:", error));
  }
  
  // Check if this is a YouTube tab and notify other YouTube tabs
  checkAndRegisterYouTubeTab(currentActiveTabId);
  notifyOtherYouTubeTabs(currentActiveTabId);
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus, pause media in the current active tab
    if (currentActiveTabId !== null) {
      chrome.tabs.sendMessage(currentActiveTabId, { action: "pauseMedia" }, (response) => {
        // If we got a response that media was paused, mark this tab
        if (response && response.mediaPaused) {
          tabsWithPausedMedia.set(currentActiveTabId, Date.now());
        }
      }).catch(error => console.log("Error sending message to tab:", error));
    }
  } else {
    // Browser gained focus
    if (currentActiveTabId !== null) {
      // Always resume if this tab was paused by us
      if (tabsWithPausedMedia.has(currentActiveTabId)) {
        chrome.tabs.sendMessage(currentActiveTabId, { action: "resumeMedia" })
          .catch(error => console.log("Error sending message to tab:", error));
        
        // Remove this tab from our tracking map
        tabsWithPausedMedia.delete(currentActiveTabId);
        
        // If this is a YouTube tab, make sure other YouTube tabs are paused
        notifyOtherYouTubeTabs(currentActiveTabId);
      }
      // Otherwise, only resume if auto-resume is enabled
      else if (autoResume) {
        chrome.tabs.sendMessage(currentActiveTabId, { action: "resumeMedia" })
          .catch(error => console.log("Error sending message to tab:", error));
          
        // If this is a YouTube tab, make sure other YouTube tabs are paused
        notifyOtherYouTubeTabs(currentActiveTabId);
      }
    }
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSettings") {
    sendResponse({ autoResume });
  } else if (message.action === "updateSettings") {
    autoResume = message.autoResume;
    chrome.storage.local.set({ autoResume });
  } else if (message.action === "mediaPaused" && sender.tab) {
    // Content script is telling us media was paused in this tab
    tabsWithPausedMedia.set(sender.tab.id, Date.now());
  } else if (message.action === "shouldResumeMedia" && sender.tab) {
    // Content script is asking if it should resume media
    const shouldResume = tabsWithPausedMedia.has(sender.tab.id) || autoResume;
    if (tabsWithPausedMedia.has(sender.tab.id)) {
      tabsWithPausedMedia.delete(sender.tab.id);
    }
    sendResponse({ shouldResume });
  }
  return true;
});

// Function to check if a tab is a YouTube tab and register it
function checkAndRegisterYouTubeTab(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url && tab.url.includes('youtube.com')) {
      youtubeTabIds.add(tabId);
    }
  }).catch(error => {
    // Tab might not exist anymore, ignore the error
  });
}

// Function to notify other YouTube tabs when one becomes active
function notifyOtherYouTubeTabs(activeTabId) {
  // Check if the active tab is a YouTube tab
  chrome.tabs.get(activeTabId, (tab) => {
    if (tab && tab.url && tab.url.includes('youtube.com')) {
      // Send a message to all YouTube tabs except the active one
      youtubeTabIds.forEach(tabId => {
        if (tabId !== activeTabId) {
          chrome.tabs.sendMessage(tabId, { 
            action: "youtubeTabActivated", 
            tabId: activeTabId 
          }).catch(error => {
            // Tab might not exist anymore, remove it from our tracking
            youtubeTabIds.delete(tabId);
          });
        }
      });
    }
  }).catch(error => {
    // Tab might not exist anymore, ignore the error
  });
}

// Listen for tab updates to detect YouTube tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
    youtubeTabIds.add(tabId);
  }
});

// Listen for tab removals to clean up our YouTube tab tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  youtubeTabIds.delete(tabId);
});

// Initialize the current active tab when the extension starts
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs.length > 0) {
    currentActiveTabId = tabs[0].id;
    checkAndRegisterYouTubeTab(currentActiveTabId);
  }
});

// Initialize by finding all existing YouTube tabs
chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
  tabs.forEach(tab => {
    youtubeTabIds.add(tab.id);
  });
});