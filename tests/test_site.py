"""Static checks for the GitHub Pages landing and social-preview metadata."""

from __future__ import annotations

import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
INDEX = SITE / "index.html"
PREVIEW = SITE / "assets" / "social-preview.png"
PAGES_WORKFLOW = ROOT / ".github" / "workflows" / "pages.yml"

PAGES_ORIGIN = "https://ddedic.github.io/openwrt-wan-observer"
DESCRIPTION = (
    "Open-source speed-test history for OpenWrt, with a native GL.iNet dashboard. "
    "Track measured speeds over time and export records for troubleshooting."
)
PREVIEW_URL = f"{PAGES_ORIGIN}/assets/social-preview.png"
TITLE = "WAN Observer: speed-test history that lives on your router"
FORBIDDEN = (
    "certified proof",
    "contract breach",
    "outage detection",
    "outage monitoring",
    "universal compatibility",
    "every OpenWrt",
    "no bandwidth",
    "uses no data",
)


class _Meta(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: list[dict[str, str]] = []
        self.title = ""
        self._in_title = False
        self._in_head = False
        self.href_src: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        if tag == "head":
            self._in_head = True
        if tag == "meta":
            self.meta.append(ad)
        elif tag == "title" and self._in_head and not self.title:
            self._in_title = True
        if tag in {"a", "link", "img", "script"}:
            for key in ("href", "src"):
                if ad.get(key):
                    self.href_src.append(ad[key])

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag == "head":
            self._in_head = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data

    def content(self, attr: str, name: str) -> str:
        for item in self.meta:
            if item.get("property") == name or item.get("name") == name:
                return item.get("content", "")
        return ""


def _png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path} is not a PNG")
    if data[12:16] != b"IHDR":
        raise AssertionError(f"{path} is missing IHDR")
    return struct.unpack(">II", data[16:24])


class SiteMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = INDEX.read_text(encoding="utf-8")
        parser = _Meta()
        parser.feed(cls.html)
        cls.page = parser

    def test_title_and_approved_descriptions(self) -> None:
        self.assertEqual(self.page.title, TITLE)
        self.assertEqual(self.page.content("name", "description"), DESCRIPTION)
        self.assertEqual(self.page.content("property", "og:description"), DESCRIPTION)
        self.assertEqual(self.page.content("name", "twitter:description"), DESCRIPTION)
        self.assertEqual(self.page.content("property", "og:title"), TITLE)
        self.assertEqual(self.page.content("name", "twitter:title"), TITLE)

    def test_social_image_absolute_pages_url(self) -> None:
        self.assertEqual(self.page.content("property", "og:image"), PREVIEW_URL)
        self.assertEqual(self.page.content("name", "twitter:image"), PREVIEW_URL)
        self.assertEqual(self.page.content("name", "twitter:card"), "summary_large_image")
        self.assertTrue(self.page.content("property", "og:image:alt"))
        self.assertEqual(
            self.page.content("name", "twitter:image:alt"),
            self.page.content("property", "og:image:alt"),
        )

    def test_social_preview_file_matches_declared_dimensions(self) -> None:
        self.assertTrue(PREVIEW.is_file(), f"missing {PREVIEW}")
        width, height = _png_size(PREVIEW)
        self.assertEqual((width, height), (1200, 630))
        self.assertEqual(self.page.content("property", "og:image:width"), str(width))
        self.assertEqual(self.page.content("property", "og:image:height"), str(height))
        self.assertEqual(self.page.content("property", "og:image:type"), "image/png")

    def test_pages_workflow_copies_social_preview(self) -> None:
        workflow = PAGES_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("site/assets/social-preview.png", workflow)
        self.assertIn("ddedic.github.io/openwrt-wan-observer/assets/", workflow)
        self.assertIn("cp site/index.html site/styles.css _site/", workflow)

    def test_description_does_not_overclaim(self) -> None:
        blob = " ".join(
            [
                self.page.content("name", "description"),
                self.page.content("property", "og:description"),
                self.page.content("name", "twitter:description"),
                self.page.content("property", "og:image:alt"),
            ]
        ).lower()
        for phrase in FORBIDDEN:
            self.assertNotIn(phrase, blob, f"overclaim in social text: {phrase}")

    def test_canonical_and_og_url(self) -> None:
        self.assertEqual(self.page.content("property", "og:url"), f"{PAGES_ORIGIN}/")
        self.assertIn(f'href="{PAGES_ORIGIN}/"', self.html)
        # Page-local assets stay relative; social images are absolute Pages URLs.
        for ref in self.page.href_src:
            if ref.startswith("assets/") or ref == "styles.css" or ref.startswith("#") or ref.startswith("https://github.com/") or ref.startswith("./"):
                continue
            if ref.startswith(PAGES_ORIGIN):
                continue
            self.assertFalse(ref.startswith("http"), f"unexpected external page ref: {ref}")


if __name__ == "__main__":
    unittest.main()
