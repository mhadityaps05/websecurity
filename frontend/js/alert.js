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

    // FILTER: Only show Danger and Suspicious/Warning
    const filteredHistory = (result.analysisHistory || []).filter((item) => {
      const status = item.status?.toLowerCase()
      return (
        status === "berisiko" ||
        status === "danger" ||
        status === "waspada" ||
        status === "suspicious"
      )
    })

    console.log("Filtered alerts:", filteredHistory.length)
    renderHistory(filteredHistory)
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

function categorizeCookies(cookies) {
  if (!cookies || !Array.isArray(cookies)) {
    return null
  }

  const categories = {
    session: 0,
    analytics: 0,
    advertising: 0,
    security: 0,
    general: 0,
  }

  cookies.forEach((cookie) => {
    const name = cookie.name?.toLowerCase() || ""
    const domain = cookie.domain?.toLowerCase() || ""

    if (
      name.includes("session") ||
      name.includes("auth") ||
      name.includes("token") ||
      name.includes("login") ||
      name.includes("sid") ||
      name.includes("user")
    ) {
      categories.session++
    } else if (
      name.includes("_ga") ||
      name.includes("_gid") ||
      name.includes("_gat") ||
      name.includes("analytics") ||
      name.includes("pixel") ||
      name.includes("gtm") ||
      name.includes("utm") ||
      domain.includes("analytics") ||
      domain.includes("doubleclick")
    ) {
      categories.analytics++
    } else if (
      name.includes("ads") ||
      name.includes("track") ||
      name.includes("ad_") ||
      name.includes("_fbp") ||
      name.includes("_gcl") ||
      name.includes("marketing") ||
      name.includes("retarget") ||
      domain.includes("ad") ||
      domain.includes("track")
    ) {
      categories.advertising++
    } else if (
      name.includes("cf_") ||
      name.includes("secure") ||
      name.includes("csrf") ||
      name.includes("xsrf") ||
      name.includes("__host") ||
      name.includes("__secure")
    ) {
      categories.security++
    } else {
      categories.general++
    }
  })

  return categories
}

function formatDomainAge(ageDays) {
  if (!ageDays || ageDays === 0) return "Unknown"

  if (ageDays < 1) {
    return `${Math.round(ageDays * 24)} hours`
  } else if (ageDays < 30) {
    return `${ageDays} days`
  } else if (ageDays < 365) {
    const months = Math.floor(ageDays / 30)
    return `${months} month${months > 1 ? "s" : ""}`
  } else {
    const years = Math.floor(ageDays / 365)
    const remainingMonths = Math.floor((ageDays % 365) / 30)
    if (remainingMonths > 0) {
      return `${years} year${years > 1 ? "s" : ""} ${remainingMonths} month${remainingMonths > 1 ? "s" : ""}`
    }
    return `${years} year${years > 1 ? "s" : ""}`
  }
}

function getPermissionStatus(permissions, permissionName) {
  if (!permissions) return { status: "N/A", color: "#a0aec0" }

  const status = permissions[permissionName]

  if (status === "granted") {
    return { status: "ON", color: "#fc8181" }
  } else if (status === "denied") {
    return { status: "OFF", color: "#48bb78" }
  } else if (status === "prompt") {
    return { status: "ASK", color: "#ecc94b" }
  }

  return { status: "N/A", color: "#a0aec0" }
}

function getDomainAgeColor(ageDays) {
  if (!ageDays || ageDays === 0) return "#a0aec0"
  if (ageDays < 7) return "#fc8181"
  if (ageDays < 30) return "#f6ad55"
  if (ageDays < 90) return "#ecc94b"
  if (ageDays < 365) return "#68d391"
  return "#48bb78"
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
        <div class="empty-state-note">Only Danger and Suspicious alerts appear here</div>
      </div>
    `
    return
  }

  el.innerHTML = history
    .map((item, index) => {
      const status = getAlertPresentation(item.status)
      const score = item.final_score ?? item.score
      const title = item.title || item.url || "Unknown website"
      const message = item.message || "Security signal detected"
      const time = item.time ? new Date(item.time).toLocaleString() : ""

      // Get additional details from stored data
      const cookiesCount = item.cookies_count ?? item.cookies?.length ?? 0
      const trackerCount = item.tracker_count ?? 0
      const iframeCount = item.iframe_count ?? 0
      const redirectCount = item.redirect_count ?? 0
      const domainAge = item.domain_age_days
      const thirdPartyCount =
        item.third_party_domains_count ?? item.third_party_domains?.length ?? 0
      const isHttps = item.is_https
      const permissions = item.permissions || {}

      // Get permission statuses
      const cameraStatus = getPermissionStatus(permissions, "camera")
      const microphoneStatus = getPermissionStatus(permissions, "microphone")
      const geolocationStatus = getPermissionStatus(permissions, "geolocation")

      // Categorize cookies
      const cookieCategories = categorizeCookies(item.cookies)

      // Build details HTML with inline styles
      let detailsHtml = `
        <div style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
          
          <!-- Security Score Section -->
          <div style="margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b9cb3; margin-bottom: 8px;">Security Score</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Risk Score</span>
                <div style="font-size: 14px; font-weight: 600; color: #e0e6ed;">${score}/100</div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">HTTPS</span>
                <div style="font-size: 13px; font-weight: 500; color: ${isHttps ? "#48bb78" : "#fc8181"};">
                  ${isHttps ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Status</span>
                <div style="font-size: 13px; font-weight: 500; color: ${
                  status.label === "Safe"
                    ? "#48bb78"
                    : status.label === "Suspicious"
                      ? "#ecc94b"
                      : "#fc8181"
                };">
                  ${status.label}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Domain Information Section -->
          <div style="margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b9cb3; margin-bottom: 8px;">Domain Information</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Domain Age</span>
                <div style="font-size: 13px; font-weight: 500; color: ${getDomainAgeColor(domainAge)};">
                  ${formatDomainAge(domainAge)}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Redirects</span>
                <div style="font-size: 13px; font-weight: 500; color: ${redirectCount > 2 ? "#fc8181" : "#e0e6ed"};">
                  ${redirectCount}x
                </div>
              </div>
            </div>
          </div>
          
          <!-- Permission Status Section -->
          <div style="margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b9cb3; margin-bottom: 8px;">Permission Status</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Camera</span>
                <div style="font-size: 13px; font-weight: 600; color: ${cameraStatus.color};">
                  ${cameraStatus.status}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Microphone</span>
                <div style="font-size: 13px; font-weight: 600; color: ${microphoneStatus.color};">
                  ${microphoneStatus.status}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Location</span>
                <div style="font-size: 13px; font-weight: 600; color: ${geolocationStatus.color};">
                  ${geolocationStatus.status}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Content Analysis Section -->
          <div style="margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b9cb3; margin-bottom: 8px;">Content Analysis</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Total Cookies</span>
                <div style="font-size: 13px; font-weight: 500; color: ${cookiesCount > 30 ? "#fc8181" : "#e0e6ed"};">
                  ${cookiesCount}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">Trackers</span>
                <div style="font-size: 13px; font-weight: 500; color: ${trackerCount > 20 ? "#fc8181" : "#e0e6ed"};">
                  ${trackerCount}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">iFrames</span>
                <div style="font-size: 13px; font-weight: 500; color: ${iframeCount > 4 ? "#fc8181" : "#e0e6ed"};">
                  ${iframeCount}
                </div>
              </div>
              <div>
                <span style="font-size: 10px; color: #6b7c93;">3rd Party</span>
                <div style="font-size: 13px; font-weight: 500; color: ${thirdPartyCount > 15 ? "#fc8181" : "#e0e6ed"};">
                  ${thirdPartyCount}
                </div>
              </div>
            </div>
          </div>`

      // Cookie Categories Section
      if (cookieCategories) {
        const totalCategorized = Object.values(cookieCategories).reduce(
          (a, b) => a + b,
          0,
        )
        if (totalCategorized > 0) {
          detailsHtml += `
          <div>
            <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b9cb3; margin-bottom: 8px;">Cookie Categories (${totalCategorized} total)</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.04); border-radius: 4px;">
                <span style="font-size: 11px; color: #cbd5e0;">Session</span>
                <span style="font-size: 11px; font-weight: 600; color: ${cookieCategories.session > 0 ? "#fc8181" : "#a0aec0"}; background: rgba(255,255,255,0.08); padding: 1px 8px; border-radius: 10px;">${cookieCategories.session}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.04); border-radius: 4px;">
                <span style="font-size: 11px; color: #cbd5e0;">Analytics</span>
                <span style="font-size: 11px; font-weight: 600; color: ${cookieCategories.analytics > 3 ? "#f6ad55" : "#a0aec0"}; background: rgba(255,255,255,0.08); padding: 1px 8px; border-radius: 10px;">${cookieCategories.analytics}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.04); border-radius: 4px;">
                <span style="font-size: 11px; color: #cbd5e0;">Advertising</span>
                <span style="font-size: 11px; font-weight: 600; color: ${cookieCategories.advertising > 0 ? "#fc8181" : "#a0aec0"}; background: rgba(255,255,255,0.08); padding: 1px 8px; border-radius: 10px;">${cookieCategories.advertising}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.04); border-radius: 4px;">
                <span style="font-size: 11px; color: #cbd5e0;">Security</span>
                <span style="font-size: 11px; font-weight: 600; color: ${cookieCategories.security > 0 ? "#48bb78" : "#a0aec0"}; background: rgba(255,255,255,0.08); padding: 1px 8px; border-radius: 10px;">${cookieCategories.security}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.04); border-radius: 4px;">
                <span style="font-size: 11px; color: #cbd5e0;">General</span>
                <span style="font-size: 11px; font-weight: 600; color: #a0aec0; background: rgba(255,255,255,0.08); padding: 1px 8px; border-radius: 10px;">${cookieCategories.general}</span>
              </div>
            </div>
          </div>`
        }
      }

      detailsHtml += `</div>`

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
          ${detailsHtml}
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
    // Export only Danger and Suspicious
    const history = (result.analysisHistory || []).filter((item) => {
      const status = item.status?.toLowerCase()
      return (
        status === "berisiko" ||
        status === "danger" ||
        status === "waspada" ||
        status === "suspicious"
      )
    })

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
