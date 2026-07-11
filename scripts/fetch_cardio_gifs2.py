import re
import ssl
import urllib.request
from pathlib import Path

from PIL import Image

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = {"User-Agent": "Mozilla/5.0"}
IMG = Path("assets/images")


def get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=CTX, timeout=45) as r:
            return r.read()
    except Exception:
        return None


index = get("https://liftmanual.com/wp-sitemap.xml").decode("utf-8", "ignore")
sitemaps = re.findall(r"<loc>(https://liftmanual.com/post-sitemap[^<]+)</loc>", index)
urls = set()
for sm in sitemaps:
    xml = get(sm)
    if not xml:
        continue
    urls.update(
        re.findall(
            r"https://liftmanual.com/wp-content/uploads/[^<\"']+\.gif",
            xml.decode("utf-8", "ignore"),
            flags=re.I,
        )
    )

needles = [
    "rope",
    "skip",
    "jump",
    "battle",
    "box",
    "punch",
    "bag",
    "jog",
    "run",
    "walk",
    "tread",
    "cardio",
]
for n in needles:
    hits = sorted(u for u in urls if n in u.lower())
    if hits:
        print("===", n, len(hits))
        for h in hits[:15]:
            print(" ", h.split("/")[-1])

# Prefer exact files
picks = {
    "Walking.gif": [
        "https://liftmanual.com/wp-content/uploads/2023/04/walking-on-treadmill.gif",
        "https://liftmanual.com/wp-content/uploads/2023/04/walking.gif",
    ],
    "Jogging.gif": [
        "https://liftmanual.com/wp-content/uploads/2023/04/run-on-treadmill.gif",
    ],
    "Running.gif": [
        "https://liftmanual.com/wp-content/uploads/2023/04/run-on-treadmill.gif",
    ],
    "Curved Treadmill.gif": [
        "https://liftmanual.com/wp-content/uploads/2023/04/run-on-treadmill.gif",
        "https://liftmanual.com/wp-content/uploads/2023/04/walking-on-treadmill.gif",
    ],
}

# Find best rope/battle/box from list
for u in sorted(urls):
    name = u.split("/")[-1].lower()
    if any(k in name for k in ["jump-rope", "jumping-rope", "skipping-rope", "rope-jump", "jump_rope"]):
        picks.setdefault("Rope Jumping.gif", []).append(u)
    if "battle" in name and "rope" in name:
        picks.setdefault("Battle Ropes.gif", []).append(u)
    if any(k in name for k in ["punch", "boxing", "heavy-bag", "punching"]):
        picks.setdefault("Boxing Punching Bag.gif", []).append(u)
    if "jog" in name:
        picks.setdefault("Jogging.gif", []).append(u)

print("\nPICK PLAN")
for k, v in picks.items():
    print(k, v[:5])

for fname, candidates in picks.items():
    for u in candidates:
        data = get(u)
        if not data or data[:6] not in (b"GIF87a", b"GIF89a"):
            continue
        path = IMG / fname
        path.write_bytes(data)
        fr = getattr(Image.open(path), "n_frames", 1)
        if fr >= 2:
            print("OK", fname, fr, u)
            break
    else:
        print("MISS", fname)
