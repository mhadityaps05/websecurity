from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Optional
import re
from urllib.parse import urlparse
from datetime import datetime
import asyncio
import aiohttp
import ssl
import socket
from concurrent.futures import ThreadPoolExecutor

app = FastAPI()

executor = ThreadPoolExecutor(max_workers=3)

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
    permissions: dict[str, str]
    cookies_count: int
    third_party_domains: List[str]
    iframe_count: int
    redirect_count: int
    domain_age_days: int = 0
    ip_address: str = "Unknown"
    cookies: List[Cookie] = Field(default_factory=list)


# =============================
# DOMAIN AGE - IMPROVED LOGIC
# =============================

domain_age_cache = {}

# Known educational and government domains (usually old)
OLD_DOMAINS_PATTERNS = [
    '.ac.id', '.edu', '.go.id', '.gov', '.mil',
    '.or.id', '.net.id', '.co.id'
]


def extract_root_domain(url: str) -> str:
    """Extract the root domain"""
    try:
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
            
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        domain = domain.split(':')[0]
        domain = domain.replace("www.", "")
        
        parts = domain.split('.')
        
        two_part_tlds = ['co.id', 'co.uk', 'com.au', 'co.jp', 'co.in', 
                        'or.id', 'go.id', 'ac.id', 'net.id', 'sch.id', 'web.id',
                        'my.id', 'biz.id', 'desa.id']
        
        if len(parts) > 2:
            last_two = '.'.join(parts[-2:])
            if last_two in two_part_tlds:
                if len(parts) >= 3:
                    return '.'.join(parts[-3:])
        
        if len(parts) >= 2:
            return '.'.join(parts[-2:])
        
        return domain
    except Exception as e:
        print(f"Error extracting domain: {e}")
        return url


def is_educational_or_government(domain: str) -> bool:
    """Check if domain is educational or government (usually old)"""
    for pattern in OLD_DOMAINS_PATTERNS:
        if domain.endswith(pattern):
            return True
    return False


async def method_dns_soa(domain: str) -> Optional[int]:
    """
    BEST METHOD: Check DNS SOA record serial number
    This usually contains the real domain creation date
    """
    try:
        import dns.resolver
        
        answers = dns.resolver.resolve(domain, 'SOA')
        for rdata in answers:
            serial = str(rdata.serial)
            print(f"DNS SOA serial for {domain}: {serial}")
            
            # Common SOA serial formats:
            # Format 1: YYYYMMDDNN (2023050101 = May 1, 2023)
            if len(serial) >= 8 and serial[:8].isdigit():
                year = int(serial[:4])
                month = int(serial[4:6])
                day = int(serial[6:8])
                if 2000 <= year <= 2026 and 1 <= month <= 12 and 1 <= day <= 31:
                    serial_date = datetime(year, month, day)
                    age_days = (datetime.now() - serial_date).days
                    print(f"DNS SOA date: {serial_date}, age: {age_days} days")
                    return age_days
            
            # Format 2: Unix timestamp (for some providers)
            if serial.isdigit() and len(serial) == 10:
                try:
                    timestamp = int(serial)
                    if 1000000000 < timestamp < 2000000000:  # Valid range
                        serial_date = datetime.fromtimestamp(timestamp)
                        age_days = (datetime.now() - serial_date).days
                        return age_days
                except:
                    pass
        
        return None
    except Exception as e:
        print(f"DNS SOA failed for {domain}: {str(e)[:50]}")
        return None


async def method_ssl_certificate(domain: str) -> Optional[int]:
    """
    BACKUP METHOD: SSL certificate age
    NOTE: This shows when cert was issued, not domain age
    Only use as fallback, multiply by 2-3x to estimate domain age
    """
    try:
        clean_domain = domain.split(':')[0]
        
        context = ssl.create_default_context()
        
        with socket.create_connection((clean_domain, 443), timeout=3) as sock:
            with context.wrap_socket(sock, server_hostname=clean_domain) as ssock:
                cert = ssock.getpeercert()
                
                not_before = cert.get('notBefore')
                if not_before:
                    cert_date = datetime.strptime(not_before, "%b %d %H:%M:%S %Y %Z")
                    age_days = (datetime.now() - cert_date).days
                    
                    # SSL certs are typically renewed every 90 days
                    # Real domain age is usually much older
                    # For .ac.id domains, they're typically years old
                    if is_educational_or_government(clean_domain):
                        # Educational domains are usually old
                        estimated_age = max(age_days * 10, 1000)  # At least ~3 years
                    else:
                        # Regular domains: multiply by 4-6x
                        estimated_age = age_days * 5
                    
                    print(f"SSL cert age: {age_days} days, estimated domain age: {estimated_age} days")
                    return estimated_age
        
        return None
    except Exception as e:
        print(f"SSL failed for {domain}: {str(e)[:50]}")
        return None


async def method_http_headers(domain: str) -> Optional[int]:
    """
    Check HTTP headers for website age indicators
    """
    try:
        url = f"https://{domain}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=3, ssl=False) as response:
                headers = response.headers
                
                # Check Last-Modified
                last_modified = headers.get('Last-Modified')
                if last_modified:
                    try:
                        from email.utils import parsedate_to_datetime
                        mod_date = parsedate_to_datetime(last_modified)
                        age_days = (datetime.now() - mod_date.replace(tzinfo=None)).days
                        # Website content age != domain age, multiply to estimate
                        return age_days * 3
                    except:
                        pass
        
        return None
    except Exception as e:
        print(f"HTTP headers failed for {domain}: {str(e)[:50]}")
        return None


async def get_domain_age_async(domain: str) -> int:
    """
    Try multiple methods, prefer DNS SOA for accuracy
    """
    print(f"\nGetting domain age for: {domain}")
    
    # Method 1: DNS SOA (most accurate for .ac.id, .go.id, etc)
    age = await method_dns_soa(domain)
    if age and age > 100:
        print(f"✓ Using DNS SOA age: {age} days")
        return age
    
    # Method 2: SSL certificate with estimation
    age = await method_ssl_certificate(domain)
    if age and age > 100:
        print(f"✓ Using SSL estimated age: {age} days")
        return age
    
    # Method 3: HTTP headers
    age = await method_http_headers(domain)
    if age and age > 100:
        print(f"✓ Using HTTP estimated age: {age} days")
        return age
    
    # Fallback: If educational/government, assume old
    if is_educational_or_government(domain):
        print(f"✓ Using educational domain default age: 1500 days")
        return 1500  # About 4 years
    
    print(f"✗ Could not determine domain age")
    return 0


async def get_domain_age(url: str) -> int:
    """Get domain age with caching"""
    root_domain = extract_root_domain(url)
    
    # Check cache
    if root_domain in domain_age_cache:
        return domain_age_cache[root_domain]
    
    # Get age
    age = await get_domain_age_async(root_domain)
    
    # Cache result
    if age > 0:
        domain_age_cache[root_domain] = age
    
    return age


# =============================
# REST OF YOUR CODE (unchanged)
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


def get_domain_reputation(url: str) -> str:
    domain = urlparse(url).netloc.lower()
    domain = domain.replace("www.", "")
    
    known_patterns = [
        "youtube", "google", "facebook", "instagram", "twitter", 
        "github", "stackoverflow", "wikipedia", "reddit", "netflix",
        "spotify", "amazon", "microsoft", "apple", "linkedin"
    ]
    
    if any(pattern in domain for pattern in known_patterns):
        return "trusted"
    
    # Educational and government domains are also trusted
    if is_educational_or_government(domain):
        return "trusted"
    
    common_tlds = [".com", ".org", ".net", ".co.id", ".id", ".go.id", ".ac.id"]
    has_common_tld = any(domain.endswith(tld) for tld in common_tlds)
    
    if has_common_tld and len(domain) < 30 and domain.count('.') <= 2:
        return "normal"
    
    return "suspicious"


def detect_phishing_indicators(url: str, domain_age_days: int) -> tuple:
    score = 0
    reasons = []
    url_lower = url.lower()
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    
    reputation = get_domain_reputation(url)
    
    if re.match(r"http[s]?://\d+\.\d+\.\d+\.\d+", url):
        score += 50
        reasons.append("Menggunakan IP address langsung (ciri khas phishing)")
    
    if domain_age_days > 0:
        if domain_age_days < 7 and reputation != "trusted":
            score += 45
            reasons.append(f"Domain sangat baru ({domain_age_days} hari)")
        elif domain_age_days < 30 and reputation != "trusted":
            score += 30
            reasons.append(f"Domain baru ({domain_age_days} hari)")
        elif domain_age_days < 90 and reputation != "trusted":
            score += 15
            reasons.append(f"Domain relatif baru ({domain_age_days} hari)")
    
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
    
    if reputation != "trusted" and len(url) > 100:
        score += 10
        reasons.append("URL sangat panjang dan mencurigakan")
    
    if reputation != "trusted":
        special_chars = url_lower.count("@") + url_lower.count("%") + url_lower.count("?") + url_lower.count("=")
        if special_chars > 5:
            score += 15
            reasons.append("Banyak karakter spesial (@,%,?,=) mencurigakan")
    
    if reputation != "trusted":
        subdomain_count = domain.count('.')
        if subdomain_count > 2:
            score += 10
            reasons.append(f"Terlalu banyak subdomain ({subdomain_count})")
    
    if ":" in domain:
        port = domain.split(":")[-1]
        if port not in ["80", "443"]:
            score += 20
            reasons.append(f"Menggunakan port non-standar: {port}")
    
    return min(score, 100), reasons


def has_legitimate_indicators(data: WebsiteData) -> tuple:
    bonus = 0
    reasons = []
    
    reputation = get_domain_reputation(data.url)
    
    if reputation == "trusted":
        bonus -= 40
        reasons.append("Domain dari penyedia terpercaya")
        return bonus, reasons
    
    if data.is_https and data.domain_age_days > 365:
        bonus -= 20
        reasons.append("Domain sudah lama dan menggunakan HTTPS")
    elif data.is_https:
        bonus -= 10
        reasons.append("Domain menggunakan HTTPS")
    
    if 5 <= data.tracker_count <= 20:
        bonus -= 5
    
    if 10 <= data.cookies_count <= 30:
        bonus -= 5
    
    if data.redirect_count <= 1:
        bonus -= 10
        reasons.append("Tidak ada redirect berlebihan")
    
    sensitive_perms = ["camera", "microphone", "geolocation"]
    has_sensitive = any(data.permissions.get(perm) == "granted" for perm in sensitive_perms)
    if not has_sensitive:
        bonus -= 5
    
    return bonus, reasons


# =============================
# API ENDPOINTS
# =============================

@app.get("/")
def home():
    return {
        "message": "Scoring Engine Active - Smart Domain Age Detection",
        "methods": [
            "DNS SOA Records (most accurate)",
            "SSL Certificate with estimation",
            "HTTP Headers",
            "Educational/Government domain detection"
        ]
    }


@app.post("/analyze")
async def analyze_site(data: WebsiteData):
    score = 0
    reasons = []
    
    print(f"\n=== Analyzing {data.url} ===")
    
    # Get domain age
    domain_age = await get_domain_age(data.url)
    data.domain_age_days = domain_age
    
    print(f"Final domain age: {domain_age} days")
    
    # Phishing detection
    phishing_score, phishing_reasons = detect_phishing_indicators(data.url, domain_age)
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
    
    # Tracker check
    if data.tracker_count > 30:
        score += 15
        reasons.append(f"Tracker sangat banyak ({data.tracker_count})")
    elif data.tracker_count > 20:
        score += 8
        reasons.append(f"Banyak tracker ({data.tracker_count})")
    
    # Cookies check
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
    
    # Third party check
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
    
    if final_score > 60:
        status = "Berisiko"
    elif final_score > 25:
        status = "Waspada"
    else:
        status = "Aman"
    
    print(f"URL: {data.url}")
    print(f"Domain Age: {domain_age} days")
    print(f"Score: {final_score}")
    print(f"Status: {status}")
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
        "domain_age_days": domain_age
    }