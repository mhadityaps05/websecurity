// navigation.js (UI ONLY)

document.addEventListener("DOMContentLoaded", () => {
  const navbarFrame = document.getElementById("navbarFrame");
  const contentFrame = document.getElementById("contentFrame");

  const lastPage = localStorage.getItem("lastPage") || "dashboard";
  contentFrame.src = `pages/${lastPage}.html`;

  navbarFrame.addEventListener("load", () => {
    setTimeout(() => {
      navbarFrame.contentWindow?.postMessage(
        { type: "SET_ACTIVE", page: lastPage },
        "*"
      );
    }, 100);
  });

  window.addEventListener("message", (event) => {
    if (event.data.type === "NAV_CLICK") {
      const page = event.data.page;

      contentFrame.src = `pages/${page}.html`;
      localStorage.setItem("lastPage", page);

      // 🔥 trigger analyzer
      if (page === "dashboard") {
        window.postMessage({ type: "TRIGGER_ANALYSIS" }, "*");
      }
    }
  });

  if (lastPage === "dashboard") {
    window.postMessage({ type: "TRIGGER_ANALYSIS" }, "*");
  }
});