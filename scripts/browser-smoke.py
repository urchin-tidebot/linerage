#!/usr/bin/env python3
"""Browser smoke test for the Nix-built LineRage static site.

Produces deterministic artifacts for visual PR review:
- desktop screenshot
- mobile screenshot
- computed layout/browser metrics
- console messages
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import socket
import socketserver
import sys
import threading
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright  # type: ignore[import-not-found]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def start_server(site_dir: Path) -> tuple[socketserver.TCPServer, str]:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site_dir))
    socketserver.TCPServer.allow_reuse_address = True
    port = free_port()
    server = socketserver.TCPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}/"
    return server, url


def collect_metrics(page, label: str) -> dict:
    return page.evaluate(
        """
        (label) => {
          const rectFor = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
              selector,
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              display: style.display,
              visibility: style.visibility,
              overflow: style.overflow,
            };
          };
          return {
            label,
            title: document.title,
            url: location.href,
            viewport: { width: innerWidth, height: innerHeight },
            document: {
              clientWidth: document.documentElement.clientWidth,
              clientHeight: document.documentElement.clientHeight,
              scrollWidth: document.documentElement.scrollWidth,
              scrollHeight: document.documentElement.scrollHeight,
              bodyScrollWidth: document.body.scrollWidth,
              bodyScrollHeight: document.body.scrollHeight,
            },
            elements: {
              game: rectFor('#game'),
              canvas: rectFor('canvas'),
              hud: rectFor('#hud'),
              touchControls: rectFor('#touch-controls'),
              touchLeft: rectFor('#touch-left'),
              touchRight: rectFor('#touch-right'),
              touchStart: rectFor('#touch-start'),
              inviteUrl: rectFor('#invite-url'),
            },
            touchControlsText: document.querySelector('#touch-controls')?.innerText || '',
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            verticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
          };
        }
        """,
        label,
    )


def run_view(browser, *, url: str, label: str, viewport: dict, screenshot: Path) -> tuple[dict, list[dict]]:
    context = browser.new_context(viewport=viewport, device_scale_factor=1, is_mobile=viewport["width"] < 700)
    page = context.new_page()
    console_messages: list[dict] = []

    def on_console(msg):
        console_messages.append({"type": msg.type, "text": msg.text, "location": msg.location})

    page.on("console", on_console)
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(500)
    metrics = collect_metrics(page, label)
    page.screenshot(path=str(screenshot), full_page=True)
    context.close()
    return metrics, console_messages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, required=True, help="Built static site directory to test")
    parser.add_argument("--out", type=Path, default=Path("artifacts/browser-smoke"), help="Artifact directory")
    parser.add_argument("--chromium", default=os.environ.get("CHROMIUM_BIN", "chromium"), help="Chromium executable")
    args = parser.parse_args()

    site_dir = args.site.resolve()
    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    required = [site_dir / "index.html", site_dir / "js" / "all.js", site_dir / "css" / "base.css"]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        print(f"Missing built site files: {missing}", file=sys.stderr)
        return 2

    server, url = start_server(site_dir)
    all_console: dict[str, list[dict]] = {}
    all_metrics: dict[str, Any] = {"site": str(site_dir), "url": url, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=args.chromium,
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-gpu",
                ],
            )
            try:
                views = {
                    "desktop": {"width": 1024, "height": 768},
                    "mobile": {"width": 390, "height": 844},
                }
                for label, viewport in views.items():
                    metrics, console_messages = run_view(
                        browser,
                        url=url,
                        label=label,
                        viewport=viewport,
                        screenshot=out_dir / f"{label}.png",
                    )
                    all_metrics[label] = metrics
                    all_console[label] = console_messages
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

    (out_dir / "metrics.json").write_text(json.dumps(all_metrics, indent=2) + "\n")
    (out_dir / "console.json").write_text(json.dumps(all_console, indent=2) + "\n")

    errors = [msg for messages in all_console.values() for msg in messages if msg.get("type") == "error"]
    for label in ("desktop", "mobile"):
        controls = all_metrics[label]["elements"]["touchControls"]
        if not controls or controls["display"] == "none" or controls["width"] <= 0 or controls["height"] <= 0:
            print(f"Touch controls are not visible/measurable in {label}: {controls}", file=sys.stderr)
            return 3
        if all_metrics[label]["horizontalOverflow"]:
            print(f"Horizontal overflow detected in {label}", file=sys.stderr)
            return 4

    if errors:
        print(json.dumps(errors, indent=2), file=sys.stderr)
        return 5

    print(f"LineRage browser smoke passed: {url}")
    print(f"Artifacts: {out_dir}")
    print(f"Desktop screenshot: {out_dir / 'desktop.png'}")
    print(f"Mobile screenshot: {out_dir / 'mobile.png'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
