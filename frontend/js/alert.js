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

function normalizeStatus(status) {
  const normalized = status?.toLowerCase()

  if (normalized === "danger" || normalized === "berisiko") return "danger"
  if (normalized === "suspicious" || normalized === "waspada") {
    return "suspicious"
  }
  if (normalized === "safe" || normalized === "aman") return "safe"

  return "safe"
}

function isAlertItem(item) {
  const status = normalizeStatus(item.status)
  return status === "danger" || status === "suspicious"
}

function getAlertPresentation(status) {
  const normalized = normalizeStatus(status)

  if (normalized === "danger") {
    return {
      cardClass: "alert-card--danger",
      badgeClass: "status-danger",
      label: "Danger",
    }
  }

  if (normalized === "suspicious") {
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

function getHostname(url, fallback = "Unknown website") {
  try {
    return new URL(url).hostname
  } catch {
    return fallback
  }
}

function formatDate(value) {
  if (!value) return ""
  return new Date(value).toLocaleString()
}

function formatDomainAge(ageDays) {
  if (!ageDays) return "Unknown"
  if (ageDays < 30) return `${ageDays} days`
  if (ageDays < 365) return `${Math.floor(ageDays / 30)} months`
  return `${Math.floor(ageDays / 365)} years`
}

function metricCard(label, value, tone = "neutral") {
  const colors = {
    neutral: "#e0e6ed",
    safe: "#48bb78",
    warning: "#ecc94b",
    danger: "#fc8181",
  }

  return `
    <div style="min-width: 0; border-radius: 8px; background: rgba(255,255,255,0.045); padding: 7px 8px;">
      <div style="font-size: 10px; color: #8b9cb3; margin-bottom: 3px;">${escapeHtml(label)}</div>
      <div style="font-size: 12px; font-weight: 800; color: ${colors[tone]}; overflow-wrap: anywhere;">${escapeHtml(String(value ?? "-"))}</div>
    </div>
  `
}

function detailSection(title, content) {
  return `
    <div style="padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.08);">
      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #8b9cb3; margin-bottom: 8px;">${escapeHtml(title)}</div>
      ${content}
    </div>
  `
}

function metricGrid(items) {
  return `
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; overflow: hidden;">
      ${items.join("")}
    </div>
  `
}

function getPermissionStatus(permissions, permissionName) {
  const status = permissions?.[permissionName]?.toLowerCase()

  if (status === "granted") {
    return { label: "ON", tone: "danger" }
  }

  if (status === "prompt") {
    return { label: "ASK", tone: "warning" }
  }

  if (status === "denied") {
    return { label: "OFF", tone: "safe" }
  }

  return { label: "N/A", tone: "neutral" }
}

function buildAlertDetails(item, status) {
  const score = item.final_score ?? item.score ?? 0
  const cookiesCount = item.cookies_count ?? item.cookies?.length ?? 0
  const trackerCount = item.tracker_count ?? 0
  const iframeCount = item.iframe_count ?? 0
  const thirdPartyCount =
    item.third_party_domains_count ?? item.third_party_domains?.length ?? 0
  const domainAge = item.domain_age_days
  const isHttps = item.is_https
  const redirectCount = item.redirect_count ?? 0
  const permissions = item.permissions || {}
  const cameraStatus = getPermissionStatus(permissions, "camera")
  const microphoneStatus = getPermissionStatus(permissions, "microphone")
  const locationStatus = getPermissionStatus(permissions, "geolocation")

  return `
    <div class="card-details" style="cursor: default; padding-top: 2px;">
      ${detailSection(
        "Security Score",
        metricGrid([
          metricCard("Risk Score", `${score}/100`, score > 60 ? "danger" : "warning"),
          metricCard("HTTPS", isHttps === undefined ? "Unknown" : isHttps ? "Enabled" : "Disabled", isHttps ? "safe" : "danger"),
          metricCard("Status", status.label, status.label === "Danger" ? "danger" : "warning"),
        ]),
      )}
      ${detailSection(
        "Domain Information",
        metricGrid([
          metricCard("Domain Age", formatDomainAge(domainAge), domainAge > 365 ? "safe" : "neutral"),
          metricCard("Redirects", `${redirectCount}x`, redirectCount > 2 ? "warning" : "neutral"),
        ]),
      )}
      ${detailSection(
        "Permission Status",
        metricGrid([
          metricCard("Camera", cameraStatus.label, cameraStatus.tone),
          metricCard("Microphone", microphoneStatus.label, microphoneStatus.tone),
          metricCard("Location", locationStatus.label, locationStatus.tone),
        ]),
      )}
      ${detailSection(
        "Content Analysis",
        metricGrid([
          metricCard("Total Cookies", cookiesCount, cookiesCount > 30 ? "danger" : "neutral"),
          metricCard("Trackers", trackerCount, trackerCount > 20 ? "danger" : "neutral"),
          metricCard("iFrames", iframeCount, iframeCount > 4 ? "warning" : "neutral"),
          metricCard("3rd Party", thirdPartyCount, thirdPartyCount > 15 ? "warning" : "neutral"),
        ]),
      )}
    </div>
  `
}

function loadHistory() {
  chrome.storage.local.get(["analysisHistory"], (result) => {
    const filteredHistory = (result.analysisHistory || []).filter(isAlertItem)
    renderHistory(filteredHistory)
  })
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
        No alerts
        <div class="empty-state-note">Only Suspicious and Danger alerts appear here</div>
      </div>
    `
    return
  }

  el.innerHTML = history
    .map((item, index) => {
      const status = getAlertPresentation(item.status)
      const score = item.final_score ?? item.score
      const hostname = getHostname(item.url, item.title || "Unknown website")
      const message = item.message || item.reasons?.[0] || "Security signal detected"
      const time = formatDate(item.time)

      return `
        <div class="alert-card ${status.cardClass} history-item" data-url="${escapeHtml(item.url)}" style="overflow: hidden;">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="card-title" style="overflow-wrap: anywhere;">${escapeHtml(hostname)}</div>
              ${time ? `<div class="card-meta">${time}</div>` : ""}
            </div>
            <span class="mini-chip">#${history.length - index}</span>
          </div>
          <div class="card-message" style="overflow-wrap: anywhere;">${escapeHtml(message)}</div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            ${score ? `<span class="mini-chip">Score: ${score}/100</span>` : ""}
            <span class="status-badge ${status.badgeClass}">${status.label}</span>
          </div>
          ${buildAlertDetails(item, status)}
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
  if (event.target.closest(".card-details, button, a")) {
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
    const history = (result.analysisHistory || []).filter(isAlertItem)
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
