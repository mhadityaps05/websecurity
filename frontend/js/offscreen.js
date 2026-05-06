// js/offscreen.js

let audioContext

async function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext

  if (!audioContext) {
    audioContext = new AudioContext()
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume()
  }

  return audioContext
}

function playTone(context, frequency, startTime, duration, volume) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(frequency, startTime)

  gain.gain.setValueAtTime(0.001, startTime)
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  oscillator.connect(gain)
  gain.connect(context.destination)

  oscillator.start(startTime)
  oscillator.stop(startTime + duration + 0.02)
}

async function playAlertSound(status) {
  const context = await getAudioContext()
  const start = context.currentTime + 0.03
  const isDanger = status === "Berisiko"

  if (isDanger) {
    playTone(context, 880, start, 0.14, 0.18)
    playTone(context, 660, start + 0.17, 0.14, 0.18)
    playTone(context, 880, start + 0.34, 0.18, 0.2)
  } else {
    playTone(context, 560, start, 0.16, 0.14)
    playTone(context, 720, start + 0.2, 0.18, 0.14)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "PLAY_ALERT_SOUND") return false

  playAlertSound(message.status)
    .then(() => sendResponse({ status: "ok" }))
    .catch((error) => {
      console.error("Gagal memutar alert sound:", error)
      sendResponse({ status: "error" })
    })

  return true
})
