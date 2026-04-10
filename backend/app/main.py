from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List
import re
from urllib.parse import urlparse

app = FastAPI()

# =============================
# MODELS
# =============================

class Cookie(BaseModel):
    name: str
    domain: str


class WebsiteData(BaseModel):
    url: str
    is_https: bool
    tracker_count: int
    permissions: dict[str,str]
    cookies_count: int
    third_party_domains: List[str]
    iframe_count: int
    redirect_count: int
    domain_age_days: int
    ip_address: str = "Unknown"
    cookies: List[Cookie] = Field(default_factory=list)


# =============================
# COOKIE ANALYZER
# =============================

def analyze_cookies(cookies: List[Cookie]):
    cookie_types = set()
    score = 0
    reasons = []

    for c in cookies:
        name = c.name.lower()

        if "session" in name or "auth" in name or "token" in name:
            cookie_types.add("Session")
            score += 8

        elif "_ga" in name or "analytics" in name:
            cookie_types.add("Analytics")
            score += 3

        elif "ads" in name or "track" in name:
            cookie_types.add("Advertising")
            score += 5

        elif "cf_" in name or "secure" in name:
            cookie_types.add("Security")
            score += 0

        else:
            cookie_types.add("General")
            score += 1

    score = min(score, 25)

    if "Session" in cookie_types:
        reasons.append("Menyimpan cookie sesi login")

    if "Advertising" in cookie_types:
        reasons.append("Menggunakan cookie iklan untuk profiling")

    if "Analytics" in cookie_types:
        reasons.append("Menggunakan cookie analytics untuk tracking")

    return score, reasons


# =============================
# DOMAIN REPUTATION CHECK
# =============================

def get_domain_reputation(url: str) -> str:
    """
    Cek reputasi domain berdasarkan pola umum website legitimate
    """
    domain = urlparse(url).netloc.lower()
    domain = domain.replace("www.", "")
    
    # Website legitimate biasanya punya struktur domain yang jelas
    # dan menggunakan TLD umum
    common_tlds = [".com", ".org", ".net", ".co.id", ".id", ".go.id", ".ac.id"]
    has_common_tld = any(domain.endswith(tld) for tld in common_tlds)
    
    # Deteksi domain terkenal dari pola nama
    known_patterns = [
        "youtube", "google", "facebook", "instagram", "twitter", 
        "github", "stackoverflow", "wikipedia", "reddit", "netflix",
        "spotify", "amazon", "microsoft", "apple", "linkedin"
    ]
    
    is_known_domain = any(pattern in domain for pattern in known_patterns)
    
    if is_known_domain:
        return "trusted"
    elif has_common_tld and len(domain) < 30 and domain.count('.') <= 2:
        return "normal"
    else:
        return "suspicious"


# =============================
# ADVANCED PHISHING DETECTION
# =============================

def detect_phishing_indicators(url: str, domain_age_days: int) -> tuple:
    score = 0
    reasons = []
    url_lower = url.lower()
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    
    # Cek reputasi domain dulu
    reputation = get_domain_reputation(url)
    
    # 1. IP Address langsung (tetap beri penalti)
    if re.match(r"http[s]?://\d+\.\d+\.\d+\.\d+", url):
        score += 50
        reasons.append("Menggunakan IP address langsung (ciri khas phishing)")
    
    # 2. Domain baru - hanya beri penalti jika domain tidak trusted dan umur diketahui
    if domain_age_days > 0:  # Hanya proses jika umur domain diketahui
        if domain_age_days < 7 and reputation != "trusted":
            score += 45
            reasons.append("Domain baru kurang dari 7 hari (sangat mencurigakan)")
        elif domain_age_days < 30 and reputation != "trusted":
            score += 30
            reasons.append("Domain baru kurang dari 30 hari")
    elif domain_age_days == 0 and reputation == "suspicious":
        # Jika umur tidak diketahui dan domain mencurigakan
        score += 20
        reasons.append("Umur domain tidak diketahui")
    
    # 3. Deteksi homograph attack (tetap berlaku untuk semua)
    known_brands = ["google", "facebook", "youtube", "instagram", "twitter", 
                    "microsoft", "apple", "amazon", "netflix", "spotify"]
    
    for brand in known_brands:
        if brand in domain and brand not in domain.replace("0", "o").replace("1", "i"):
            leet_count = 0
            leet_mapping = {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a"}
            
            for leet, normal in leet_mapping.items():
                if leet in domain:
                    leet_count += domain.count(leet)
            
            if leet_count > 0:
                score += 50
                reasons.append(f"Domain mencurigakan (homograph attack: {domain})")
                break
    
    # 4. Keyword phishing (hanya untuk domain tidak trusted)
    if reputation != "trusted":
        phishing_keywords = [
            "hadiah", "gratis", "free", "prize", "winner", "bank-login", 
            "update-akun", "verifikasi", "verify", "claim", "reward",
            "login-verify", "secure-login", "account-update", "confirm",
            "security-update", "password-reset", "unlock", "suspicious",
            "gift", "giveaway", "lottery", "jackpot", "whatsapp-web"
        ]
        
        detected_keywords = [kw for kw in phishing_keywords if kw in url_lower]
        if detected_keywords:
            score += 45
            reasons.append(f"Mengandung keyword phishing: {detected_keywords[0]}")
    
    # 5. URL terlalu panjang (hanya untuk domain tidak trusted)
    if reputation != "trusted" and len(url) > 100:
        score += 10
        reasons.append("URL sangat panjang dan mencurigakan")
    
    # 6. Karakter aneh berlebihan (hanya untuk domain tidak trusted)
    if reputation != "trusted":
        special_chars = url_lower.count("@") + url_lower.count("%") + url_lower.count("?") + url_lower.count("=")
        if special_chars > 5:
            score += 15
            reasons.append("Banyak karakter spesial (@,%,?,=) mencurigakan")
    
    # 7. Subdomain berlebihan (hanya untuk domain tidak trusted)
    if reputation != "trusted":
        subdomain_count = domain.count('.')
        if subdomain_count > 2:
            score += 10
            reasons.append(f"Terlalu banyak subdomain ({subdomain_count})")
    
    # 8. Port non-standar (tetap berlaku)
    if ":" in domain:
        port = domain.split(":")[-1]
        if port not in ["80", "443"]:
            score += 20
            reasons.append(f"Menggunakan port non-standar: {port}")
    
    # 9. Domain panjang tanpa makna (hanya untuk domain tidak trusted)
    if reputation != "trusted":
        domain_without_tld = domain.split('.')[0] if '.' in domain else domain
        if len(domain_without_tld) > 20:
            score += 15
            reasons.append("Domain sangat panjang dan tidak jelas")
    
    return min(score, 100), reasons


# =============================
# LEGITIMATE SITE DETECTION
# =============================

def has_legitimate_indicators(data: WebsiteData) -> tuple:
    bonus = 0
    reasons = []
    
    # Cek reputasi domain
    reputation = get_domain_reputation(data.url)
    
    # Jika domain trusted, beri bonus besar
    if reputation == "trusted":
        bonus -= 40
        reasons.append("Domain dari penyedia terpercaya")
        return bonus, reasons
    
    # 1. HTTPS + domain cukup lama
    if data.is_https and data.domain_age_days > 365:
        bonus -= 20
        reasons.append("Domain sudah lama dan menggunakan HTTPS")
    elif data.is_https and data.domain_age_days > 180:
        bonus -= 10
        reasons.append("Domain menggunakan HTTPS")
    
    # 2. Tracker dalam batas wajar
    if 5 <= data.tracker_count <= 20:
        bonus -= 5
    
    # 3. Cookies dalam batas wajar
    if 10 <= data.cookies_count <= 30:
        bonus -= 5
    
    # 4. Redirect minimal
    if data.redirect_count <= 1:
        bonus -= 10
        reasons.append("Tidak ada redirect berlebihan")
    
    # 5. Tidak meminta permission sensitif
    sensitive_perms = ["camera", "microphone", "geolocation"]
    has_sensitive = any(data.permissions.get(perm) == "granted" for perm in sensitive_perms)
    if not has_sensitive:
        bonus -= 5
    
    return bonus, reasons


# =============================
# API
# =============================

@app.get("/")
def home():
    return {"message": "Scoring Engine Active - Improved Version"}


@app.post("/analyze")
def analyze_site(data: WebsiteData):
    score = 0
    reasons = []
    
    # Phishing detection
    phishing_score, phishing_reasons = detect_phishing_indicators(data.url, data.domain_age_days)
    score += phishing_score
    reasons.extend(phishing_reasons)
    
    # Legitimate indicators
    legitimate_bonus, legitimate_reasons = has_legitimate_indicators(data)
    score += legitimate_bonus
    reasons.extend(legitimate_reasons)
    
    # HTTPS check
    if not data.is_https:
        score += 25
        reasons.append("Tidak menggunakan HTTPS")
    
    # Tracker check (hanya jika berlebihan)
    if data.tracker_count > 30:
        score += 15
        reasons.append(f"Tracker sangat banyak ({data.tracker_count})")
    elif data.tracker_count > 20:
        score += 8
        reasons.append(f"Banyak tracker ({data.tracker_count})")
    
    # Cookies check (hanya jika berlebihan)
    if data.cookies_count > 50:
        score += 15
        reasons.append(f"Cookies sangat banyak ({data.cookies_count})")
    elif data.cookies_count > 30:
        score += 8
        reasons.append(f"Banyak cookies ({data.cookies_count})")
    
    # Cookie analysis
    cookie_score, cookie_reasons = analyze_cookies(data.cookies)
    score += cookie_score
    reasons.extend(cookie_reasons)
    
    # Third party check (hanya jika berlebihan)
    if len(data.third_party_domains) > 25:
        score += 10
        reasons.append("Terlalu banyak third-party domain")
    elif len(data.third_party_domains) > 15:
        score += 5
        reasons.append("Banyak third-party domain")
    
    # Iframe check
    if data.iframe_count > 8:
        score += 15
        reasons.append(f"Banyak iframe ({data.iframe_count})")
    elif data.iframe_count > 4:
        score += 5
    
    # Redirect check
    if data.redirect_count > 5:
        score += 20
        reasons.append(f"Redirect berulang ({data.redirect_count}x)")
    elif data.redirect_count > 2:
        score += 8
    
    # Permissions check
    sensitive_permissions = ["camera", "microphone", "geolocation"]
    
    for perm in sensitive_permissions:
        status = data.permissions.get(perm)
        
        if status == "granted":
            score += 20
            reasons.append(f"Akses {perm} diizinkan")
        elif status == "prompt":
            score += 5
    
    # Final score
    final_score = max(0, min(100, score))
    
    # Status determination
    if final_score > 60:
        status = "Berisiko"
    elif final_score > 25:
        status = "Waspada"
    else:
        status = "Aman"
    
    # Debug logs
    print(f"URL: {data.url}")
    print(f"Domain Age: {data.domain_age_days} days")
    print(f"Score: {final_score}")
    print(f"Status: {status}")
    print(f"Reasons: {reasons[:5]}")
    print("---")
    
    return {
        "url": data.url,
        "final_score": final_score,
        "status": status,
        "analysis_details": reasons[:10],
        "cookies_count": data.cookies_count,
        "tracker_count": data.tracker_count,
        "iframe_count": data.iframe_count,
        "third_party_domains_count": len(data.third_party_domains),
        "domain_age_days": data.domain_age_days
    }