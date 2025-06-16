// Initialize the popup with current settings
document.addEventListener('DOMContentLoaded', () => {
  const autoResumeCheckbox = document.getElementById('autoResume');
  
  // Get current settings from the background script
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (response && response.autoResume !== undefined) {
      autoResumeCheckbox.checked = response.autoResume;
    }
  });
  
  // Listen for changes to the auto-resume setting
  autoResumeCheckbox.addEventListener('change', () => {
    chrome.runtime.sendMessage({ 
      action: 'updateSettings',
      autoResume: autoResumeCheckbox.checked
    });
  });
});