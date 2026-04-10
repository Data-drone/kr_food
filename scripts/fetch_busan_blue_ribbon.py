#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


BASE_URL = "https://www.visitbusan.net"
LIST_URL = f"{BASE_URL}/index.do?menuCd=DOM_000000201002002000"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)
APP_NAME = "https://kr-food.brian-law.dev/"


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def clean_html_text(raw: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_list_page(html: str) -> list[dict]:
    items = []
    pattern = re.compile(
        r'<li class="contents">\s*<a href="(?P<href>[^"]+)">.*?'
        r'<ul class="ribbon">(?P<ribbons>.*?)</ul>.*?'
        r'<div class="title">\s*(?P<title>.*?)\s*</div>.*?'
        r'<p class="exp">\s*(?P<category>.*?)\s*</p>.*?'
        r'<li class="adress">\s*(?P<address>.*?)\s*</li>.*?'
        r'<li class="time">\s*(?P<hours>.*?)\s*</li>.*?'
        r'<li class="tag">.*?<li>(?P<tag>.*?)</li>',
        re.DOTALL,
    )
    for match in pattern.finditer(html):
        href = unescape(match.group("href"))
        title = clean_html_text(match.group("title"))
        category = clean_html_text(match.group("category"))
        address = clean_html_text(match.group("address"))
        hours = clean_html_text(match.group("hours"))
        tag = clean_html_text(match.group("tag"))
        ribbon_count = match.group("ribbons").count("블루리본 아이콘2")
        query = parse_qs(urlparse(href).query)
        uc_seq = query.get("uc_seq", [""])[0]
        items.append(
            {
                "id": uc_seq,
                "name": title,
                "category": category,
                "address": address,
                "hoursSummary": hours,
                "theme": tag,
                "ribbons": ribbon_count,
                "detailPath": href,
            }
        )
    return items


def parse_detail_page(html: str, item: dict) -> dict:
    def extract(label: str) -> str:
        match = re.search(
            rf"<li><span>{label}</span>\s*(.*?)</li>",
            html,
            flags=re.DOTALL,
        )
        return clean_html_text(match.group(1)) if match else ""

    def extract_float(name: str) -> float | None:
        match = re.search(rf"{name}\s*=\s*([0-9]+\.[0-9]+)", html)
        return float(match.group(1)) if match else None

    desc_match = re.search(
        r'<div class="vTab01 boxing tripvideo"[^>]*>.*?<div class="cont">\s*(.*?)\s*</div>',
        html,
        flags=re.DOTALL,
    )
    rating_match = re.search(r"평점 .*?<span>([0-9.]+)</span>", html, flags=re.DOTALL)
    view_match = re.search(r'조회 <span class="count">([\d,]+)</span>', html)

    lat = extract_float("default_lat")
    lng = extract_float("default_lng")
    detail_url = urljoin(BASE_URL, item["detailPath"])

    query = f'{item["name"]} {item["address"]}'
    district_match = re.search(r"부산\s+([^\s]+)", item["address"])
    district = district_match.group(1) if district_match else ""

    google_search = f"https://www.google.com/maps/search/?api=1&query={quote(query)}"
    google_directions = (
        f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=walking"
        if lat is not None and lng is not None
        else google_search
    )
    kakao_map = (
        f"https://map.kakao.com/link/map/{quote(item['name'])},{lat},{lng}"
        if lat is not None and lng is not None
        else f"https://map.kakao.com/?q={quote(query)}"
    )
    kakao_route = (
        f"https://map.kakao.com/link/to/{quote(item['name'])},{lat},{lng}"
        if lat is not None and lng is not None
        else kakao_map
    )
    naver_map = (
        "https://map.naver.com/p/search/" + quote(query)
    )
    naver_route = (
        "nmap://navigation?"
        + urlencode(
            {
                "dlat": f"{lat:.6f}" if lat is not None else "",
                "dlng": f"{lng:.6f}" if lng is not None else "",
                "dname": item["name"],
                "appname": APP_NAME,
            }
        )
        if lat is not None and lng is not None
        else naver_map
    )

    item.update(
        {
            "phone": extract("전화"),
            "hours": extract("영업시간"),
            "closed": extract("휴일"),
            "menu": extract("메뉴"),
            "district": district,
            "description": clean_html_text(desc_match.group(1)) if desc_match else "",
            "rating": float(rating_match.group(1)) if rating_match else None,
            "views": int(view_match.group(1).replace(",", "")) if view_match else None,
            "lat": lat,
            "lng": lng,
            "visitBusanUrl": detail_url,
            "links": {
                "googleSearch": google_search,
                "googleDirections": google_directions,
                "kakaoMap": kakao_map,
                "kakaoDirections": kakao_route,
                "naverMap": naver_map,
                "naverDirections": naver_route,
            },
        }
    )
    return item


def page_urls() -> list[str]:
    return [LIST_URL] + [f"{LIST_URL}&page_no={page}" for page in range(2, 10)]


def main() -> int:
    all_items: list[dict] = []
    seen_ids: set[str] = set()
    for url in page_urls():
        html = fetch_text(url)
        for item in parse_list_page(html):
            if item["id"] and item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                all_items.append(item)

    if len(all_items) != 100:
        print(f"Expected 100 items, found {len(all_items)}", file=sys.stderr)
        return 1

    detailed_items = []
    for item in all_items:
        detail_url = urljoin(BASE_URL, item["detailPath"])
        html = fetch_text(detail_url)
        detailed_items.append(parse_detail_page(html, item))

    detailed_items.sort(key=lambda restaurant: restaurant["name"])

    output = {
        "source": {
            "name": "Visit Busan - Blue Ribbon Selected Busan 100",
            "listingUrl": LIST_URL,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        },
        "count": len(detailed_items),
        "restaurants": detailed_items,
    }

    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)
    (data_dir / "restaurants.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(detailed_items)} restaurants to {data_dir / 'restaurants.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
