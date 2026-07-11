"""Parse WORKOUT_DETAILS keys (quoted and bare identifiers)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "lib" / "workoutCatalog.ts").read_text(encoding="utf-8")

# Slice WORKOUT_DETAILS object
start = text.find("export const WORKOUT_DETAILS")
start = text.find("{", start)
# find matching close at type level is hard; use section markers
types = ["Yoga", "Strength", "HIIT", "Cardio"]
result = {}
for i, t in enumerate(types):
    marker = f"  {t}: {{"
    s = text.find(marker, start)
    if s < 0:
        result[t] = []
        continue
    s = s + len(marker)
    if i + 1 < len(types):
        e = text.find(f"  {types[i+1]}: {{", s)
    else:
        e = text.find("\n};", s)
    block = text[s:e]
    names = []
    for m in re.finditer(r"(?m)^    (?:\"([^\"]+)\"|([A-Za-z][A-Za-z0-9_-]*)):\s*\{", block):
        name = m.group(1) or m.group(2)
        names.append(name)
    result[t] = names

for t, names in result.items():
    print(t, len(names))
    for n in names:
        print(" ", n)
