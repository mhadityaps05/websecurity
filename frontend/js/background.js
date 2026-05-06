// background.js

console.log("Background service worker running")

const BASE_URL = "http://localhost:8000"
const SCAN_DEBOUNCE_MS = 900
const RESCAN_COOLDOWN_MS = 8000

const scanTimers = new Map()
const lastScanByTab = new Map()
const redirectCounts = new Map()
const currentUrls = new Map()
const notificationTabs = new Map()

function isScannableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url)
}

function getHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url || "Unknown website"
  }
}

function chromeStorageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve)
  })
}

function chromeStorageSet(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve)
  })
}

function getCookiesForUrl(url) {
  return new Promise((resolve) => {
    if (!isScannableUrl(url)) {
      resolve({ cookies: [], cookies_count: 0 })
      return
    }

    chrome.cookies.getAll({ url }, (cookies = []) => {
      const formatted = cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
      }))

      resolve({
        cookies: formatted,
        cookies_count: formatted.length,
      })
    })
  })
}

function collectPageData() {
  async function checkPermission(name) {
    try {
      const result = await navigator.permissions.query({ name })
      return result.state
    } catch {
      return "unsupported"
    }
  }

  function getThirdPartyDomains() {
    const domains = new Set()

    document.querySelectorAll("script, img, iframe, link").forEach((el) => {
      const src = el.src || el.href
      if (!src) return

      try {
        const resourceUrl = new URL(src)
        if (resourceUrl.hostname !== location.hostname) {
          domains.add(resourceUrl.hostname)
        }
      } catch {}
    })

    return Array.from(domains)
  }

  return Promise.all([
    checkPermission("geolocation"),
    checkPermission("notifications"),
    checkPermission("camera"),
    checkPermission("microphone"),
  ]).then(([geolocation, notifications, camera, microphone]) => ({
    url: location.href,
    is_https: location.protocol === "https:",
    iframe_count: document.querySelectorAll("iframe").length,
    third_party_domains: getThirdPartyDomains(),
    tracker_count: document.querySelectorAll(
      "script[src*='track'], script[src*='analytics']",
    ).length,
    permissions: {
      geolocation,
      notifications,
      camera,
      microphone,
    },
    domain_age_days: 0,
    ip_address: "Unknown",
  }))
}

async function collectWebsiteData(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectPageData,
  })

  return result?.result
}

async function analyzeWebsite(payload) {
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Backend response ${response.status}`)
  }

  return response.json()
}

async function saveScanResult(result) {
  if (!result?.url) return

  const historyItem = {
    url: result.url,
    score: result.final_score,
    status: result.status,
    reasons: result.analysis_details || [],
    time: Date.now(),
  }

  const stored = await chromeStorageGet(["scanHistory", "analysisHistory"])
  const scanHistory = stored.scanHistory || []
  const analysisHistory = stored.analysisHistory || []
  const isDuplicate = scanHistory.length > 0 && scanHistory[0].url === result.url

  const nextScanHistory = isDuplicate
    ? scanHistory
    : [historyItem, ...scanHistory].slice(0, 100)

  const shouldAlert = result.status === "Waspada" || result.status === "Berisiko"
  const nextAnalysisHistory = shouldAlert
    ? [historyItem, ...analysisHistory].slice(0, 100)
    : analysisHistory

  await chromeStorageSet({
    lastAnalysis: result,
    scanHistory: nextScanHistory,
    analysisHistory: nextAnalysisHistory,
  })
}

function setBadge(tabId, result) {
  if (!tabId) return

  if (!result) {
    chrome.action.setBadgeText({ tabId, text: "SCAN" })
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#0891b2" })
    chrome.action.setTitle({ tabId, title: "Web Security: scanning..." })
    return
  }

  const score = result.final_score ?? 0

  if (result.status === "Berisiko") {
    chrome.action.setBadgeText({ tabId, text: "!!" })
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#dc2626" })
  } else if (result.status === "Waspada") {
    chrome.action.setBadgeText({ tabId, text: "!" })
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" })
  } else {
    chrome.action.setBadgeText({ tabId, text: "OK" })
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#16a34a" })
  }

  chrome.action.setTitle({
    tabId,
    title: `Web Security: ${result.status} (${score}/100)`,
  })
}

function showBrowserNotification(tabId, result) {
  const score = result.final_score ?? 0
  const hostname = getHostname(result.url)
  const notificationId = `websecurity-${tabId}-${Date.now()}`

  notificationTabs.set(notificationId, tabId)

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "asset/shield-alert.svg",
    title: `Web Security: ${result.status}`,
    message: `${hostname} memiliki skor risiko ${score}/100.`,
    priority: result.status === "Berisiko" ? 2 : 1,
  })
}

async function showPageToast(tabId, result) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (scanResult) => {
        const existing = document.getElementById("websecurity-scan-toast")
        if (existing) existing.remove()

        const toast = document.createElement("div")
        const isDanger = scanResult.status === "Berisiko"
        const score = scanResult.final_score ?? 0
        const reason = scanResult.analysis_details?.[0] || "Ada sinyal risiko pada halaman ini"

        toast.id = "websecurity-scan-toast"
        toast.style.cssText = `
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 2147483647;
          width: 310px;
          max-width: calc(100vw - 36px);
          color: #f8fafc;
          background: ${isDanger ? "rgba(127, 29, 29, 0.96)" : "rgba(113, 63, 18, 0.96)"};
          border: 1px solid ${isDanger ? "rgba(252, 165, 165, 0.45)" : "rgba(253, 230, 138, 0.45)"};
          border-left: 4px solid ${isDanger ? "#ef4444" : "#f59e0b"};
          border-radius: 8px;
          box-shadow: 0 18px 36px rgba(2, 6, 23, 0.32);
          padding: 12px 14px;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          line-height: 1.4;
        `

        const title = document.createElement("div")
        title.textContent = `Web Security: ${scanResult.status}`
        title.style.cssText = "font-size: 13px; font-weight: 800; margin-bottom: 4px;"

        const scoreText = document.createElement("div")
        scoreText.textContent = `Skor risiko ${score}/100`
        scoreText.style.cssText = "font-size: 12px; opacity: 0.92;"

        const reasonText = document.createElement("div")
        reasonText.textContent = reason
        reasonText.style.cssText = "font-size: 11px; margin-top: 7px; opacity: 0.78;"

        toast.append(title, scoreText, reasonText)

        document.documentElement.appendChild(toast)

        setTimeout(() => {
          toast.style.transition = "opacity 180ms ease, transform 180ms ease"
          toast.style.opacity = "0"
          toast.style.transform = "translateY(-6px)"
          setTimeout(() => toast.remove(), 220)
        }, 6500)
      },
      args: [result],
    })
  } catch (error) {
    console.warn("Tidak bisa menampilkan toast halaman:", error)
  }
}

async function handleAlert(tabId, result) {
  if (result.status !== "Waspada" && result.status !== "Berisiko") return

  showBrowserNotification(tabId, result)
  await showPageToast(tabId, result)
}

async function scanTab(tabId, url) {
  if (!isScannableUrl(url)) return

  const previous = lastScanByTab.get(tabId)
  const now = Date.now()
  if (
    previous?.url === url &&
    now - previous.time < RESCAN_COOLDOWN_MS
  ) {
    return
  }

  lastScanByTab.set(tabId, { url, time: now })
  setBadge(tabId, null)

  try {
    const websiteData = await collectWebsiteData(tabId)
    if (!websiteData) return

    const cookieData = await getCookiesForUrl(url)
    const payload = {
      ...websiteData,
      ...cookieData,
      redirect_count: redirectCounts.get(tabId) || 0,
      domain_age_days: websiteData.domain_age_days || 0,
    }

    const result = await analyzeWebsite(payload)
    console.log("Auto scan result:", result)

    await saveScanResult(result)
    setBadge(tabId, result)
    await handleAlert(tabId, result)
  } catch (error) {
    console.error("Auto scan gagal:", error)
    chrome.action.setBadgeText({ tabId, text: "ERR" })
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#64748b" })
    chrome.action.setTitle({
      tabId,
      title: "Web Security: backend tidak tersedia atau halaman tidak bisa discan",
    })
  }
}

function scheduleScan(tabId, url) {
  if (!isScannableUrl(url)) {
    chrome.action.setBadgeText({ tabId, text: "" })
    return
  }

  if (scanTimers.has(tabId)) {
    clearTimeout(scanTimers.get(tabId))
  }

  const timer = setTimeout(() => {
    scanTimers.delete(tabId)
    scanTab(tabId, url)
  }, SCAN_DEBOUNCE_MS)

  scanTimers.set(tabId, timer)
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || !isScannableUrl(details.url)) return

  const previousUrl = currentUrls.get(details.tabId)
  if (previousUrl && previousUrl !== details.url) {
    redirectCounts.set(details.tabId, (redirectCounts.get(details.tabId) || 0) + 1)
  }

  currentUrls.set(details.tabId, details.url)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    redirectCounts.set(tabId, 0)
  }

  if (changeInfo.status === "complete" && isScannableUrl(tab.url)) {
    currentUrls.set(tabId, tab.url)
    scheduleScan(tabId, tab.url)
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (scanTimers.has(tabId)) {
    clearTimeout(scanTimers.get(tabId))
  }

  scanTimers.delete(tabId)
  lastScanByTab.delete(tabId)
  redirectCounts.delete(tabId)
  currentUrls.delete(tabId)
})

chrome.notifications.onClicked.addListener((notificationId) => {
  const tabId = notificationTabs.get(notificationId)
  if (tabId) {
    chrome.tabs.update(tabId, { active: true })
  }
  chrome.notifications.clear(notificationId)
  notificationTabs.delete(notificationId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background menerima:", message)

  if (message.type === "GET_DATA") {
    sendResponse({
      status: "ok",
      data: {
        message: "Data from background",
        redirectCount: redirectCounts.get(sender.tab?.id) || 0,
      },
    })
    return true
  }

  if (message.type === "PAGE_LOADED") {
    chrome.storage.local.set({
      lastPageData: message.data,
      timestamp: Date.now(),
    })
    return true
  }

  if (message.type === "GET_REDIRECT_COUNT") {
    sendResponse({ count: redirectCounts.get(sender.tab?.id) || 0 })
    return true
  }

  if (message.type === "GET_COOKIES") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs?.[0]
      if (!tab?.url) {
        sendResponse({ status: "error", cookies: [], cookies_count: 0 })
        return
      }

      const cookieData = await getCookiesForUrl(tab.url)
      sendResponse({ status: "ok", ...cookieData })
    })

    return true
  }

  if (message.type === "REQUEST_TAB_SCAN") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0]
      if (tab?.id && isScannableUrl(tab.url)) {
        scanTab(tab.id, tab.url)
        sendResponse({ status: "queued" })
      } else {
        sendResponse({ status: "ignored" })
      }
    })

    return true
  }

  return true
})
