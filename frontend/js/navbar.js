// js/components/navbar.js

console.log("Navbar.js jalan - di dalam iframe navbar")

// Kirim pesan ke parent (popup) ketika navigasi diklik
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const page = item.dataset.page
    console.log("Navbar klik:", page)

    // Kirim ke parent window (popup)
    if (window.parent) {
      window.parent.postMessage({ type: "NAV_CLICK", page: page }, "*")
      console.log("Pesan NAV_CLICK terkirim ke parent")
    }

    // Update active class di navbar sendiri (visual feedback)
    document.querySelectorAll(".nav-item").forEach((nav) => {
      nav.classList.remove("bg-amber-50/20")
    })
    item.classList.add("bg-amber-50/20")
  })
})

// Terima SET_ACTIVE dari parent untuk update active class
window.addEventListener("message", (event) => {
  if (event.data?.type === "SET_ACTIVE") {
    const activePage = event.data.page
    console.log("Navbar terima SET_ACTIVE:", activePage)

    document.querySelectorAll(".nav-item").forEach((nav) => {
      if (nav.dataset.page === activePage) {
        nav.classList.add("bg-amber-50/20")
      } else {
        nav.classList.remove("bg-amber-50/20")
      }
    })
  }
})

// Beri tahu parent bahwa navbar sudah siap
if (window.parent) {
  window.parent.postMessage({ type: "NAVBAR_READY" }, "*")
  console.log("Navbar mengirim NAVBAR_READY ke parent")
}
