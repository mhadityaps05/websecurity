// background.js

console.log("Background service worker running")

// Track redirects
let redirectCount = 0
let currentUrl = ""

// Listen for web navigation
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    // Main frame only
    if (currentUrl && details.url !== currentUrl) {
      redirectCount++
    }
    currentUrl = details.url
  }
})

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background menerima:", message)

  if (message.type === "GET_DATA") {
    sendResponse({
      status: "ok",
      data: {
        message: "Data from background",
        redirectCount: redirectCount,
      },
    })
  }

  if (message.type === "PAGE_LOADED") {
    // Simpan data ke storage
    chrome.storage.local.set({
      lastPageData: message.data,
      timestamp: Date.now(),
    })
  }

  if (message.type === "GET_REDIRECT_COUNT") {
    sendResponse({ count: redirectCount })
  }

  if (message.type === "GET_COOKIES") {
    console.log("🔥 GET_COOKIES DIPANGGIL")

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        console.log("❌ Tidak ada tab aktif")
        sendResponse({ status: "error" })
        return
      }

      const url = tabs[0].url
      console.log("🌐 URL:", url)

      chrome.cookies.getAll({}, (cookies) => {
        const domain = new URL(url).hostname

        const filteredCookies = cookies.filter((c) =>
          domain.includes(c.domain.replace(".", "")) ||
          c.domain.includes(domain)
        )

        console.log("🎯 FILTERED:", filteredCookies.length)

        // 🔥 FORMAT SESUAI BACKEND
        const formatted = filteredCookies.map((c) => ({
          name: c.name,
          domain: c.domain,
        }))

        sendResponse({
          status: "ok",
          cookies: formatted,
          cookies_count: formatted.length, // 🔥 penting
        })
      })
    })

    return true
  }
  return true
})

// Reset redirect count saat tab berubah
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    redirectCount = 0
  }
})