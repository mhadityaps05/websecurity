// js/history.js

console.log("History.js loaded")

// Data history disimpan di chrome.storage.local dengan key "scanHistory"
let currentFilter = "all"

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded - History page")
  loadHistory()
  setupFilters()

  // Tombol clear history
  const clearBtn = document.getElementById("clearHistoryBtn")
  if (clearBtn) {
    clearBtn.addEventListener("click", clearHistory)
  }
})

function loadHistory() {
  chrome.storage.local.get(["scanHistory"], (result) => {
    console.log("History dari storage:", result.scanHistory?.length || 0)
    const history = result.scanHistory || []
    applyFilter(history, currentFilter)
  })
}

function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active class
      document.querySelectorAll(".filter-btn").forEach((b) => {
        b.classList.remove("bg-white/20")
        b.classList.add("bg-white/10")
      })
      btn.classList.remove("bg-white/10")
      btn.classList.add("bg-white/20")

      // Update filter
      currentFilter = btn.dataset.filter
      console.log("Filter changed to:", currentFilter)

      // Reload with filter
      loadHistory()
    })
  })
}

function applyFilter(history, filter) {
  let filtered = [...history]

  if (filter === "safe") {
    filtered = history.filter((h) => {
      const status = h.status?.toLowerCase()
      return status === "aman"
    })
  } else if (filter === "suspicious") {
    filtered = history.filter((h) => {
      const status = h.status?.toLowerCase()
      return status === "waspada"
    })
  } else if (filter === "danger") {
    filtered = history.filter((h) => {
      const status = h.status?.toLowerCase()
      return status === "berisiko"
    })
  }

  renderHistory(filtered)
}

function renderHistory(history) {
  const el = document.getElementById("historyList")
  if (!el) return

  if (!history.length) {
    el.innerHTML = `
      <div class="text-center opacity-70 py-8">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
        </svg>
        No scan history yet
        <div class="text-xs mt-2 opacity-50">Visit websites to see scan results here</div>
      </div>
    `
    return
  }

  el.innerHTML = history
    .map((item, index) => {
      const date = new Date(item.time).toLocaleString()
      let hostname = item.url || ""
      try {
        hostname = new URL(item.url).hostname
      } catch (e) {
        hostname = item.url
      }

      let color = "bg-green-500"
      let text = "Safe"

      if (item.status === "Berisiko") {
        color = "bg-red-500"
        text = "Danger"
      } else if (item.status === "Waspada") {
        color = "bg-yellow-500"
        text = "Suspicious"
      }

      return `
        <div class="bg-white/10 rounded-lg p-3 hover:bg-white/15 transition cursor-pointer history-item" data-url="${escapeHtml(item.url)}" data-index="${index}">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="font-medium">${escapeHtml(hostname)}</div>
              <div class="text-xs opacity-70 mt-1">${date}</div>
              ${item.score ? `<div class="text-xs opacity-50 mt-1">Score: ${item.score}/100</div>` : ""}
            </div>
            <span class="px-2 py-1 ${color} rounded-full text-xs whitespace-nowrap ml-2">${text}</span>
          </div>
          ${
            item.reasons?.length
              ? `
            <div class="mt-2 text-xs opacity-70 border-t border-white/10 pt-2">
              <details>
                <summary class="cursor-pointer">Details</summary>
                <ul class="mt-1 space-y-1 pl-2">
                  ${item.reasons
                    .slice(0, 3)
                    .map((r) => `<li>• ${escapeHtml(r)}</li>`)
                    .join("")}
                  ${item.reasons.length > 3 ? `<li class="opacity-50">+${item.reasons.length - 3} more</li>` : ""}
                </ul>
              </details>
            </div>
          `
              : ""
          }
        </div>
      `
    })
    .join("")

  // Add click listeners to history items
  document.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", () => {
      const url = item.dataset.url
      if (url && url !== "undefined") {
        console.log("Open URL:", url)
        chrome.tabs.create({ url: url, active: true })
      }
    })
  })
}

function escapeHtml(text) {
  if (!text) return ""
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

// =============================
// CLEAR HISTORY FUNCTION
// =============================
function clearHistory() {
  if (
    confirm(
      "Are you sure you want to clear all scan history? This action cannot be undone.",
    )
  ) {
    chrome.storage.local.set({ scanHistory: [] }, () => {
      console.log("History cleared")
      loadHistory()
    })
  }
}

// =============================
// EXPORT HISTORY (Opsional)
// =============================
function exportHistory() {
  chrome.storage.local.get(["scanHistory"], (result) => {
    const history = result.scanHistory || []
    if (history.length === 0) {
      alert("No history to export")
      return
    }

    const dataStr = JSON.stringify(history, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `scan_history_${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}

// Auto refresh setiap 5 detik
setInterval(() => {
  loadHistory()
}, 5000)
