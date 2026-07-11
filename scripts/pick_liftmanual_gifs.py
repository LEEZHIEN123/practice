"""Download the best LiftManual GIF for each strength catalog workout (exact/close matches only)."""
from __future__ import annotations

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

# Ordered candidates: first existing animated GIF wins.
PICKS: dict[str, tuple[str, list[str]]] = {
    # workout name -> (local filename, candidate upload filenames)
    "Squat": (
        "Squat.gif",
        ["squat.gif", "air-squat.gif", "barbell-squat.gif", "barbell-high-bar-squat.gif", "barbell-full-squat.gif"],
    ),
    "Deadlift": (
        "Deadlift.gif",
        ["barbell-deadlift.gif", "deadlift.gif", "barbell-weighted-deadlift.gif", "barbell-clean-deadlift.gif"],
    ),
    "Kettlebell swing": ("kettlebell swing.gif", ["kettlebell-swing.gif", "kettlebell-two-arm-swing.gif"]),
    "Push-up": ("push ups.gif", ["push-up.gif", "push-ups.gif", "knee-push-up.gif"]),
    "Barbell Lunge": ("lunge.gif", ["barbell-lunge.gif", "barbell-walking-lunge.gif", "lunge.gif", "walking-lunge.gif"]),
    "Pull-up": ("pull up.gif", ["pull-up.gif", "pull-ups.gif", "chin-up.gif"]),
    "Plank": ("plank.gif", ["plank.gif", "front-plank.gif", "front-plank-with-arm-lift.gif", "plank-arm-lifts.gif"]),
    "Front squat": (
        "Barbell Front Squat.gif",
        ["barbell-front-squat.gif", "front-squat.gif", "dumbbell-front-squat.gif"],
    ),
    "Goblet squat": (
        "Goblet Squat.gif",
        ["goblet-squat.gif", "dumbbell-goblet-squat.gif", "kettlebell-goblet-squat.gif"],
    ),
    "Bulgarian split squat": (
        "Bulgarian Split Squat.gif",
        ["bulgarian-split-squat.gif", "dumbbell-bulgarian-split-squat.gif", "dumbbell-split-squat.gif"],
    ),
    "Leg press": ("leg press.gif", ["leg-press.gif", "lever-seated-leg-press.gif", "sled-45-leg-press.gif"]),
    "Romanian deadlift": (
        "Romanian Deadlift.gif",
        ["romanian-deadlift.gif", "barbell-romanian-deadlift.gif", "barbell-stiff-legged-deadlift.gif"],
    ),
    "Barbell Incline Bench Press": (
        "Barbell Incline Bench Press.gif",
        ["barbell-incline-bench-press.gif", "incline-bench-press.gif", "dumbbell-incline-bench-press.gif"],
    ),
    "Barbell Overhead Press (high)": (
        "Barbell Overhead Press.gif",
        [
            "barbell-overhead-press.gif",
            "overhead-press.gif",
            "military-press.gif",
            "barbell-military-press.gif",
            "lever-seated-shoulder-press.gif",
        ],
    ),
    "Barbell Row": (
        "Barbell Row.gif",
        ["barbell-row.gif", "barbell-bent-over-row.gif", "bent-over-row.gif", "barbell-pendlay-row.gif"],
    ),
    "Barbell Snatch": (
        "Barbell Snatch.gif",
        ["barbell-snatch.gif", "snatch.gif", "barbell-power-snatch.gif", "barbell-hang-snatch.gif"],
    ),
    "Barbell Hip Thrust": (
        "Barbell Hip Thrust.gif",
        ["barbell-hip-thrust.gif", "hip-thrust.gif", "barbell-glute-bridge.gif", "frog-hip-thrust.gif"],
    ),
    "Mountain climbers": ("Mountain Climbers.gif", ["mountain-climber.gif", "mountain-climbers.gif"]),
    "Jumping jacks": ("Jumping Jacks.gif", ["jumping-jack.gif", "jumping-jacks.gif"]),
    "Burpees": ("Burpees.gif", ["burpee.gif", "burpees.gif"]),
    "Jump squats": ("Jump Squats.gif", ["jump-squat.gif", "jump-squats.gif", "squat-jump.gif"]),
    "Battle ropes": ("Battle Ropes.gif", ["battle-ropes.gif", "battle-rope.gif"]),
}

FOLDERS = ["2023/04", "2026/05", "2024/06", "2025/01", "2024/01"]


def fetch(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=CTX, timeout=45) as r:
            return r.read()
    except Exception:
        return None


def frames_of(path: Path) -> int:
    try:
        return getattr(Image.open(path), "n_frames", 1)
    except Exception:
        return 0


def main() -> None:
    ok = []
    missing = []
    for workout, (filename, candidates) in PICKS.items():
        dest = IMG / filename
        chosen = None
        for folder in FOLDERS:
            for cand in candidates:
                url = f"https://liftmanual.com/wp-content/uploads/{folder}/{cand}"
                data = fetch(url)
                if not data or data[:6] not in (b"GIF87a", b"GIF89a"):
                    continue
                dest.write_bytes(data)
                fr = frames_of(dest)
                chosen = (url, fr, len(data))
                print(f"OK  {workout:32s} frames={fr:2d}  {cand}")
                break
            if chosen:
                break
        if chosen:
            ok.append(workout)
        else:
            missing.append(workout)
            print(f"MISS {workout}")

    print(f"\nLiftManual GIFs: {len(ok)}/{len(PICKS)}")
    if missing:
        print("Still missing (no LiftManual gif file):", ", ".join(missing))


if __name__ == "__main__":
    main()
