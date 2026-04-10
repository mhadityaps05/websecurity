// js/core/api.js

const BASE_URL = "http://localhost:8000";

export async function analyzeWebsite(payload) {
  try {
    console.log("📤 Kirim ke backend:", payload);

    const res = await fetch(`${BASE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    console.log("📥 Response backend:", data);
    return data;
  } catch (err) {
    console.error("❌ API Error:", err);
    return {
      status: "Error",
      message: "Backend gagal",
    };
  }
}