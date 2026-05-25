import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta

import pandas as pd

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


CAMPAIGN_FILL_FIELDS = [
    "priority",
    "program_type",
    "scope",
    "channel",
    "campaign_name",
    "start_date",
    "end_date",
    "promo_content",
    "setup_type",
]


ALIASES = {
    "priority": ["do uu tien", "priority", "uu tien"],
    "program_type": ["loai ct", "loai chuong trinh", "type", "program type"],
    "scope": ["pham vi", "scope"],
    "channel": ["kenh", "channel"],
    "campaign_name": [
        "ten chuong trinh",
        "ten ct",
        "chuong trinh",
        "campaign name",
        "campaign",
    ],
    "start_date": [
        "thoi gian bat dau",
        "ngay bat dau",
        "start date",
        "from",
        "tu ngay",
    ],
    "end_date": [
        "thoi gian ket thuc",
        "ngay ket thuc",
        "end date",
        "to",
        "den ngay",
    ],
    "sku": ["ma hang", "ma san pham", "sku", "product code"],
    "product_name": ["ten san pham", "product name", "san pham"],
    "category": ["nganh hang", "danh muc", "category"],
    "brand": ["thuong hieu", "brand", "nhan hang"],
    "selling_price": ["gia ban", "gia niem yet", "price", "selling price"],
    "promotion_price": ["gia khuyen mai", "gia km", "promo price", "promotion price"],
    "discount_percent": ["ty le giam", "phan tram giam", "discount", "discount percent"],
    "promo_content": [
        "noi dung ctkm",
        "noi dung",
        "noi dung khuyen mai",
        "promotion content",
        "offer",
    ],
    "gift_code": ["ma qua tang", "ma qt", "gift code"],
    "gift_name": ["ten qua tang", "qua tang", "gift name", "gift"],
    "gift_value": ["gia qua tang", "gia tri qua tang", "gift value"],
    "note": ["ghi chu", "note", "remark"],
    "setup_type": ["hinh thuc setup", "setup", "setup type"],
}


SKIP_SHEET_KEYWORDS = [
    "huong dan",
    "readme",
    "note",
    "notes",
    "ghi chu",
    "template",
]


CAMPAIGN_NAME_NOISE_KEYWORDS = [
    "unit cost",
    "don gia",
    "total budget",
    "tong ngan sach",
    "total vat",
    "total",
    "facebook ads reach",
    "facebook post",
    "item hang muc",
    "quantity so luong",
    "note ghi chu",
    "timing thoi gian trien khai",
]


PRODUCT_NOISE_KEYWORDS = [
    "note ghi chu",
    "unit cost",
    "don gia",
    "total budget",
    "tong ngan sach",
    "item hang muc",
    "quantity so luong",
    "kt check",
]


def normalize_text(value):
    if value is None:
        return ""

    if pd.isna(value):
        return ""

    text = str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")

    return text.strip()


def normalize_for_rule(value):
    text = normalize_text(value)
    text = re.sub(r"[_\-/]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def should_skip_sheet(sheet_name):
    normalized = normalize_for_rule(sheet_name)

    return any(keyword in normalized for keyword in SKIP_SHEET_KEYWORDS)


def clean_text(value):
    if value is None:
        return ""

    if pd.isna(value):
        return ""

    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)

    if text.lower() in ["nan", "none", "null"]:
        return ""

    return text


def is_money_like_text(value):
    text = clean_text(value)
    if not text:
        return False

    text = text.replace(",", "").replace(".", "").strip()

    return bool(re.fullmatch(r"\d+", text))


def is_noise_campaign_name(value):
    text = normalize_for_rule(value)

    if not text:
        return True

    if is_money_like_text(value):
        return True

    return any(keyword in text for keyword in CAMPAIGN_NAME_NOISE_KEYWORDS)


def is_valid_product_item(item):
    sku = clean_text(item.get("sku"))
    product_name = clean_text(item.get("productName"))

    if not sku and not product_name:
        return False

    combined = normalize_for_rule(f"{sku} {product_name}")

    if any(keyword in combined for keyword in PRODUCT_NOISE_KEYWORDS):
        return False

    if is_money_like_text(sku) and not product_name:
        return False

    return True


def is_valid_gift_item(item):
    gift_code = clean_text(item.get("giftCode"))
    gift_name = clean_text(item.get("giftName"))

    if not gift_code and not gift_name:
        return False

    combined = normalize_for_rule(f"{gift_code} {gift_name}")

    if any(keyword in combined for keyword in PRODUCT_NOISE_KEYWORDS):
        return False

    return True


def standardize_column(value):
    normalized = normalize_text(value)

    if not normalized:
        return ""

    for canonical, keys in ALIASES.items():
        for key in keys:
            if key in normalized:
                return canonical

    safe = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return safe or ""


def make_unique_columns(columns):
    seen = {}
    result = []

    for index, col in enumerate(columns):
        name = col or f"col_{index + 1}"

        if name not in seen:
            seen[name] = 0
            result.append(name)
            continue

        seen[name] += 1
        result.append(f"{name}_{seen[name]}")

    return result


def find_header_row(raw_df):
    best_index = 0
    best_score = -1

    max_rows = min(len(raw_df), 15)
    expected = {
        "campaign_name",
        "sku",
        "product_name",
        "selling_price",
        "promotion_price",
        "gift_name",
        "promo_content",
        "start_date",
        "end_date",
    }

    for row_index in range(max_rows):
        row = raw_df.iloc[row_index].tolist()
        columns = [standardize_column(value) for value in row]
        score = sum(1 for col in columns if col in expected)

        if score > best_score:
            best_score = score
            best_index = row_index

    return best_index, best_score


def parse_number(value):
    if value is None:
        return None

    if pd.isna(value):
        return None

    if isinstance(value, (int, float)):
        if pd.isna(value):
            return None
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    text = text.replace("%", "")
    text = re.sub(r"[^\d,.\-]", "", text)

    if not text:
        return None

    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    elif text.count(".") > 1:
        text = text.replace(".", "")

    try:
        return float(text)
    except ValueError:
        return None


def parse_date(value):
    if value is None:
        return None

    if pd.isna(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()

    if isinstance(value, datetime):
        return value.date().isoformat()

    if isinstance(value, (int, float)):
        if 20000 <= value <= 80000:
            date = datetime(1899, 12, 30) + timedelta(days=int(value))
            return date.date().isoformat()

    text = str(value).strip()
    if not text:
        return None

    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return text

    return parsed.date().isoformat()


def row_is_empty(row):
    important_fields = [
        "campaign_name",
        "sku",
        "product_name",
        "promo_content",
        "gift_code",
        "gift_name",
    ]

    for field in important_fields:
        if clean_text(row.get(field, "")):
            return False

    return True


def parse_sheet(excel_file, sheet_name):
    raw = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, dtype=object)

    if raw.empty:
        return {
            "sheetName": sheet_name,
            "rows": [],
            "campaigns": [],
            "rowCount": 0,
            "warning": "Sheet trống",
        }

    header_row, score = find_header_row(raw)

    if score <= 0:
        return {
            "sheetName": sheet_name,
            "rows": [],
            "campaigns": [],
            "rowCount": 0,
            "warning": "Không nhận diện được dòng tiêu đề",
        }

    headers = [standardize_column(value) for value in raw.iloc[header_row].tolist()]
    headers = make_unique_columns(headers)

    data = raw.iloc[header_row + 1 :].copy()
    data.columns = headers

    for field in CAMPAIGN_FILL_FIELDS:
        if field in data.columns:
            data[field] = data[field].ffill()

    rows = []

    for _, row in data.iterrows():
        row_dict = row.to_dict()

        if row_is_empty(row_dict):
            continue

        selling_price = parse_number(row_dict.get("selling_price"))
        promotion_price = parse_number(row_dict.get("promotion_price"))
        discount_percent = parse_number(row_dict.get("discount_percent"))
        gift_value = parse_number(row_dict.get("gift_value"))

        record = {
            "sheetName": sheet_name,
            "priority": clean_text(row_dict.get("priority")),
            "programType": clean_text(row_dict.get("program_type")),
            "scope": clean_text(row_dict.get("scope")),
            "channel": clean_text(row_dict.get("channel")),
            "campaignName": clean_text(row_dict.get("campaign_name")) or sheet_name,
            "startDate": parse_date(row_dict.get("start_date")),
            "endDate": parse_date(row_dict.get("end_date")),
            "sku": clean_text(row_dict.get("sku")),
            "productName": clean_text(row_dict.get("product_name")),
            "category": clean_text(row_dict.get("category")),
            "brand": clean_text(row_dict.get("brand")) or sheet_name,
            "sellingPrice": selling_price,
            "promotionPrice": promotion_price,
            "discountPercent": discount_percent,
            "promoContent": clean_text(row_dict.get("promo_content")),
            "giftCode": clean_text(row_dict.get("gift_code")),
            "giftName": clean_text(row_dict.get("gift_name")),
            "giftValue": gift_value,
            "note": clean_text(row_dict.get("note")),
            "setupType": clean_text(row_dict.get("setup_type")),
        }

        rows.append(record)

    campaign_map = {}

    for record in rows:
        key = "|".join(
            [
                record.get("sheetName") or "",
                record.get("campaignName") or "",
                record.get("startDate") or "",
                record.get("endDate") or "",
            ]
        )

        if key not in campaign_map:
            campaign_map[key] = {
                "sheetName": record.get("sheetName"),
                "campaignName": record.get("campaignName"),
                "programType": record.get("programType"),
                "scope": record.get("scope"),
                "channel": record.get("channel"),
                "startDate": record.get("startDate"),
                "endDate": record.get("endDate"),
                "promoContent": record.get("promoContent"),
                "setupType": record.get("setupType"),
                "products": [],
                "gifts": [],
                "_giftKeys": set(),
            }

        if record.get("productName") or record.get("sku"):
            campaign_map[key]["products"].append(
                {
                    "sku": record.get("sku"),
                    "productName": record.get("productName"),
                    "category": record.get("category"),
                    "brand": record.get("brand"),
                    "sellingPrice": record.get("sellingPrice"),
                    "promotionPrice": record.get("promotionPrice"),
                    "discountPercent": record.get("discountPercent"),
                    "note": record.get("note"),
                }
            )

        if record.get("giftName") or record.get("giftCode"):
            gift_item = {
                "giftCode": record.get("giftCode"),
                "giftName": record.get("giftName"),
                "giftValue": record.get("giftValue"),
                "condition": record.get("promoContent"),
                "note": record.get("note"),
            }

            gift_key = "|".join(
                [
                    gift_item.get("giftCode") or "",
                    gift_item.get("giftName") or "",
                    str(gift_item.get("giftValue") or ""),
                ]
            )

            if gift_key not in campaign_map[key]["_giftKeys"]:
                campaign_map[key]["gifts"].append(gift_item)
                campaign_map[key]["_giftKeys"].add(gift_key)

    campaigns = []

    for campaign in campaign_map.values():
        campaign.pop("_giftKeys", None)

        campaign["products"] = [
            item for item in campaign.get("products", []) if is_valid_product_item(item)
        ]

        campaign["gifts"] = [
            item for item in campaign.get("gifts", []) if is_valid_gift_item(item)
        ]

        if is_noise_campaign_name(campaign.get("campaignName")):
            continue

        if len(campaign["products"]) == 0 and len(campaign["gifts"]) == 0:
            continue

        campaign["productCount"] = len(campaign["products"])
        campaign["giftCount"] = len(campaign["gifts"])
        campaign["products"] = campaign["products"][:50]
        campaign["gifts"] = campaign["gifts"][:50]

        campaigns.append(campaign)

    return {
        "sheetName": sheet_name,
        "rowCount": len(rows),
        "campaignCount": len(campaigns),
        "campaigns": campaigns,
        "warning": None,
    }


def main():
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {"ok": False, "message": "Thiếu đường dẫn file Excel"},
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    file_path = sys.argv[1]

    if not os.path.exists(file_path):
        print(
            json.dumps(
                {"ok": False, "message": "File không tồn tại"},
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    try:
        excel = pd.ExcelFile(file_path)
        sheet_names = excel.sheet_names

        sheet_results = []
        all_campaigns = []
        total_rows = 0
        warnings = []

        for sheet_name in sheet_names:
            if should_skip_sheet(sheet_name):
                sheet_results.append(
                    {
                        "sheetName": sheet_name,
                        "rowCount": 0,
                        "campaignCount": 0,
                        "warning": "Bỏ qua sheet hướng dẫn/ghi chú",
                    }
                )
                warnings.append(f"{sheet_name}: Bỏ qua sheet hướng dẫn/ghi chú")
                continue

            parsed = parse_sheet(excel, sheet_name)

            sheet_results.append(
                {
                    "sheetName": parsed["sheetName"],
                    "rowCount": parsed.get("rowCount", 0),
                    "campaignCount": parsed.get("campaignCount", 0),
                    "warning": parsed.get("warning"),
                }
            )

            if parsed.get("warning"):
                warnings.append(f"{sheet_name}: {parsed.get('warning')}")

            total_rows += parsed.get("rowCount", 0)
            all_campaigns.extend(parsed.get("campaigns", []))

        result = {
            "ok": True,
            "fileName": os.path.basename(file_path),
            "sheetCount": len(sheet_names),
            "totalRows": total_rows,
            "campaignCount": len(all_campaigns),
            "sheets": sheet_results,
            "campaigns": all_campaigns[:100],
            "warnings": warnings,
        }

        print(json.dumps(result, ensure_ascii=False, default=str))
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "message": "Không thể đọc file Excel",
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()