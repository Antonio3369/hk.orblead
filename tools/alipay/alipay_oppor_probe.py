#!/usr/bin/env python3
"""
第一次对接：拉取一页 alipay.open.sp.oppor.page.query，并对照 Excel 表头。

用法（与香港看板无关，仅本地实验）：
  1. cd tools/alipay && cp .env.example .env，填写 ALIPAY_* 变量
  2. pip install cryptography certifi
  3. python3 alipay_oppor_probe.py
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import uuid
import base64
import zipfile
import xml.etree.ElementTree as ET
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen

try:
    import certifi
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
except ImportError:
    print("请先安装依赖: pip install cryptography certifi")
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[2]
TOOL_DIR = Path(__file__).resolve().parent
DEFAULT_EXCEL = Path(
    "/Users/Eric/Desktop/agent/支付宝 api/小蓝环明细.xlsx"
)

EXCEL_HEADERS_BY_FILE = {
    "收钱码明细.xlsx": [
        "商家PID", "商家名称", "商家属性", "拓展日期", "员工名称", "员工id",
        "服务商名称", "服务商id", "省份", "城市", "地区", "详细地址",
        "照片审核结果", "商机内容", "风控审核结果", "不通过原因", "物料类型",
        "商家类型", "作业编号", "小二是否完成支付", "积分任务领取",
        "30天内有效交易笔数", "完美作业审核结果", "场景", "红包码物料类型",
    ],
    "经营码明细.xlsx": [
        "商家PID", "商家名称", "商家属性", "拓展日期", "员工名称", "员工id",
        "服务商名称", "服务商id", "省份", "城市", "地区", "详细地址",
        "照片审核结果", "商机内容", "风控审核结果", "不通过原因", "作业编号",
        "物料类型", "商户类型", "30天内经营码有效交易笔数", "完美作业审核结果",
        "30天内有效交易笔数", "30天内收钱码有效交易笔数",
    ],
    "人气街区明细.xlsx": [
        "作业编号", "商家PID", "商家名称", "商家属性", "商家标签", "拓展日期",
        "员工名称", "员工id", "服务商名称", "服务商id", "省份", "城市", "地区",
        "详细地址", "作业图片审核结果", "作业风控审核结果", "不通过原因", "AOI名称",
        "15天收钱码大码有效交易笔数", "30天收钱码大码有效交易笔数", "完美作业审核结果",
        "财神第一阶段留存", "财神第二阶段留存",
    ],
    "小蓝环明细.xlsx": [
        "商家PID", "商家名称", "商家属性", "拓展日期", "员工名称", "员工id",
        "服务商名称", "服务商id", "省份", "城市", "地区", "详细地址",
        "照片审核结果", "商机内容", "风控审核结果", "不通过原因", "商户类型",
        "作业编号", "小二是否完成支付", "场景", "15天内有效碰笔数", "15天内有效扫码笔数",
        "16-30天内有效碰笔数", "小蓝环物料类型", "完美作业审核结果", "次月有效动销笔数",
        "收钱码是否动销", "提报是否达标",
    ],
}

API_FIELD_HINTS = {
    "oppor_id": "作业编号",
    "name": "商家名称（可能脱敏）",
    "address": "详细地址",
    "status": "作业状态",
    "leads_id": "商机ID",
    "phone": "联系电话",
    "out_biz_no": "外部单号",
}


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def read_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8").strip()
    if "BEGIN" in text:
        return text
    # 密钥工具有时只给一行 base64，补成 PKCS8 PEM
    wrapped = "\n".join(text[i : i + 64] for i in range(0, len(text), 64))
    return f"-----BEGIN PRIVATE KEY-----\n{wrapped}\n-----END PRIVATE KEY-----\n"


def load_private_key(path: Path):
    data = read_text(path)
    return serialization.load_pem_private_key(data.encode("utf-8"), password=None)


def build_auth_string(app_id: str) -> str:
    timestamp = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex
    return f"app_id={app_id},timestamp={timestamp},nonce={nonce}", timestamp, nonce


def sign_v3_get(private_key, app_id: str, path: str, query: dict[str, str]) -> tuple[str, str]:
    auth_string, _, _ = build_auth_string(app_id)
    query_string = urlencode(sorted(query.items()))
    request_uri = f"{path}?{query_string}" if query_string else path
    content = f"{auth_string}\nGET\n{request_uri}\n\n"
    signature = private_key.sign(content.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    sign_b64 = base64.b64encode(signature).decode("ascii")
    authorization = f"ALIPAY-SHA256withRSA {auth_string},sign={sign_b64}"
    return authorization, f"https://openapi.alipay.com{request_uri}"


def call_oppor_page_query(app_id: str, private_key_path: Path, isv_pid: str) -> dict:
    query = {
        "isv_pid": isv_pid,
        "page_num": os.environ.get("ALIPAY_PAGE_NUM", "1"),
        "page_size": os.environ.get("ALIPAY_PAGE_SIZE", "10"),
        "status_list": os.environ.get(
            "ALIPAY_STATUS_LIST",
            "WAIT_MER_CONFIRM,MER_CONFIRMED,MER_REJECTED,EXPANDING,EXPANDED,EXPAND_FAILED",
        ),
    }
    authorization, url = sign_v3_get(
        load_private_key(private_key_path),
        app_id,
        "/v3/alipay/open/sp/oppor/page/query",
        query,
    )
    req = Request(
        url,
        headers={
            "Authorization": authorization,
            "alipay-request-id": uuid.uuid4().hex,
            "Accept": "application/json",
        },
        method="GET",
    )
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    with urlopen(req, timeout=30, context=ssl_ctx) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def read_excel_header(path: Path) -> list[str]:
    if not path.exists():
        return []
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as zf:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall(".//m:si", ns):
                shared.append("".join((t.text or "") for t in si.findall(".//m:t", ns)))
        sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        first_row = sheet.find(".//m:sheetData/m:row", ns)
        if first_row is None:
            return []
        cells: dict[int, str] = {}
        for cell in first_row.findall("m:c", ns):
            ref = cell.attrib.get("r", "A1")
            col = re.match(r"([A-Z]+)", ref).group(1)
            idx = sum((ord(ch) - 64) * (26 ** i) for i, ch in enumerate(reversed(col))) - 1
            value_el = cell.find("m:v", ns)
            if value_el is None or value_el.text is None:
                continue
            val = shared[int(value_el.text)] if cell.attrib.get("t") == "s" else value_el.text
            cells[idx] = val
        return [cells[i] for i in sorted(cells)]


def compare_with_excel(api_payload: dict, excel_headers: list[str]) -> None:
    print("\n=== 字段对照（API vs Excel）===")
    oppor_list = api_payload.get("oppor_list") or []
    api_keys: set[str] = set(API_FIELD_HINTS)
    if oppor_list and isinstance(oppor_list[0], dict):
        api_keys.update(oppor_list[0].keys())

    print("API 返回字段:", ", ".join(sorted(api_keys)) or "(空)")
    print("Excel 列数:", len(excel_headers))
    if excel_headers:
        print("Excel 表头:", ", ".join(excel_headers))

    mapped = set(API_FIELD_HINTS.values())
    missing_in_api = [h for h in excel_headers if h not in mapped]
    print("\nExcel 里有、但当前 page.query 文档字段里没有直接对应的列（共 %d 列）:" % len(missing_in_api))
    for col in missing_in_api[:15]:
        print("  -", col)
    if len(missing_in_api) > 15:
        print(f"  ... 还有 {len(missing_in_api) - 15} 列")

    print("\n建议：若缺很多列，再对单条记录调 detail.query（oppor_id=作业编号）。")


def main() -> None:
    load_dotenv(TOOL_DIR / ".env")

    app_id = os.environ.get("ALIPAY_APP_ID", "2021006160630893")
    isv_pid = os.environ.get("ALIPAY_ISV_PID", "2088441604046740")
    private_key_path = Path(
        os.environ.get("ALIPAY_PRIVATE_KEY_PATH", str(ROOT / "secrets" / "app_private_key.txt"))
    )

    if not private_key_path.exists():
        print("找不到应用私钥文件:", private_key_path)
        print("\n请在 tools/alipay/.env 里设置，例如：")
        print("ALIPAY_APP_ID=2021006160630893")
        print("ALIPAY_ISV_PID=2088441604046740")
        print("ALIPAY_PRIVATE_KEY_PATH=/你的路径/app_private_key.txt")
        print("ALIPAY_EXCEL_PATH=/Users/Eric/Desktop/agent/支付宝 api/小蓝环明细.xlsx")
        sys.exit(1)

    print("正在请求 alipay.open.sp.oppor.page.query ...")
    print("APP_ID:", app_id)
    print("ISV_PID:", isv_pid)

    try:
        payload = call_oppor_page_query(app_id, private_key_path, isv_pid)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print("\n调用失败:", exc)
        print("\n=== 支付宝返回内容 ===")
        try:
            print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))
        except json.JSONDecodeError:
            print(body or "(空)")
        print("\n常见原因：")
        print("  1. ISV_NOT_IN_WHITELIST → 找支付宝小二开 oppor 接口白名单")
        print("  2. 验签失败 → 检查私钥是否与应用公钥配对")
        print("  3. 参数错误 → 确认 isv_pid 是服务商企业 PID")
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 - 首次对接需要把原始错误完整展示
        print("\n调用失败:", exc)
        print("\n常见原因：")
        if "CERTIFICATE_VERIFY_FAILED" in str(exc):
            print("  · macOS SSL 证书问题 → pip install certifi 后重试（脚本已内置修复）")
        print("  1. ISV_NOT_IN_WHITELIST → 找支付宝小二开 oppor 接口白名单")
        print("  2. 验签失败 → 检查私钥是否与应用公钥配对")
        print("  3. 参数错误 → 确认 isv_pid 是服务商企业 PID")
        sys.exit(1)

    print("\n=== API 原始响应 ===")
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    excel_path = Path(os.environ.get("ALIPAY_EXCEL_PATH", str(DEFAULT_EXCEL)))
    headers = read_excel_header(excel_path)
    if not headers and excel_path.name in EXCEL_HEADERS_BY_FILE:
        headers = EXCEL_HEADERS_BY_FILE[excel_path.name]
    compare_with_excel(payload, headers)

    out = TOOL_DIR / "output" / "alipay_oppor_page_sample.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n已保存样本到: {out}")


if __name__ == "__main__":
    main()
