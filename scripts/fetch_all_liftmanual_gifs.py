"""Download every LiftManual .gif referenced in the post sitemap and map to catalog workouts."""
from __future__ import annotations

import json
import re
import ssl
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "images"
REPORT = ROOT / "scripts" / "liftmanual_all_gifs.json"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = {"User-Agent": "Mozilla/5.0"}

# Map LiftManual slug/filename keywords -> catalog workout + local asset filename
MAP = [
    (["push-up", "push_up", "pushup"], "Push-up", "push ups.gif"),
    (["pull-up", "pull_up", "chin-up"], "Pull-up", "pull up.gif"),
    (["plank"], "Plank", "plank.gif"),
    (["goblet-squat", "goblet_squat"], "Goblet squat", "Goblet Squat.gif"),
    (["bulgarian", "split-squat"], "Bulgarian split squat", "Bulgarian Split Squat.gif"),
    (["snatch"], "Barbell Snatch", "Barbell Snatch.gif"),
    (["deadlift"], "Deadlift", "Deadlift.gif"),
    (["romanian"], "Romanian deadlift", "Romanian Deadlift.gif"),
    (["front-squat"], "Front squat", "Barbell Front Squat.gif"),
    (["squat"], "Squat", "Squat.gif"),  # after more specific squat variants
    (["lunge"], "Barbell Lunge", "lunge.gif"),
    (["kettlebell-swing", "kb-swing"], "Kettlebell swing", "kettlebell swing.gif"),
    (["hip-thrust"], "Barbell Hip Thrust", "Barbell Hip Thrust.gif"),
    (["incline-bench", "incline-press"], "Barbell Incline Bench Press", "Barbell Incline Bench Press.gif"),
    (["overhead-press", "military-press", "shoulder-press"], "Barbell Overhead Press (high)", "Barbell Overhead Press.gif"),
    (["bent-over-row", "barbell-row"], "Barbell Row", "Barbell Row.gif"),
    (["leg-press"], "Leg press", "leg press.gif"),
    (["mountain-climber"], "Mountain climbers", "Mountain Climbers.gif"),
    (["jumping-jack"], "Jumping jacks", "Jumping Jacks.gif"),
    (["burpee"], "Burpees", "Burpees.gif"),
    (["jump-squat", "squat-jump"], "Jump squats", "Jump Squats.gif"),
    (["battle-rope"], "Battle ropes", "Battle Ropes.gif"),
]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        return r.read()


def frames(path: Path) -> int:
    try:
        return getattr(Image.open(path), "n_frames", 1)
    except Exception:
        return 0


def main() -> None:
    # Collect all post sitemaps
    index = get("https://liftmanual.com/wp-sitemap.xml").decode("utf-8", "ignore")
    sitemaps = re.findall(r"<loc>(https://liftmanual.com/[^<]*sitemap[^<]*)</loc>", index)
    print("sitemaps", sitemaps)

    gif_urls: set[str] = set()
    for sm in sitemaps:
        if "users" in sm:
            continue
        try:
            xml = get(sm).decode("utf-8", "ignore")
        except Exception as e:
            print("fail", sm, e)
            continue
        # image sitemap tags + any .gif urls
        found = re.findall(r"https://liftmanual.com/wp-content/uploads/[^<\"']+\.gif", xml, flags=re.I)
        gif_urls.update(found)
        print(sm, "gifs", len(found))

    # Also crawl a few known upload folders by probing common names from MAP
    print("unique gif urls from sitemaps:", len(gif_urls))

    # Match and download
    assigned: dict[str, dict] = {}
    for url in sorted(gif_urls):
        name = url.split("/")[-1].lower()
        for keys, workout, filename in MAP:
            if any(k in name or k in url.lower() for k in keys):
                # Prefer multi-frame / larger files; keep first good match unless better frames
                data = get(url)
                if data[:6] not in (b"GIF87a", b"GIF89a"):
                    break
                dest = IMG / filename
                prev = assigned.get(workout)
                dest.write_bytes(data)
                fr = frames(dest)
                info = {"url": url, "file": filename, "frames": fr, "bytes": len(data)}
                if not prev or fr > prev.get("frames", 0) or (
                    fr == prev.get("frames", 0) and len(data) > prev.get("bytes", 0)
                ):
                    assigned[workout] = info
                    print(f"MAP {workout} frames={fr} <- {url}")
                break

    # Probe direct paths for catalog exercises not assigned
    probes = {
        "Squat": ["squat.gif", "air-squat.gif", "barbell-squat.gif", "barbell-full-squat.gif"],
        "Deadlift": ["barbell-deadlift.gif", "deadlift.gif", "barbell-weighted-deadlift.gif"],
        "Kettlebell swing": ["kettlebell-swing.gif"],
        "Barbell Lunge": ["barbell-lunge.gif", "lunge.gif", "walking-lunge.gif"],
        "Pull-up": ["pull-up.gif", "pull-ups.gif", "chin-up.gif"],
        "Front squat": ["barbell-front-squat.gif", "front-squat.gif"],
        "Leg press": ["leg-press.gif", "sled-leg-press.gif"],
        "Romanian deadlift": ["romanian-deadlift.gif", "barbell-romanian-deadlift.gif"],
        "Barbell Incline Bench Press": ["barbell-incline-bench-press.gif", "incline-bench-press.gif"],
        "Barbell Overhead Press (high)": [
            "barbell-overhead-press.gif",
            "overhead-press.gif",
            "military-press.gif",
        ],
        "Barbell Row": ["barbell-row.gif", "barbell-bent-over-row.gif", "bent-over-row.gif"],
        "Barbell Hip Thrust": ["barbell-hip-thrust.gif", "hip-thrust.gif"],
        "Mountain climbers": ["mountain-climber.gif", "mountain-climbers.gif"],
        "Jumping jacks": ["jumping-jack.gif", "jumping-jacks.gif"],
        "Burpees": ["burpee.gif", "burpees.gif"],
        "Jump squats": ["jump-squat.gif", "squat-jump.gif"],
        "Battle ropes": ["battle-ropes.gif", "battle-rope.gif"],
    }
    file_for = {w: f for _, w, f in MAP}
    for workout, files in probes.items():
        if workout in assigned and assigned[workout]["frames"] >= 2:
            continue
        for folder in ("2023/04", "2026/05", "2024/06", "2025/01"):
            for fname in files:
                url = f"https://liftmanual.com/wp-content/uploads/{folder}/{fname}"
                try:
                    data = get(url)
                except Exception:
                    continue
                if data[:6] not in (b"GIF87a", b"GIF89a"):
                    continue
                dest = IMG / file_for.get(workout, fname)
                dest.write_bytes(data)
                fr = frames(dest)
                assigned[workout] = {"url": url, "file": dest.name, "frames": fr, "bytes": len(data)}
                print(f"PROBE {workout} frames={fr} <- {url}")
                break
            if workout in assigned and assigned[workout].get("url", "").startswith(
                f"https://liftmanual.com/wp-content/uploads/{folder}/"
            ):
                break

    REPORT.write_text(json.dumps(assigned, indent=2), encoding="utf-8")
    print("\nAssigned", len(assigned))
    for w, info in assigned.items():
        print(f"  {w}: frames={info['frames']} {info['file']}")


if __name__ == "__main__":
    main()
