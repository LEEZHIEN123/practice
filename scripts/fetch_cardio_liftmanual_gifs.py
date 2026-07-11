"""Download LiftManual GIFs for walking/running/rope/battle/boxing workouts."""
from __future__ import annotations

import re
import ssl
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "images"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = {"User-Agent": "Mozilla/5.0"}


def get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=CTX, timeout=45) as r:
            return r.read()
    except Exception:
        return None


def frames(path: Path) -> int:
    try:
        return getattr(Image.open(path), "n_frames", 1)
    except Exception:
        return 0


def collect_gif_urls() -> list[str]:
    index = get("https://liftmanual.com/wp-sitemap.xml")
    if not index:
        return []
    text = index.decode("utf-8", "ignore")
    sitemaps = re.findall(r"<loc>(https://liftmanual.com/post-sitemap[^<]+)</loc>", text)
    urls: set[str] = set()
    for sm in sitemaps:
        xml = get(sm)
        if not xml:
            continue
        found = re.findall(
            r"https://liftmanual.com/wp-content/uploads/[^<\"']+\.gif",
            xml.decode("utf-8", "ignore"),
            flags=re.I,
        )
        urls.update(found)
    return sorted(urls)


# local filename -> keywords to prefer (ordered)
TARGETS: dict[str, list[str]] = {
    "Walking.gif": ["treadmill-walk", "walking-treadmill", "walk-treadmill", "brisk-walk", "walking"],
    "Jogging.gif": ["jog", "jogging"],
    "Running.gif": ["run-treadmill", "treadmill-run", "running-treadmill", "sprint", "run"],
    "Curved Treadmill.gif": ["curved-treadmill", "treadmill", "incline-treadmill"],
    "Rope Jumping.gif": ["jump-rope", "jumping-rope", "skipping", "rope-jump", "jump-rope"],
    "Battle Ropes.gif": ["battle-rope", "battle-ropes", "battling-rope"],
    "Boxing Punching Bag.gif": ["punching-bag", "heavy-bag", "boxing-bag", "boxer", "boxing"],
}


def score(url: str, keywords: list[str]) -> int:
    name = url.split("/")[-1].lower()
    best = -1
    for i, kw in enumerate(keywords):
        if kw in name:
            # earlier keyword = better; exact-ish longer match preferred
            best = max(best, 1000 - i * 10 + len(kw))
    return best


def main() -> None:
    urls = collect_gif_urls()
    print("total liftmanual gifs", len(urls))
    # show candidates
    for fname, kws in TARGETS.items():
        ranked = sorted(((score(u, kws), u) for u in urls), reverse=True)
        ranked = [(s, u) for s, u in ranked if s >= 0][:5]
        print(fname, ranked)

    chosen: dict[str, str] = {}
    for fname, kws in TARGETS.items():
        ranked = sorted(((score(u, kws), u) for u in urls), reverse=True)
        for s, u in ranked:
            if s < 0:
                break
            data = get(u)
            if not data or data[:6] not in (b"GIF87a", b"GIF89a"):
                continue
            path = IMG / fname
            path.write_bytes(data)
            fr = frames(path)
            if fr < 2:
                continue
            chosen[fname] = u
            print(f"OK {fname} frames={fr} <- {u}")
            break
        else:
            print(f"MISS {fname}")

    # Also probe direct known slugs
    probes = {
        "Walking.gif": ["treadmill-walk.gif", "walking.gif", "brisk-walk.gif"],
        "Jogging.gif": ["jog.gif", "jogging.gif"],
        "Running.gif": ["treadmill-run.gif", "running.gif", "run.gif"],
        "Curved Treadmill.gif": ["curved-treadmill.gif", "treadmill.gif"],
        "Rope Jumping.gif": ["jump-rope.gif", "jumping-rope.gif", "skipping-rope.gif"],
        "Battle Ropes.gif": ["battle-ropes.gif", "battle-rope.gif"],
        "Boxing Punching Bag.gif": ["punching-bag.gif", "heavy-bag.gif", "boxing.gif"],
    }
    for fname, names in probes.items():
        if fname in chosen:
            continue
        for folder in ("2023/04", "2026/05"):
            for n in names:
                u = f"https://liftmanual.com/wp-content/uploads/{folder}/{n}"
                data = get(u)
                if not data or data[:6] not in (b"GIF87a", b"GIF89a"):
                    continue
                path = IMG / fname
                path.write_bytes(data)
                fr = frames(path)
                if fr >= 2:
                    chosen[fname] = u
                    print(f"PROBE OK {fname} frames={fr} <- {u}")
                    break
            if fname in chosen:
                break
        if fname not in chosen:
            print(f"STILL MISS {fname}")


if __name__ == "__main__":
    main()
