// js/settings.js

const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  soundAlerts: false,
  desktopNotifications: true,
  autoScan: true,
}

let currentSettings = { ...DEFAULT_SETTINGS }

const inputs = {
  notificationsEnabled: document.getElementById("notificationsEnabled"),
  soundAlerts: document.getElementById("soundAlerts"),
  desktopNotifications: document.getElementById("desktopNotifications"),
  autoScan: document.getElementById("autoScan"),
}

const clearAllDataBtn = document.getElementById("clearAllData")
const resetExtensionBtn = document.getElementById("resetExtension")
const statusEl = document.getElementById("settingsStatus")

function setStatus(message) {
  if (!statusEl) return

  statusEl.textContent = message

  if (message) {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = ""
      }
    }, 2600)
  }
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message)
        resolve({ status: "error" })
        return
      }

      resolve(response || { status: "ok" })
    })
  })
}

function applySettings(settings) {
  currentSettings = { ...DEFAULT_SETTINGS, ...settings }

  Object.entries(inputs).forEach(([key, input]) => {
    if (input) {
      input.checked = Boolean(currentSettings[key])
    }
  })

  const notificationsOn = currentSettings.notificationsEnabled
  if (inputs.soundAlerts) inputs.soundAlerts.disabled = !notificationsOn
  if (inputs.desktopNotifications) {
    inputs.desktopNotifications.disabled = !notificationsOn
  }
}

async function loadSettings() {
  const response = await sendMessage({ type: "GET_EXTENSION_SETTINGS" })
  applySettings(response.settings || DEFAULT_SETTINGS)
}

async function saveSettings(nextSettings, message = "Settings saved") {
  applySettings(nextSettings)
  const response = await sendMessage({
    type: "UPDATE_EXTENSION_SETTINGS",
    settings: currentSettings,
  })

  if (response.status === "ok") {
    setStatus(message)
  } else {
    setStatus("Failed to save settings")
  }
}

Object.entries(inputs).forEach(([key, input]) => {
  input?.addEventListener("change", () => {
    saveSettings(
      {
        ...currentSettings,
        [key]: input.checked,
      },
      "Settings updated",
    )
  })
})

clearAllDataBtn?.addEventListener("click", async () => {
  const confirmed = confirm("Clear all scan history and alerts?")
  if (!confirmed) return

  localStorage.removeItem("lastAnalysis")

  const response = await sendMessage({ type: "CLEAR_EXTENSION_DATA" })
  setStatus(
    response.status === "ok"
      ? "All data cleared"
      : "Failed to clear extension data",
  )
})

resetExtensionBtn?.addEventListener("click", async () => {
  const confirmed = confirm("Reset settings and clear all extension data?")
  if (!confirmed) return

  localStorage.removeItem("lastAnalysis")
  localStorage.removeItem("lastPage")

  const response = await sendMessage({ type: "RESET_EXTENSION" })
  applySettings(response.settings || DEFAULT_SETTINGS)
  setStatus(
    response.status === "ok"
      ? "Extension reset"
      : "Failed to reset extension",
  )
})

document.addEventListener("DOMContentLoaded", loadSettings)
