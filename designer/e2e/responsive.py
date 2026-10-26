"""Responsive check for the Designer (docs/ui-system.md, step 10). Full-width strips such as the
sheet handle are exempt from the 44 px rule: their area is wide enough to hit.

Usage: python3 -I e2e/responsive.py <base-url> <screenshot-dir>
Run `bun run build && bunx vite preview --port 4317` first, or point it at the live site.
Fails with a non-zero exit when a rule breaks.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
SIZES = {"phone": (390, 844, True), "small-phone": (360, 640, True), "tablet": (820, 1180, True), "desktop": (1440, 900, False)}
failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print("FAIL", msg)


with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, (w, h, touch) in SIZES.items():
        ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch and w < 760, device_scale_factor=2)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_selector("svg .key")
        page.screenshot(path=str(out / f"{name}-1-start.png"))

        sw = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        if sw[0] > sw[1]:
            fail(f"{name}: page is {sw[0]} px wide in a {sw[1]} px viewport")

        if w < 1100:
            small = page.evaluate("""() => [...document.querySelectorAll('button, select, input, label.oc-btn')]
              .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight; })
              .filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 && r.width < 200 && !e.closest('svg'); })
              .map(e => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height))""")
            if small:
                fail(f"{name}: controls under 44 px: {small}")

        # Tap a key: the inspector's Done must be in view.
        page.locator("svg .key").nth(2).click()
        page.wait_for_timeout(350)
        page.screenshot(path=str(out / f"{name}-2-key.png"))
        done = page.get_by_role("button", name="Done")
        box = done.bounding_box()
        if not box or box["y"] + box["height"] > h or box["y"] < 0:
            fail(f"{name}: Done is not in view after tapping a key ({box})")
        done.click()
        page.wait_for_timeout(300)

        # Parts and Build tabs.
        page.get_by_role("tab", name="Parts").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(out / f"{name}-3-parts.png"))
        page.get_by_role("tab", name="Build").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(out / f"{name}-4-build.png"))

        # 3D, explode, tap the middle.
        page.get_by_role("radio", name="3D").click()
        page.wait_for_timeout(800)
        page.get_by_role("button", name="Explode").click()
        page.wait_for_timeout(1200)
        page.screenshot(path=str(out / f"{name}-5-exploded.png"))
        sw = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        if sw[0] > sw[1]:
            fail(f"{name}: 3D view is {sw[0]} px wide in a {sw[1]} px viewport")
        if errors:
            fail(f"{name}: page errors {errors}")
        ctx.close()
    browser.close()

print("ok" if not failures else f"{len(failures)} failures")
sys.exit(1 if failures else 0)
