// js/dashboard.js

console.log("Dashboard siap")

// Fungsi untuk konversi score ke warna RGB
function getColorFromScore(score) {
  let normalizedScore = Math.min(100, Math.max(0, score))
  let r, g, b

  if (normalizedScore <= 50) {
    let progress = normalizedScore / 50
    r = Math.floor(255 * progress)
    g = 255
    b = 0
  } else {
    let progress = (normalizedScore - 50) / 50
    r = 255
    g = Math.floor(255 * (1 - progress))
    b = 0
  }

  return `rgb(${r}, ${g}, ${b})`
}

// Fungsi update progress bar
function updateProgressBar(score) {
  const circle = document.getElementById("progressCircle")
  const scoreLabel = document.getElementById("scoreLabel")

  if (!circle) return

  let normalizedScore = Math.min(100, Math.max(0, score))
  const circumference = 2 * Math.PI * 58
  const offset = circumference - (normalizedScore / 100) * circumference

  circle.style.strokeDashoffset = offset
  circle.style.stroke = getColorFromScore(normalizedScore)

  if (normalizedScore <= 30) {
    scoreLabel.innerText = "Low Risk"
    scoreLabel.style.color = "#10b981"
    scoreLabel.style.background = "rgba(34, 197, 94, 0.14)"
  } else if (normalizedScore <= 70) {
    scoreLabel.innerText = "Medium Risk"
    scoreLabel.style.color = "#f59e0b"
    scoreLabel.style.background = "rgba(245, 158, 11, 0.14)"
  } else {
    scoreLabel.innerText = "High Risk"
    scoreLabel.style.color = "#ef4444"
    scoreLabel.style.background = "rgba(239, 68, 68, 0.16)"
  }
}

// =============================
// UPDATE UI (HANYA SATU)
// =============================
function updateUI(data) {
  console.log("Update UI:", data)

  if (!data) return

  const scoreEl = document.getElementById("score")
  const msgEl = document.getElementById("message")
  const reasonsEl = document.getElementById("reasonsList")
  const urlEl = document.getElementById("websiteUrl")

  if (!scoreEl || !msgEl || !reasonsEl || !urlEl) {
    console.error("Element tidak ditemukan")
    return
  }

  let finalScore = parseInt(data.final_score) || 0
  scoreEl.innerText = finalScore
  urlEl.innerText = data.url || "-"
  updateProgressBar(finalScore)

  const status = data.status?.toLowerCase()
  if (status === "aman") {
    msgEl.innerText = "Website terlihat aman"
  } else if (status === "waspada") {
    msgEl.innerText = "Perlu berhati-hati"
  } else if (status === "berisiko") {
    msgEl.innerText = "Website berpotensi berbahaya"
  } else {
    msgEl.innerText = data.message || "Status tidak diketahui"
  }

  reasonsEl.innerHTML = ""
  if (data.analysis_details && data.analysis_details.length > 0) {
    data.analysis_details.forEach((reason) => {
      const li = document.createElement("li")
      li.textContent = reason
      reasonsEl.appendChild(li)
    })
  } else {
    reasonsEl.innerHTML =
      "<li class='muted-copy'>Tidak ada indikasi masalah</li>"
  }

  // Simpan ke localStorage
  try {
    localStorage.setItem("lastAnalysis", JSON.stringify(data))
  } catch (e) {
    console.error("Gagal simpan ke localStorage:", e)
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ lastAnalysis: data })
  }
}

// =============================
// TERIMA DATA DARI PARENT
// =============================
window.addEventListener("message", (event) => {
  console.log("Dashboard received message:", event.data)

  const data = event.data

  if (data && data.type === "UPDATE_DATA") {
    updateUI(data.data)
  } else if (data && data.final_score !== undefined) {
    updateUI(data)
  }
})

// =============================
// LOAD DARI LOCALSTORAGE
// =============================
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, cek hasil analisis terakhir...")

  const saved = localStorage.getItem("lastAnalysis")
  if (saved) {
    try {
      const data = JSON.parse(saved)
      console.log("Load dari localStorage:", data)
      updateUI(data)
    } catch (e) {
      console.error("Gagal parse localStorage:", e)
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get(["lastAnalysis"], (result) => {
      if (result.lastAnalysis) {
        console.log("Load dari chrome.storage:", result.lastAnalysis)
        updateUI(result.lastAnalysis)
      }
    })
  }

  if (window.parent) {
    window.parent.postMessage({ type: "DASHBOARD_READY" }, "*")
    console.log("Kirim DASHBOARD_READY ke parent")
  }
})

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.lastAnalysis?.newValue) {
      updateUI(changes.lastAnalysis.newValue)
    }
  })
}

// Inisialisasi progress bar
updateProgressBar(0)
