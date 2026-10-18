#!/usr/bin/env python3
"""Build pixbistudio-standalone.html — one double-clickable file, offline-clean.
CSS inlined with fonts as data URIs; every image the page references embedded;
vendored GSAP / ScrollTrigger / Lenis and app.js inlined in load order.
No remote runtime. Run after any source change."""
import base64
import re
from pathlib import Path

DIR = Path(__file__).resolve().parent
OUT = DIR / "pixbistudio-standalone.html"
MIME = {".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml"}


def data_uri(rel: str) -> str:
    path = DIR / rel
    return f"data:{MIME[path.suffix]};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def inline_js(path: Path) -> str:
    # guard against a premature </script> inside minified source
    return path.read_text(encoding="utf-8").replace("</script", "<\\/script")


html = (DIR / "index.html").read_text(encoding="utf-8")
css = (DIR / "styles.css").read_text(encoding="utf-8")

for rel in sorted(set(re.findall(r"url\('(assets/[^']+)'\)", css))):
    css = css.replace(f"url('{rel}')", f"url('{data_uri(rel)}')")
assert "url('assets/" not in css, "css asset left unembedded"

html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")
assert "<style>" in html, "stylesheet link not replaced"

# images: one data URI per file, reused for every reference
for rel in sorted(set(re.findall(r'(?:src|href)="(assets/img/[^"]+)"', html))):
    html = html.replace(f'"{rel}"', f'"{data_uri(rel)}"')
assert 'assets/img/' not in html, "image left unembedded"

for src in ["assets/vendor/gsap.min.js", "assets/vendor/ScrollTrigger.min.js", "assets/vendor/lenis.min.js", "app.js"]:
    tag = f'<script src="{src}"></script>'
    assert tag in html, f"missing tag: {tag}"
    html = html.replace(tag, "<script>\n" + inline_js(DIR / src) + "\n</script>")

OUT.write_text(html, encoding="utf-8")
print(f"built {OUT.name}: {OUT.stat().st_size:,} bytes")
