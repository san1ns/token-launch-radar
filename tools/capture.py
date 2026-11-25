"""Recapture the three dossier images from the generated dashboard, using an offline Chromium context."""
import argparse
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--dashboard", type=Path, default=root / "out" / "dashboard" / "index.html")
parser.add_argument("--output", type=Path, default=root / "screenshots")
parser.add_argument("--browser", help="Optional path to a Chromium or Chrome Headless Shell executable")
args = parser.parse_args()
url = args.dashboard.resolve().as_uri()
args.output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    opts = {"headless": True}
    if args.browser:
        opts["executable_path"] = str(Path(args.browser).resolve())
    with pw.chromium.launch(**opts) as browser:
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                                      offline=True, reduced_motion="reduce", locale="en-US", timezone_id="UTC")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        def capture(params, filename, ready):
            page.goto(url + "#" + urlencode({"view": "board", "lang": "en", **params}))
            page.locator(ready).first.wait_for()
            page.evaluate("document.fonts.ready")
            page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
            page.screenshot(path=args.output / filename, animations="disabled")
        capture({}, "1-board.png", "#body tr")
        rows = page.evaluate("window.LAUNCH_ATLAS.rows.map(r => ({slug:r.slug,official:r.official,category:r.category,n:r.model.count,chains:r.chains}))")
        detail = next((r for r in rows if r["slug"] == "curvance"), next((r for r in rows if r["n"] >= 4), rows[0]))
        capture({"asset": detail["slug"]}, "2-detail.png", ".plan li")
        early = [r for r in rows if not r["official"]]
        sectors = Counter(r["category"] for r in early if r["category"])
        sector = "Lending" if sectors["Lending"] else (sectors.most_common(1)[0][0] if sectors else "")
        filtered = {"scope": "early", "cat": sector}
        if sum("Solana" in r["chains"] for r in early if r["category"] == sector) >= 3:
            filtered["chain"] = "Solana"
        capture(filtered, "3-filtered.png", "#matches")
        if errors:
            raise RuntimeError(errors)

