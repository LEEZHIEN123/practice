"""
Find LiftManual pages for Strength (+ other catalog) workouts and download animated GIFs.
Updates assets/images/*.gif and prints mapping used by workoutInstructionImages.
"""
from __future__ import annotations

import json
import re
import ssl
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "lib" / "workoutCatalog.ts"
IMG_DIR = ROOT / "assets" / "images"
REPORT = ROOT / "scripts" / "liftmanual_gif_report.json"

UA = {"User-Agent": "Mozilla/5.0 (compatible; FitAppGifFetcher/1.0)"}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# Catalog name -> preferred LiftManual slug candidates
ALIASES: dict[str, list[str]] = {
    "Squat": ["squat", "air-squat", "barbell-squat", "barbell-full-squat"],
    "Deadlift": ["barbell-deadlift", "deadlift", "barbell-weighted-deadlift"],
    "Kettlebell swing": ["kettlebell-swing"],
    "Push-up": ["push-up", "push-ups"],
    "Barbell Lunge": ["barbell-lunge", "lunge", "walking-lunge"],
    "Pull-up": ["pull-up", "pull-ups", "chin-up"],
    "Plank": ["plank", "front-plank"],
    "Front squat": ["barbell-front-squat", "front-squat"],
    "Goblet squat": ["goblet-squat", "dumbbell-goblet-squat", "kettlebell-goblet-squat"],
    "Bulgarian split squat": ["bulgarian-split-squat", "dumbbell-bulgarian-split-squat"],
    "Leg press": ["leg-press"],
    "Romanian deadlift": ["romanian-deadlift", "barbell-romanian-deadlift"],
    "Barbell Incline Bench Press": ["barbell-incline-bench-press", "incline-bench-press"],
    "Barbell Overhead Press (high)": ["barbell-overhead-press", "overhead-press", "military-press"],
    "Barbell Row": ["barbell-row", "barbell-bent-over-row", "bent-over-row"],
    "Barbell Snatch": ["barbell-snatch", "snatch"],
    "Barbell Hip Thrust": ["barbell-hip-thrust", "hip-thrust"],
    "Mountain climbers": ["mountain-climber", "mountain-climbers"],
    "Jumping jacks": ["jumping-jack", "jumping-jacks"],
    "Burpees": ["burpee", "burpees"],
    "Jump squats": ["jump-squat", "squat-jump", "jump-squats"],
    "Battle ropes": ["battle-ropes", "battle-rope"],
    "Hooping": ["hula-hoop", "hooping"],
    "Trampoline": ["trampoline"],
    "Walking up stairs": ["stair-climb", "walking-upstairs"],
}


def strength_and_related() -> list[str]:
    """Unique workout names we care about mapping to LiftManual (Strength + HIIT staples)."""
    text = CATALOG.read_text(encoding="utf-8")
    # Parse Strength section only (file order: Yoga, Cardio, HIIT, Strength)
    s = text.find("  Strength: {")
    e = text.find("\n};", s)
    block = text[s:e]
    names = []
    for m in re.finditer(r"(?m)^    (?:\"([^\"]+)\"|([A-Za-z][A-Za-z0-9_-]*)):\s*\{", block):
        names.append(m.group(1) or m.group(2))
    # Also HIIT bodyweight moves often on LiftManual
    hiit_extra = ["Mountain climbers", "Jumping jacks", "Burpees", "Jump squats", "Battle ropes"]
    for n in hiit_extra:
        if n not in names:
            names.append(n)
    return names


def asset_filename(workout: str) -> str:
    """Match existing assets/images naming used by workoutInstructionImages.ts."""
    mapping = {
        "Squat": "Squat.gif",
        "Deadlift": "Deadlift.gif",
        "Kettlebell swing": "kettlebell swing.gif",
        "Push-up": "push ups.gif",
        "Barbell Lunge": "lunge.gif",
        "Pull-up": "pull up.gif",
        "Plank": "plank.gif",
        "Front squat": "Barbell Front Squat.gif",
        "Goblet squat": "Goblet Squat.gif",
        "Bulgarian split squat": "Bulgarian Split Squat.gif",
        "Leg press": "leg press.gif",
        "Romanian deadlift": "Romanian Deadlift.gif",
        "Barbell Incline Bench Press": "Barbell Incline Bench Press.gif",
        "Barbell Overhead Press (high)": "Barbell Overhead Press.gif",
        "Barbell Row": "Barbell Row.gif",
        "Barbell Snatch": "Barbell Snatch.gif",
        "Barbell Hip Thrust": "Barbell Hip Thrust.gif",
        "Mountain climbers": "Mountain Climbers.gif",
        "Jumping jacks": "Jumping Jacks.gif",
        "Burpees": "Burpees.gif",
        "Jump squats": "Jump Squats.gif",
        "Battle ropes": "Battle Ropes.gif",
    }
    return mapping.get(workout, re.sub(r"[^a-zA-Z0-9._-]+", " ", workout).strip() + ".gif")


def fetch(url: str, timeout: int = 30) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
            return r.read()
    except Exception:
        return None


def page_exists(html: str) -> bool:
    if not html or len(html) < 1500:
        return False
    low = html.lower()
    if "page not found" in low or "error-404" in low:
        return False
    return True


def find_gifs(html: str) -> list[str]:
    urls = re.findall(r"https://liftmanual\.com/wp-content/uploads/[^\"'\s>]+\.gif", html, flags=re.I)
    rel = re.findall(r"/wp-content/uploads/[^\"'\s>]+\.gif", html, flags=re.I)
    out = []
    seen = set()
    for u in urls + ["https://liftmanual.com" + r for r in rel]:
        u = u.replace("\\/", "/")
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def frames_of(path: Path) -> int:
    try:
        return getattr(Image.open(path), "n_frames", 1)
    except Exception:
        return 0


def main() -> None:
    workouts = strength_and_related()
    report: dict = {"ok": {}, "page_only": {}, "missing": {}}
    print("Workouts to resolve:", len(workouts))

    for workout in workouts:
        slugs = ALIASES.get(workout) or [
            re.sub(r"[^a-z0-9]+", "-", workout.lower()).strip("-")
        ]
        page_url = None
        html = None
        for slug in slugs:
            url = f"https://liftmanual.com/{slug}/"
            raw = fetch(url)
            if not raw:
                continue
            text = raw.decode("utf-8", errors="ignore")
            if page_exists(text):
                page_url = url
                html = text
                break
            time.sleep(0.05)

        if not html:
            report["missing"][workout] = {"tried": slugs}
            print("NO PAGE ", workout, slugs)
            continue

        gifs = find_gifs(html)
        if not gifs:
            # Probe upload paths
            for slug in slugs:
                for folder in ("2023/04", "2026/05"):
                    probe = f"https://liftmanual.com/wp-content/uploads/{folder}/{slug}.gif"
                    data = fetch(probe, timeout=20)
                    if data and data[:6] in (b"GIF87a", b"GIF89a"):
                        gifs.append(probe)
                        break
                if gifs:
                    break

        if not gifs:
            report["page_only"][workout] = {"page": page_url}
            print("NO GIF  ", workout, "->", page_url)
            continue

        dest = IMG_DIR / asset_filename(workout)
        chosen = None
        best_frames = 0
        for gif_url in gifs:
            data = fetch(gif_url, timeout=60)
            if not data or data[:6] not in (b"GIF87a", b"GIF89a"):
                continue
            dest.write_bytes(data)
            fr = frames_of(dest)
            if fr >= best_frames:
                best_frames = fr
                chosen = {"url": gif_url, "frames": fr, "bytes": len(data), "file": dest.name}
            if fr >= 2:
                break

        if chosen:
            report["ok"][workout] = {"page": page_url, **chosen}
            print(f"OK frames={chosen['frames']:2d}  {workout}  <- {chosen['url']}")
        else:
            report["page_only"][workout] = {"page": page_url, "gifs_failed": gifs}
            print("FAIL GIF", workout)

        time.sleep(0.15)

    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("\nSaved report", REPORT)
    print("ok", len(report["ok"]), "page_only", len(report["page_only"]), "missing", len(report["missing"]))


if __name__ == "__main__":
    main()
