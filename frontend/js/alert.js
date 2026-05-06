// js/pages/alerts.js

document.addEventListener("DOMContentLoaded", () => {
  console.log("Alerts loaded")
  loadHistory()

  setInterval(loadHistory, 3000)

  document
    .getElementById("clearAlerts")
    ?.addEventListener("click", clearHistory)
  addExportButton()
})

function loadHistory() {
  chrome.storage.local.get(["analysisHistory"], (result) => {
    console.log("Alerts dari storage:", result.analysisHistory?.length || 0)
    renderHistory(result.analysisHistory || [])
  })
}

function getAlertPresentation(status) {
  const normalized = status?.toLowerCase()

  if (normalized === "berisiko" || normalized === "danger") {
    return {
      cardClass: "alert-card--danger",
      badgeClass: "status-danger",
      label: "Danger",
    }
  }

  if (normalized === "waspada" || normalized === "suspicious") {
    return {
      cardClass: "alert-card--warning",
      badgeClass: "status-warning",
      label: "Suspicious",
    }
  }

  return {
    cardClass: "alert-card--safe",
    badgeClass: "status-safe",
    label: "Safe",
  }
}

function renderHistory(history) {
  const el = document.getElementById("alertsList")
  if (!el) return

  if (!history.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path>
        </svg>
        No alerts yet
        <div class="empty-state-note">Risk signals will appear here</div>
      </div>
    `
    return
  }

  el.innerHTML = history
    .map((item, index) => {
      const status = getAlertPresentation(item.status)
      const details = item.analysis_details || item.reasons || []
      const score = item.final_score ?? item.score
      const title = item.title || item.url || "Unknown website"
      const message = item.message || "Security signal detected"
      const time = item.time ? new Date(item.time).toLocaleString() : ""

      return `
        <div class="alert-card ${status.cardClass} history-item" data-url="${escapeHtml(item.url)}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="card-title break-words">${escapeHtml(title)}</div>
              ${time ? `<div class="card-meta">${time}</div>` : ""}
            </div>
            <span class="mini-chip">#${history.length - index}</span>
          </div>
          <div class="card-message">${escapeHtml(message)}</div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            ${score ? `<span class="mini-chip">Score: ${score}/100</span>` : ""}
            <span class="status-badge ${status.badgeClass}">${status.label}</span>
          </div>
          ${
            details.length
              ? `
            <div class="card-details">
              <details>
                <summary>Detail Analisis</summary>
                <ul class="mt-2 space-y-1">
                  ${details
                    .slice(0, 3)
                    .map((detail) => `<li>- ${escapeHtml(detail)}</li>`)
                    .join("")}
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

  attachClickListeners()
}

function attachClickListeners() {
  document.querySelectorAll(".history-item").forEach((el) => {
    el.removeEventListener("click", handleClick)
    el.addEventListener("click", handleClick)
  })
}

function handleClick(event) {
  if (event.target.closest("details, summary, button, a")) {
    return
  }

  const historyDiv = event.currentTarget
  const url = historyDiv.dataset.url

  if (url && url !== "undefined") {
    chrome.tabs.create({ url: url, active: true })
  }
}

function escapeHtml(text) {
  if (!text) return ""
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

function clearHistory() {
  if (confirm("Clear all alerts?")) {
    chrome.storage.local.set({ analysisHistory: [] }, () => {
      renderHistory([])
      console.log("Semua alert telah dihapus")
    })
  }
}

function exportHistory() {
  chrome.storage.local.get(["analysisHistory"], (result) => {
    const history = result.analysisHistory || []
    if (history.length === 0) {
      alert("No alerts to export")
      return
    }

    const dataStr = JSON.stringify(history, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `alerts_${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}

function addExportButton() {
  const clearBtn = document.getElementById("clearAlerts")
  if (clearBtn && !document.getElementById("exportAlerts")) {
    const exportBtn = document.createElement("button")
    exportBtn.id = "exportAlerts"
    exportBtn.textContent = "Export Alerts"
    exportBtn.className = "action-button action-success mt-2"
    exportBtn.addEventListener("click", exportHistory)
    clearBtn.parentNode?.appendChild(exportBtn)
  }
}
