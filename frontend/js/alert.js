// js/pages/alerts.js

document.addEventListener("DOMContentLoaded", () => {
  console.log("Alerts loaded - History")
  loadHistory()

  setInterval(loadHistory, 3000)

  document
    .getElementById("clearAlerts")
    ?.addEventListener("click", clearHistory)
  addExportButton()
})

function loadHistory() {
  chrome.storage.local.get(["analysisHistory"], (result) => {
    console.log("History dari storage:", result.analysisHistory?.length || 0)
    renderHistory(result.analysisHistory || [])
  })
}

function renderHistory(history) {
  const el = document.getElementById("alertsList")
  if (!el) return

  if (!history.length) {
    el.innerHTML = `
      <div class="text-center opacity-70 py-8">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
        </svg>
        Belum ada history analisis
        <div class="text-xs mt-2 opacity-50">Kunjungi website untuk melihat hasil analisis</div>
      </div>
    `
    return
  }

  el.innerHTML = history
    .map((item, index) => {
      let colorClass = "bg-blue-500/20 border-blue-500"
      let icon = "🔵"

      if (item.status === "Berisiko") {
        colorClass = "bg-red-500/20 border-red-500"
        icon = "🔴"
      } else if (item.status === "Waspada") {
        colorClass = "bg-yellow-500/20 border-yellow-500"
        icon = "🟡"
      }

      return `
        <div class="${colorClass} rounded-lg p-3 border-l-4 transition hover:scale-[1.02] cursor-pointer history-item" data-url="${escapeHtml(item.url)}">
          <div class="flex items-start justify-between">
            <div class="font-semibold">${icon} ${escapeHtml(item.title || item.url)}</div>
            <div class="text-xs opacity-50">#${history.length - index}</div>
          </div>
          <div class="text-sm mt-1 opacity-90">${escapeHtml(item.message)}</div>
          <div class="flex flex-wrap items-center justify-between mt-2 gap-2">
            <div class="text-xs opacity-70">${new Date(item.time).toLocaleString()}</div>
            <div class="flex gap-2">
              <div class="text-xs px-2 py-1 rounded-full bg-white/10">Score: ${item.final_score}/100</div>
              <div class="text-xs px-2 py-1 rounded-full bg-white/10">${item.status}</div>
            </div>
          </div>
          ${
            item.analysis_details?.length
              ? `
            <div class="mt-2 text-xs opacity-70 border-t border-white/10 pt-2">
              <details>
                <summary class="cursor-pointer">Detail Analisis</summary>
                <ul class="mt-1 space-y-1 pl-2">
                  ${item.analysis_details
                    .slice(0, 3)
                    .map((d) => `<li>• ${escapeHtml(d)}</li>`)
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
  if (confirm("Clear all history?")) {
    chrome.storage.local.set({ analysisHistory: [] }, () => {
      renderHistory([])
      console.log("Semua history telah dihapus")
    })
  }
}

function exportHistory() {
  chrome.storage.local.get(["analysisHistory"], (result) => {
    const history = result.analysisHistory || []
    if (history.length === 0) {
      alert("No history to export")
      return
    }

    const dataStr = JSON.stringify(history, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `history_${new Date().toISOString().slice(0, 19)}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}

function addExportButton() {
  const clearBtn = document.getElementById("clearAlerts")
  if (clearBtn && !document.getElementById("exportAlerts")) {
    const exportBtn = document.createElement("button")
    exportBtn.id = "exportAlerts"
    exportBtn.textContent = "Export History"
    exportBtn.className =
      "w-full mt-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition"
    exportBtn.addEventListener("click", exportHistory)
    clearBtn.parentNode?.appendChild(exportBtn)
  }
}
