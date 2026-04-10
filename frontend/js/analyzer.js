// js/analyzer.js

import { analyzeWebsite } from "./api.js"

console.log("Analyzer.js loaded")

// =============================
// 📌 GET ACTIVE TAB
// =============================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  return tab
}

// =============================
// 📌 INJECT SCRIPT
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
// 🍪 GET COOKIES
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
// 💾 SAVE TO HISTORY
// =============================
function saveToHistory(analysisResult) {
  if (!analysisResult) return

  const historyItem = {
    url: analysisResult.url,
    score: analysisResult.final_score,
    status: analysisResult.status,
    reasons: analysisResult.analysis_details || [],
    time: Date.now(),
  }

  console.log("Menyimpan ke history:", historyItem.url, historyItem.status)

  chrome.storage.local.get(["scanHistory"], (result) => {
    let history = result.scanHistory || []

    // Cek duplikat
    const isDuplicate =
      history.length > 0 && history[0].url === analysisResult.url

    if (!isDuplicate) {
      history.unshift(historyItem)
      const limitedHistory = history.slice(0, 100)

      chrome.storage.local.set({ scanHistory: limitedHistory }, () => {
        console.log(
          "History saved:",
          analysisResult.url,
          "-",
          analysisResult.status,
          "Total:",
          limitedHistory.length,
        )
      })
    } else {
      console.log("Duplicate, tidak disimpan:", analysisResult.url)
    }
  })
}

// =============================
// 📤 SEND TO DASHBOARD
// =============================
function sendToDashboard(data, retryCount = 0) {
  const contentFrame = document.getElementById("contentFrame")

  if (!contentFrame) {
    console.error("contentFrame tidak ditemukan")
    return
  }

  if (!contentFrame.contentWindow) {
    if (retryCount < 10) {
      console.log(`Menunggu dashboard siap... retry ${retryCount + 1}`)
      setTimeout(() => sendToDashboard(data, retryCount + 1), 500)
    }
    return
  }

  try {
    contentFrame.contentWindow.postMessage(
      {
        type: "UPDATE_DATA",
        data: data,
      },
      "*",
    )
    console.log("Data terkirim ke dashboard")
  } catch (error) {
    console.error("Gagal kirim ke dashboard:", error)
  }
}

// =============================
// 🔍 ANALYZE CURRENT WEBSITE
// =============================
async function analyzeCurrentWebsite() {
  console.log("🔍 Mulai analisis website...")

  const tab = await getActiveTab()
  if (!tab || !tab.id) {
    console.error("Tidak ada tab aktif")
    return
  }

  // Inject content script
  await injectScript(tab.id)

  // Kirim pesan ke content script untuk ambil data
  chrome.tabs.sendMessage(
    tab.id,
    { type: "GET_WEBSITE_DATA" },
    async (response) => {
      if (response && response.data) {
        console.log("Data dari content script:", response.data)

        const cookieData = await getCookies()

        const payload = {
          ...response.data,
          ...cookieData,
          redirect_count: 0,
          domain_age_days: response.data.domain_age_days || 0,
        }

        try {
          const result = await analyzeWebsite(payload)
          console.log("Hasil analisis:", result)

          // SIMPAN KE HISTORY
          saveToHistory(result)

          // Simpan ke localStorage
          localStorage.setItem("lastAnalysis", JSON.stringify(result))

          // Kirim ke dashboard
          sendToDashboard(result)
        } catch (error) {
          console.error("Error analisis:", error)
        }
      } else {
        console.error("Tidak ada response dari content script")
      }
    },
  )
}

// =============================
// 📩 TERIMA DATA DARI CONTENT SCRIPT (VIA BACKGROUND)
// =============================
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "CONTENT_SCRIPT_READY") {
    console.log("📦 Data dari content script:", msg.data)

    const cookieData = await getCookies()

    const payload = {
      ...msg.data,
      ...cookieData,
      redirect_count: 0,
      domain_age_days: msg.data.domain_age_days || 0,
    }

    try {
      const result = await analyzeWebsite(payload)
      console.log("📥 Hasil dari backend:", result)

      // SIMPAN KE HISTORY
      saveToHistory(result)

      // Simpan ke localStorage
      localStorage.setItem("lastAnalysis", JSON.stringify(result))

      // Kirim ke dashboard
      sendToDashboard(result)
    } catch (error) {
      console.error("Error dari backend:", error)
    }
  }
})

// =============================
// 🚀 INIT
// =============================
async function init() {
  const tab = await getActiveTab()
  console.log("🌐 Tab aktif:", tab.url)
  await injectScript(tab.id)
}

// Jalankan init
init()
