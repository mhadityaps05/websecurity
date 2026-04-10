// frontend/popup.js

const API_URL = "http://localhost:8000"

// =========================
// NAVIGATION HANDLER
// =========================
const navbarFrame = document.getElementById("navbarFrame")
const contentFrame = document.getElementById("contentFrame")

function navigateTo(page) {
  console.log("Navigating to:", page)
  contentFrame.src = `pages/${page}.html`
  localStorage.setItem("lastPage", page)
}

function sendDataToCurrentPage(data) {
  // Kirim data ke iframe content
  if (contentFrame && contentFrame.contentWindow) {
    contentFrame.contentWindow.postMessage(
      {
        type: "UPDATE_DATA",
        data: data,
      },
      "*",
    )
  }
}

// =========================
// AMBIL DATA DARI TAB AKTIF
// =========================
async function getCurrentTabData() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tab = tabs[0]

        // Kirim pesan ke content script untuk mengambil data
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: "collectWebsiteData",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log("Content script tidak merespon, gunakan data dasar")
              // Data dasar jika content script tidak tersedia
              resolve({
                url: tab.url,
                is_https: tab.url.startsWith("https"),
                tracker_count: 0,
                permissions: [],
                cookies_count: 0,
                third_party_domains: [],
                iframe_count: 0,
                redirect_count: 0,
                domain_age_days: 0,
                ip_address: "Unknown",
              })
            } else if (response) {
              resolve(response)
            }
          },
        )
      } else {
        resolve(null)
      }
    })
  })
}

// =========================
// ANALISIS KE BACKEND
// =========================
async function analyzeCurrentWebsite() {
  try {
    // Tampilkan loading di dashboard
    sendDataToCurrentPage({
      risk_score: "...",
      risk_level: "Loading",
      message: "Menganalisis website...",
      reasons: ["Mengambil data dari tab aktif..."],
    })

    // Ambil data dari tab aktif
    const websiteData = await getCurrentTabData()

    if (!websiteData) {
      throw new Error("Tidak dapat mengambil data website")
    }

    console.log("Data website:", websiteData)

    // Update status
    sendDataToCurrentPage({
      risk_score: "...",
      risk_level: "Loading",
      message: "Mengirim ke scoring engine...",
      reasons: ["Menghubungi backend FastAPI..."],
    })

    // Kirim ke backend FastAPI
    const response = await fetch(`${API_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(websiteData),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log("Hasil analisis:", result)

    // Konversi ke format yang dimengerti frontend
    const dashboardData = {
      risk_score: result.final_score,
      risk_level: result.status,
      message: getRiskMessage(result.status, result.final_score),
      reasons: result.analysis_details,
    }

    // Kirim ke dashboard
    sendDataToCurrentPage(dashboardData)

    // Simpan ke history
    saveToHistory({
      url: websiteData.url,
      timestamp: new Date().toISOString(),
      result: dashboardData,
    })
  } catch (error) {
    console.error("Error:", error)

    let errorMessage = "Gagal menganalisis website"
    let reasons = ["Terjadi kesalahan"]

    if (error.message.includes("Failed to fetch")) {
      errorMessage = "Backend tidak merespon"
      reasons = [
        "Pastikan FastAPI sudah dijalankan:",
        "uvicorn main:app --reload --port 8000",
        "Periksa apakah port 8000 sudah benar",
      ]
    }

    sendDataToCurrentPage({
      risk_score: "Error",
      risk_level: "Error",
      message: errorMessage,
      reasons: reasons,
    })
  }
}

// =========================
// HELPER FUNCTIONS
// =========================
function getRiskMessage(status, score) {
  const messages = {
    Berisiko: `⚠️ Website ini memiliki skor risiko tinggi (${score})`,
    Waspada: `⚠️ Website menunjukkan tanda mencurigakan (${score})`,
    Aman: `✅ Website ini terlihat aman (${score})`,
  }
  return messages[status] || `Skor risiko: ${score}`
}

function saveToHistory(data) {
  chrome.storage.local.get(["history"], (result) => {
    const history = result.history || []
    history.unshift(data)
    // Simpan max 20 history
    if (history.length > 20) history.pop()
    chrome.storage.local.set({ history: history })
  })
}

// =========================
// EVENT LISTENERS
// =========================
document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup loaded")

  // Navigasi ke halaman terakhir
  const lastPage = localStorage.getItem("lastPage") || "dashboard"
  contentFrame.src = `pages/${lastPage}.html`

  // Set active di navbar
  setTimeout(() => {
    if (navbarFrame && navbarFrame.contentWindow) {
      navbarFrame.contentWindow.postMessage(
        { type: "SET_ACTIVE", page: lastPage },
        "*",
      )
    }
  }, 100)

  // Auto-analisis jika di halaman dashboard
  if (lastPage === "dashboard") {
    setTimeout(() => {
      analyzeCurrentWebsite()
    }, 500)
  }

  // Tombol analisis manual
  const analyzeBtn = document.getElementById("analyzeBtn")
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => {
      analyzeCurrentWebsite()
    })
  }
})

// Listen for messages
window.addEventListener("message", (event) => {
  if (event.data.type === "NAV_CLICK") {
    navigateTo(event.data.page)
  }

  if (event.data.type === "REQUEST_ANALYSIS") {
    analyzeCurrentWebsite()
  }
})

// Untuk testing dengan dummy data (opsional)
function testWithDummyData() {
  const dummyData = {
    risk_score: 75.5,
    risk_level: "Berisiko",
    message: "Website memiliki tingkat risiko tinggi",
    reasons: [
      "URL menggunakan IP Address langsung",
      "Domain sangat baru (< 30 hari)",
      "Banyak tracker terdeteksi",
      "Meminta akses kamera",
    ],
  }
  sendDataToCurrentPage(dummyData)
}

// Export untuk debugging
window.analyzeCurrentWebsite = analyzeCurrentWebsite
window.testWithDummyData = testWithDummyData
