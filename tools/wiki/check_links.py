#!/usr/bin/env python3
"""tools/wiki/check_links.py - check each internal href and #anchor in docs/."""
import pathlib, re, sys
D = pathlib.Path(__file__).resolve().parent.parent.parent / "docs"
ids = {f.name: set(re.findall(r'\bid="([^"]+)"', f.read_text(encoding="utf-8"))) for f in D.glob("*.html")}
bad, n = [], 0
for f in D.glob("*.html"):
    for h in set(re.findall(r'href="([^"]+)"', f.read_text(encoding="utf-8"))):
        if re.match(r"https?:|mailto:|\.\./|assets/", h):
            continue
        n += 1
        page, _, frag = h.partition("#")
        page = page or f.name
        if page not in ids:
            bad.append(f"{f.name}: {h}")
        elif frag and frag not in ids[page]:
            bad.append(f"{f.name}: {h}")
print(f"links: {n} checked, {len(bad)} broken")
print("\n".join(sorted(bad)[:30]))
sys.exit(1 if bad else 0)
