// Store references to media elements that were playing
let playingMedia = new Set();

// Flag to identify if this is a YouTube tab
const isYouTubeTab = window.location.hostname.includes('youtube.com');

// Listen for messages from other YouTube tabs
if (isYouTubeTab) {
  // When this tab becomes active, tell other YouTube tabs to pause
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "youtubeTabActivated" && message.tabId !== chrome.runtime.id) {
      // Another YouTube tab was activated, pause this one if playing
      pauseAllMedia();
    }
    return true;
  });
}

// Function to pause all playing media
function pauseAllMedia() {
  playingMedia.clear(); // Clear the set before adding new elements
  let mediaPaused = false;
  
  // Find all video and audio elements in the page
  const mediaElements = [...document.querySelectorAll('video, audio')];
  
  mediaElements.forEach(media => {
    // Check if the media is actually playing
    if (!media.paused && !media.ended && media.currentTime > 0) {
      playingMedia.add(media);
      media.pause();
      mediaPaused = true;
    }
  });
  
  // Handle YouTube specifically (it uses a custom player)
  if (isYouTubeTab) {
    const youtubePlayer = document.querySelector('.html5-video-player');
    if (youtubePlayer) {
      const videoElement = document.querySelector('video.html5-main-video');
      if (videoElement && !videoElement.paused) {
        playingMedia.add(videoElement);
        
        // Try the pause button first (more reliable on YouTube)
        const pauseButton = document.querySelector('.ytp-play-button');
        if (pauseButton && pauseButton.getAttribute('aria-label') === 'Pause') {
          pauseButton.click();
          mediaPaused = true;
        } else {
          // Fallback to direct pause
          videoElement.pause();
          mediaPaused = true;
        }
      }
    }
  }
  
  // Handle Spotify Web Player
  if (window.location.hostname.includes('spotify.com')) {
    const playButton = document.querySelector('[data-testid="control-button-playpause"]');
    if (playButton && playButton.getAttribute('aria-label') === 'Pause') {
      playButton.click();
      // We'll handle this differently since we can't directly access the audio element
      playingMedia.add('spotify-web-player');
      mediaPaused = true;
    }
  }
  
  return mediaPaused;
}

// Function to resume previously playing media
function resumeAllMedia() {
  // If this is a YouTube tab, try to resume YouTube-specific way first
  if (isYouTubeTab && playingMedia.size === 0) {
    // Try to find and play the main video even if we didn't explicitly pause it
    const videoElement = document.querySelector('video.html5-main-video');
    const youtubePlayer = document.querySelector('.html5-video-player');
    
    if (videoElement && youtubePlayer) {
      // Check if the video is paused and should be played
      if (videoElement.paused && videoElement.currentTime > 0) {
        // Try the play button first (more reliable on YouTube)
        const playButton = document.querySelector('.ytp-play-button');
        if (playButton && playButton.getAttribute('aria-label') === 'Play') {
          playButton.click();
          return; // We've handled it
        }
        
        // Fallback to direct play
        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('YouTube auto-play was prevented:', error);
          });
        }
        return; // We've handled it
      }
    }
  }
  
  // Handle regular media elements that we've tracked
  playingMedia.forEach(media => {
    // Handle Spotify Web Player special case
    if (media === 'spotify-web-player') {
      const playButton = document.querySelector('[data-testid="control-button-playpause"]');
      if (playButton && playButton.getAttribute('aria-label') === 'Play') {
        playButton.click();
      }
      return;
    }
    
    // Only try to play if the media element still exists in the DOM
    if (document.contains(media)) {
      const playPromise = media.play();
      
      // Handle the play promise to avoid uncaught promise errors
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log('Auto-play was prevented:', error);
          
          // If this is a YouTube video, try clicking the play button as fallback
          if (isYouTubeTab && media.tagName === 'VIDEO') {
            const playButton = document.querySelector('.ytp-play-button');
            if (playButton && playButton.getAttribute('aria-label') === 'Play') {
              playButton.click();
            }
          }
        });
      }
    }
  });
  
  // If we didn't find any tracked media but we're on a page with media, try to resume anyway
  if (playingMedia.size === 0) {
    const mediaElements = [...document.querySelectorAll('video, audio')];
    
    mediaElements.forEach(media => {
      // Only try to resume media that appears to have been playing before
      if (media.paused && media.currentTime > 0 && !media.ended) {
        const playPromise = media.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Auto-play was prevented for untracked media:', error);
          });
        }
      }
    });
  }
  
  playingMedia.clear();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pauseMedia") {
    const mediaPaused = pauseAllMedia();
    sendResponse({ mediaPaused });
  } else if (message.action === "resumeMedia") {
    resumeAllMedia();
    sendResponse({ mediaResumed: true });
  }
  return true; // Keep the message channel open for the async response
});

// Also listen for visibility changes in the page itself
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const mediaPaused = pauseAllMedia();
    if (mediaPaused) {
      // Notify the background script that media was paused in this tab
      chrome.runtime.sendMessage({ 
        action: "mediaPaused", 
        tabId: chrome.runtime.id // Use runtime ID as a unique identifier
      });
    }
  } else {
    // When the page becomes visible again, check if we should resume
    chrome.runtime.sendMessage({ action: "shouldResumeMedia" }, (response) => {
      if (response && response.shouldResume) {
        resumeAllMedia();
      }
    });
  }
});