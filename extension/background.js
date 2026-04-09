// DocHub Extension — Background Service Worker (MV3)
// Minimal: just keeps the extension alive and handles any future message passing

chrome.runtime.onInstalled.addListener(() => {
  console.log("DocHub extension installed")
})
