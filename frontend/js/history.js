// js/history.js

console.log("History.js loaded")

let currentFilter = "all"

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded - History page")
  loadHistory()
  setupFilters()

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
      document.querySelectorAll(".filter-btn").forEach((item) => {
        item.classList.remove("is-active")
      })
      btn.classList.add("is-active")

      currentFilter = btn.dataset.filter
      console.log("Filter changed to:", currentFilter)
      loadHistory()
    })
  })
}

function normalizeStatus(status) {
  const normalized = status?.toLowerCase()

  if (normalized === "safe" || normalized === "aman") return "safe"
  if (normalized === "suspicious" || normalized === "waspada") {
    return "suspicious"
  }
  if (normalized === "danger" || normalized === "berisiko") return "danger"

  return "safe"
}

function applyFilter(history, filter) {
  let filtered = [...history]

  if (filter === "safe") {
    filtered = history.filter((h) => normalizeStatus(h.status) === "safe")
  } else if (filter === "suspicious") {
    filtered = history.filter((h) => normalizeStatus(h.status) === "suspicious")
  } else if (filter === "danger") {
    filtered = history.filter((h) => normalizeStatus(h.status) === "danger")
  }

  renderHistory(filtered)
}

function getStatusPresentation(status) {
  const normalized = normalizeStatus(status)

  if (normalized === "danger") {
    return {
      cardClass: "history-card--danger",
      badgeClass: "status-danger",
      label: "Danger",
    }
  }

  if (normalized === "suspicious") {
    return {
      cardClass: "history-card--warning",
      badgeClass: "status-warning",
      label: "Suspicious",
    }
  }

  return {
    cardClass: "history-card--safe",
    badgeClass: "status-safe",
    label: "Safe",
  }
}

function renderHistory(history) {
  const el = document.getElementById("historyList")
  if (!el) return

  if (!history.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
        </svg>
        No scan history yet
        <div class="empty-state-note">Visit websites to see scan results here</div>
      </div>
    `
    return
  }

  el.innerHTML = history
    .map((item, index) => {
      const date = new Date(item.time).toLocaleString()
      const score = item.score ?? item.final_score
      const reasons = item.reasons || item.analysis_details || []
      const status = getStatusPresentation(item.status)

      let hostname = item.url || ""
      try {
        hostname = new URL(item.url).hostname
      } catch (e) {
        hostname = item.url
      }

      return `
        <div class="history-card ${status.cardClass} history-item" data-url="${escapeHtml(item.url)}" data-index="${index}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="card-title break-words">${escapeHtml(hostname)}</div>
              <div class="card-meta">${date}</div>
              ${score ? `<div class="card-meta">Score: ${score}/100</div>` : ""}
            </div>
            <span class="status-badge ${status.badgeClass}">${status.label}</span>
          </div>
          ${
            reasons.length
              ? `
            <div class="card-details">
              <details>
                <summary>Details</summary>
                <ul class="mt-2 space-y-1">
                  ${reasons
                    .slice(0, 3)
                    .map((reason) => `<li>- ${escapeHtml(reason)}</li>`)
                    .join("")}
                  ${reasons.length > 3 ? `<li class="muted-copy">+${reasons.length - 3} more</li>` : ""}
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

  document.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("details, summary, button, a")) {
        return
      }

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

setInterval(() => {
  loadHistory()
}, 5000)
