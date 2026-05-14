// js/analyzer.js

import { analyzeWebsite } from "./api.js"

console.log("Analyzer.js loaded")

// =============================
// GET ACTIVE TAB
// =============================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  return tab
}

// =============================
// INJECT SCRIPT
// =============================
async function injectScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["js/content.js"],
    })
    console.log("Content script injected")
  } catch (error) {
    console.error("Gagal inject script:", error)
  }
}

// =============================
// GET COOKIES
// =============================
function getCookies() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_COOKIES" }, (res) => {
      if (res && res.status === "ok") {
        resolve({
          cookies: res.cookies,
          cookies_count: res.cookies_count,
        })
      } else {
        resolve({
          cookies: [],
          cookies_count: 0,
        })
      }
    })
  })
}

// =============================
// SAVE TO HISTORY
// =============================
function saveToHistory(analysisResult) {
  if (!analysisResult) return

  const historyItem = {
    // Basic info
    url: analysisResult.url,
    title: analysisResult.title || analysisResult.url,
    message: analysisResult.analysis_details?.[0] || "Analysis complete",
    time: new Date().toISOString(),

    // Score and status
    final_score: analysisResult.final_score,
    score: analysisResult.final_score,
    status: analysisResult.status,

    // Content analysis
    cookies_count: analysisResult.cookies_count || 0,
    tracker_count: analysisResult.tracker_count || 0,
    iframe_count: analysisResult.iframe_count || 0,
    redirect_count: analysisResult.redirect_count || 0,
    third_party_domains_count: analysisResult.third_party_domains_count || 0,

    // Domain info
    domain_age_days: analysisResult.domain_age_days || 0,
    is_https: analysisResult.is_https || false,

    // Permissions - Pastikan ini object
    permissions: analysisResult.permissions || {
      camera: "unknown",
      microphone: "unknown",
      geolocation: "unknown",
    },

    // Cookies - Format array of {name, domain}
    cookies: analysisResult.cookies || [],

    // Analysis details
    analysis_details: analysisResult.analysis_details || [],
  }

  console.log("Menyimpan ke history:", historyItem)
  console.log("Permissions:", JSON.stringify(historyItem.permissions))
  console.log("Cookies:", historyItem.cookies.length)

  chrome.storage.local.get(["analysisHistory"], (result) => {
    let history = result.analysisHistory || []

    // Cek duplikat
    const isDuplicate = history.length > 0 && history[0].url === historyItem.url

    if (!isDuplicate) {
      history.unshift(historyItem)
      const limitedHistory = history.slice(0, 100)

      chrome.storage.local.set({ analysisHistory: limitedHistory }, () => {
        console.log("History saved:", historyItem.url, "-", historyItem.status)
      })
    } else {
      history[0] = historyItem
      chrome.storage.local.set({ analysisHistory: history }, () => {
        console.log("History updated:", historyItem.url)
      })
    }
  })
}

// =============================
// SEND TO DASHBOARD
// =============================
function sendToDashboard(data, retryCount = 0) {
  const contentFrame = document.getElementById("contentFrame")
  if (!contentFrame) return

  if (!contentFrame.contentWindow) {
    if (retryCount < 10) {
      setTimeout(() => sendToDashboard(data, retryCount + 1), 500)
    }
    return
  }

  try {
    contentFrame.contentWindow.postMessage(
      { type: "UPDATE_DATA", data: data },
      "*",
    )
  } catch (error) {
    console.error("Gagal kirim ke dashboard:", error)
  }
}

// =============================
// GET PAGE TITLE
// =============================
async function getPageTitle(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.title,
    })
    return result?.result || null
  } catch (error) {
    return null
  }
}

// =============================
// GET PERMISSIONS FROM PAGE
// =============================
async function getPagePermissions(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async () => {
        const permissions = {
          camera: "unknown",
          microphone: "unknown",
          geolocation: "unknown",
        }

        // Check permissions using Permissions API
        if (navigator.permissions) {
          try {
            const cameraPerm = await navigator.permissions.query({
              name: "camera",
            })
            permissions.camera = cameraPerm.state
          } catch (e) {
            // Camera permission not available
            permissions.camera = "denied"
          }

          try {
            const micPerm = await navigator.permissions.query({
              name: "microphone",
            })
            permissions.microphone = micPerm.state
          } catch (e) {
            permissions.microphone = "denied"
          }

          try {
            const geoPerm = await navigator.permissions.query({
              name: "geolocation",
            })
            permissions.geolocation = geoPerm.state
          } catch (e) {
            permissions.geolocation = "denied"
          }
        }

        return permissions
      },
    })
    return result?.result || null
  } catch (error) {
    console.error("Gagal ambil permissions:", error)
    return null
  }
}

// =============================
// ANALYZE CURRENT WEBSITE
// =============================
async function analyzeCurrentWebsite() {
  console.log("Mulai analisis website...")

  const tab = await getActiveTab()
  if (!tab || !tab.id) return

  await injectScript(tab.id)

  const pageTitle = await getPageTitle(tab.id)
  const pagePermissions = await getPagePermissions(tab.id)

  console.log("Page permissions:", pagePermissions)

  chrome.tabs.sendMessage(
    tab.id,
    { type: "GET_WEBSITE_DATA" },
    async (response) => {
      if (response && response.data) {
        const cookieData = await getCookies()

        const payload = {
          ...response.data,
          ...cookieData,
          redirect_count: response.data.redirect_count || 0,
          domain_age_days: response.data.domain_age_days || 0,
          // Gunakan permissions dari halaman jika ada
          permissions: pagePermissions || response.data.permissions || {},
        }

        console.log("Payload permissions:", payload.permissions)

        try {
          const result = await analyzeWebsite(payload)

          // Gabungkan permissions
          result.permissions = pagePermissions || payload.permissions || {}

          if (pageTitle) {
            result.title = pageTitle
          }

          console.log("Final result permissions:", result.permissions)
          saveToHistory(result)
          localStorage.setItem("lastAnalysis", JSON.stringify(result))
          sendToDashboard(result)
        } catch (error) {
          console.error("Error analisis:", error)
        }
      }
    },
  )
}

// =============================
// TERIMA DATA DARI CONTENT SCRIPT
// =============================
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "CONTENT_SCRIPT_READY") {
    const cookieData = await getCookies()

    let pagePermissions = null
    if (sender.tab?.id) {
      pagePermissions = await getPagePermissions(sender.tab.id)
    }

    const payload = {
      ...msg.data,
      ...cookieData,
      redirect_count: msg.data.redirect_count || 0,
      domain_age_days: msg.data.domain_age_days || 0,
      permissions: pagePermissions || msg.data.permissions || {},
    }

    try {
      const result = await analyzeWebsite(payload)

      result.permissions = pagePermissions || payload.permissions || {}

      if (sender.tab?.id) {
        const pageTitle = await getPageTitle(sender.tab.id)
        if (pageTitle) result.title = pageTitle
      }

      saveToHistory(result)
      localStorage.setItem("lastAnalysis", JSON.stringify(result))
      sendToDashboard(result)
    } catch (error) {
      console.error("Error dari backend:", error)
    }
  }
})

// =============================
// INIT
// =============================
async function init() {
  const tab = await getActiveTab()
  console.log("Tab aktif:", tab.url)
  await injectScript(tab.id)
}

init()
