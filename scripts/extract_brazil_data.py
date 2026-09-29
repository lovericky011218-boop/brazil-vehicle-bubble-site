#!/usr/bin/env python3
"""Stream the Brazil records from the large source workbook into site data."""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
BODY_STYLES = {
    "SUV",
    "Sedan",
    "Hatchback",
    "Wagon",
    "Coupe",
    "Convertible",
    "Roadster",
    "Retractable Hardtop",
    "MPV",
    "Car Utility",
}
YEARS = {2024: "CY2024", 2025: "CY2025", 2026: "CY2026"}
NEEDED = {
    "Country/Territory-Name",
    "Make",
    "Registration Type",
    "Global Sales Sub-Segment",
    "Model (World)",
    "Model",
    "Body Group",
    "Energy Type",
    "Length",
    "Price. (local)",
    "Price. (EUR)",
    *YEARS.values(),
}


def cell_col(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def read_shared_strings(book: zipfile.ZipFile) -> list[str]:
    values: list[str] = []
    with book.open("xl/sharedStrings.xml") as stream:
        for event, element in ET.iterparse(stream, events=("end",)):
            if element.tag == f"{NS}si":
                values.append("".join(node.text or "" for node in element.iter(f"{NS}t")))
                element.clear()
    return values


def value_of(cell: ET.Element, shared: list[str]):
    kind = cell.attrib.get("t")
    value = cell.find(f"{NS}v")
    if value is None or value.text is None:
        inline = cell.find(f"{NS}is")
        return "" if inline is None else "".join(node.text or "" for node in inline.iter(f"{NS}t"))
    raw = value.text
    if kind == "s":
        return shared[int(raw)]
    if kind in {"str", "inlineStr"}:
        return raw
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def as_number(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip().replace(",", "")
        if not text or text.lower() in {"unspecified", "n/a", "na", "-"}:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    return number if math.isfinite(number) else None


def rounded_median(values: list[float]) -> int:
    return round(statistics.median(values))


def safe_id(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def extract(source: Path) -> tuple[list[dict], dict]:
    groups: dict[tuple, dict] = defaultdict(
        lambda: {
            "sales": 0.0,
            "lengths": [],
            "prices": [],
            "local_prices": [],
            "brands": set(),
            "local_models": set(),
            "source_rows": 0,
        }
    )
    counters = defaultdict(int)

    with zipfile.ZipFile(source) as book:
        shared = read_shared_strings(book)
        header_by_col: dict[int, str] = {}
        needed_cols: dict[int, str] = {}
        with book.open("xl/worksheets/sheet7.xml") as stream:
            for event, element in ET.iterparse(stream, events=("end",)):
                if element.tag != f"{NS}row":
                    continue
                row_number = int(element.attrib.get("r", "0"))
                cells = {
                    cell_col(cell.attrib["r"]): value_of(cell, shared)
                    for cell in element.findall(f"{NS}c")
                }
                if row_number == 1:
                    header_by_col = {index: str(value).strip() for index, value in cells.items()}
                    needed_cols = {index: name for index, name in header_by_col.items() if name in NEEDED}
                    missing = NEEDED.difference(needed_cols.values())
                    if missing:
                        raise RuntimeError(f"Missing required columns: {sorted(missing)}")
                    element.clear()
                    continue

                row = {name: cells.get(index, "") for index, name in needed_cols.items()}
                counters["source_rows"] += 1
                if str(row["Country/Territory-Name"]).strip() != "Brazil":
                    element.clear()
                    continue
                counters["brazil_rows"] += 1

                fuel = str(row["Energy Type"]).strip()
                body_group = str(row["Body Group"]).strip()
                segment = str(row["Global Sales Sub-Segment"]).strip()
                registration = str(row["Registration Type"]).strip()
                if not fuel or fuel == "Unspecified" or not body_group or body_group == "Unspecified":
                    counters["dropped_unspecified"] += 1
                    element.clear()
                    continue

                if segment == "PUP":
                    body = "PUP"
                elif registration == "Passenger Cars" and body_group in BODY_STYLES:
                    body = body_group
                else:
                    counters["dropped_body_scope"] += 1
                    element.clear()
                    continue

                model_world = str(row["Model (World)"]).strip()
                if not model_world or model_world == "Unspecified":
                    counters["dropped_model"] += 1
                    element.clear()
                    continue

                length = as_number(row["Length"])
                price = as_number(row["Price. (EUR)"])
                local_price = as_number(row["Price. (local)"])
                if length is None or price is None or length <= 0 or price <= 0:
                    counters["dropped_geometry"] += 1
                    element.clear()
                    continue

                brand = str(row["Make"]).strip()
                local_model = str(row["Model"]).strip()
                for year, sales_header in YEARS.items():
                    sales = as_number(row[sales_header])
                    if sales is None or sales <= 0:
                        continue
                    key = (year, model_world, fuel, body)
                    group = groups[key]
                    group["sales"] += sales
                    group["lengths"].append(length)
                    group["prices"].append(price)
                    if local_price and local_price > 0:
                        group["local_prices"].append(local_price)
                    if brand:
                        group["brands"].add(brand)
                    if local_model and local_model != "Unspecified":
                        group["local_models"].add(local_model)
                    group["source_rows"] += 1
                element.clear()

    records = []
    for (year, model_world, fuel, body), group in sorted(groups.items()):
        prices = group["prices"]
        local_prices = group["local_prices"]
        records.append(
            {
                "id": f"br-{year}-{safe_id(model_world)}-{safe_id(fuel)}-{safe_id(body)}",
                "country": "Brazil",
                "year": year,
                "brand": " / ".join(sorted(group["brands"])),
                "model": model_world,
                "localModels": sorted(group["local_models"]),
                "fuel": fuel,
                "body": body,
                "length": rounded_median(group["lengths"]),
                "price": rounded_median(prices),
                "priceMin": round(min(prices)),
                "priceMax": round(max(prices)),
                "localPrice": rounded_median(local_prices) if local_prices else None,
                "localPriceMin": round(min(local_prices)) if local_prices else None,
                "localPriceMax": round(max(local_prices)) if local_prices else None,
                "sales": round(group["sales"]),
                "sourceRows": group["source_rows"],
            }
        )

    meta = {
        "country": "Brazil",
        "years": list(YEARS),
        "latestYear": 2026,
        "latestPeriod": "2026 YTD (Jan–Apr)",
        "rows": len(records),
        "sourceWorkbook": source.name,
        "sourceSheet": "合并",
        "method": "Passenger Cars body groups plus PUP; Unspecified fuel/body removed; sales summed by year + Model (World) + fuel + body.",
        "counters": dict(counters),
    }
    return records, meta


def validate(records: list[dict]):
    assert records, "No Brazil records extracted"
    assert all(row["country"] == "Brazil" for row in records)
    assert all(row["fuel"] != "Unspecified" and row["body"] != "Unspecified" for row in records)
    assert all(row["length"] > 0 and row["price"] > 0 and row["sales"] > 0 for row in records)
    keys = {(row["year"], row["model"], row["fuel"], row["body"]) for row in records}
    assert len(keys) == len(records), "Duplicate aggregation keys"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    records, meta = extract(args.source)
    validate(records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = (
        "window.VEHICLE_DATA = "
        + json.dumps(records, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.REFERENCE_DATA = "
        + json.dumps(
            [
                {"id": "reference-s36a", "model": "S36A", "length": 4500, "price": 30000, "reference": True},
                {"id": "reference-s36", "model": "S36", "length": 4650, "price": 35000, "reference": True},
            ],
            separators=(",", ":"),
        )
        + ";\nwindow.DATA_META = "
        + json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    args.output.write_text(payload, encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
