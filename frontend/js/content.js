// js/content.js

console.log("🔥 Content script aktif");

// =============================
// 🔐 PERMISSIONS
// =============================
async function getPermissions() {
  const permissions = {}

  const check = async (name) => {
    try {
      const res = await navigator.permissions.query({ name })
      return res.state
    } catch {
      return "unsupported"
    }
  }

  permissions.geolocation = await check("geolocation")
  permissions.notifications = await check("notifications")
  permissions.camera = await check("camera")
  permissions.microphone = await check("microphone")

  return permissions
}

// =============================
// 🌐 THIRD PARTY
// =============================
function getThirdPartyDomains() {
  const domains = new Set();

  document.querySelectorAll("script, img, iframe, link").forEach((el) => {
    const src = el.src || el.href;
    if (!src) return;

    try {
      const url = new URL(src);
      if (url.hostname !== location.hostname) {
        domains.add(url.hostname);
      }
    } catch {}
  });

  return Array.from(domains);
}

// =============================
// 📊 COLLECT DATA
// =============================
async function collectData() {
  return {
    url: location.href,
    is_https: location.protocol === "https:",
    iframe_count: document.querySelectorAll("iframe").length,
    third_party_domains: getThirdPartyDomains(),
    tracker_count: document.querySelectorAll(
      "script[src*='track'], script[src*='analytics']"
    ).length,
    permissions: await getPermissions(),
    domain_age_days: 0,
  };
}

// =============================
// 🚀 SEND TO EXTENSION
// =============================
collectData().then((data) => {
  chrome.runtime.sendMessage({
    type: "CONTENT_SCRIPT_READY",
    data: data,
  });
});