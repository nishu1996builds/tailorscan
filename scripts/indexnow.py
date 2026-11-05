#!/usr/bin/env python3
"""Submits every URL in the sitemap to IndexNow (Bing, Yandex, Seznam, Naver). Run after a deploy."""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
site = json.loads((ROOT / "data/site.json").read_text())
key = site.get("indexnow_key")
if not key:
    sys.exit("No indexnow_key in data/site.json")
base = (("https://" + site["custom_domain"]) if site.get("custom_domain") else site["base_url"]).rstrip("/")
urls = re.findall(r"<loc>([^<]+)</loc>", (ROOT / "dist/sitemap.xml").read_text())
payload = {"host": re.sub(r"^https?://([^/]+).*", r"\1", base), "key": key, "keyLocation": f"{base}/{key}.txt", "urlList": urls}
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=json.dumps(payload).encode(),
                             headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"IndexNow: HTTP {r.status} for {len(urls)} URLs")
except urllib.error.HTTPError as e:
    print(f"IndexNow: HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
    sys.exit(0 if e.code in (202,) else 1)
