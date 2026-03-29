#!/usr/bin/env python3
"""
从市场监管法律法规规章数据库下载与行政处罚申辩业务相关的法律法规PDF
"""

import json
import os
import ssl
import time
import urllib.request

BASE_URL = "https://sjfg.samr.gov.cn/law"
API_URL = f"{BASE_URL}/law_search/infoviewOrder.do"
FILE_BASE = "https://sjfg.samr.gov.cn/law/file"
OUTPUT_DIR = "/Users/bang/claude_projects/guangjiantong/knowledge"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://sjfg.samr.gov.cn/law/pageInfo/law_search_new.index",
    "Content-Type": "application/json;",
}

# 该政府网站使用自签名证书链，需要跳过验证
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# === 筛选清单：与行政处罚申辩直接相关的法律法规 ===

# 一、法律（核心实体法 — 你已有广告法，其余都需要补充）
LAWS_TO_DOWNLOAD = {
    "法律": [
        # 已有，跳过: 中华人民共和国广告法
        "中华人民共和国反垄断法",
        "中华人民共和国食品安全法",
        "中华人民共和国反不正当竞争法",
        "中华人民共和国商标法",
        "中华人民共和国产品质量法",
        "中华人民共和国电子商务法",
        "中华人民共和国消费者权益保护法",
        "中华人民共和国价格法",
        "中华人民共和国药品管理法",
        "中华人民共和国专利法",
        "中华人民共和国计量法",
        "中华人民共和国标准化法",
        "中华人民共和国特种设备安全法",
    ],

    # 二、行政法规（实施条例 + 处罚相关）
    "行政法规": [
        "中华人民共和国食品安全法实施条例",
        "中华人民共和国药品管理法实施条例",
        "中华人民共和国商标法实施条例",
        "中华人民共和国专利法实施细则",
        "价格违法行为行政处罚规定",
        "中华人民共和国工业产品生产许可证管理条例",
        "医疗器械监督管理条例",
        "化妆品监督管理条例",
        "无证无照经营查处办法",
        "禁止传销条例",
        "直销管理条例",
        "广告管理条例",
        "公平竞争审查条例",
        "中华人民共和国市场主体登记管理条例",
        "缺陷汽车产品召回管理条例",
        "促进个体工商户发展条例",
        "中华人民共和国计量法实施细则",
    ],

    # 三、规章（行政处罚程序 + 各领域执法规定）
    "规章": [
        # 处罚程序类（核心）
        "市场监督管理行政处罚程序规定",
        "市场监督管理行政处罚听证办法",
        "市场监督管理行政处罚信息公示规定",
        "市场监督管理行政处罚案件违法所得认定办法",
        "市场监督管理执法监督规定",
        "市场监督管理投诉举报处理办法",

        # 广告执法类
        "互联网广告管理办法",
        "房地产广告发布规定",
        "医疗广告管理办法",
        "药品、医疗器械、保健食品、特殊医学用途配方食品广告审查管理暂行办法",

        # 反不正当竞争类
        "网络反不正当竞争暂行规定",
        "规范促销行为暂行规定",
        "制止滥用行政权力排除、限制竞争行为规定",
        "禁止垄断协议规定",
        "禁止滥用市场支配地位行为规定",
        "禁止滥用知识产权排除、限制竞争行为规定",

        # 食品安全类
        "食品安全抽样检验管理办法",
        "网络食品安全违法行为查处办法",
        "食品标识监督管理办法",
        "食品生产经营监督检查管理办法",
        "食品经营许可和备案管理办法",
        "食用农产品市场销售质量安全监督管理办法",

        # 产品质量/消费者权益类
        "侵害消费者权益行为处罚办法",
        "产品质量监督抽查管理暂行办法",
        "网络交易监督管理办法",
        "网络购买商品七日无理由退货暂行办法",
        "明码标价和禁止价格欺诈规定",
        "价格违法行为行政处罚实施办法",

        # 商标/知识产权类
        "商标代理监督管理规定",
        "规范商标申请注册行为若干规定",

        # 电商/网络类
        "合同行政监督管理办法",

        # 市场主体登记类
        "防范和查处假冒企业登记违法行为规定",
        "市场监督管理严重违法失信名单管理办法",

        # 计量违法
        "计量违法行为处罚细则",
    ],
}


def fetch_law_list(category, dept_duty):
    """从API获取法律列表"""
    payload = json.dumps({
        "key": category,
        "pn": 1,
        "departDuty": dept_duty,
        "limit": 500
    }).encode("utf-8")

    req = urllib.request.Request(API_URL, data=payload, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return {item[0]: item[3] for item in data.get("page", []) if len(item) > 3}


def download_pdf(name, pdf_path, save_dir):
    """下载单个PDF"""
    url = f"{FILE_BASE}{pdf_path}"
    safe_name = name.replace("/", "_").replace("\\", "_")
    filepath = os.path.join(save_dir, f"{safe_name}.pdf")

    if os.path.exists(filepath):
        print(f"  [跳过] 已存在: {safe_name}.pdf")
        return True

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": HEADERS["User-Agent"],
            "Referer": HEADERS["Referer"],
        })
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as resp:
            content = resp.read()
            if len(content) < 1000:
                print(f"  [警告] 文件太小，可能下载失败: {safe_name}.pdf ({len(content)} bytes)")
                return False
            with open(filepath, "wb") as f:
                f.write(content)
            print(f"  [完成] {safe_name}.pdf ({len(content)//1024} KB)")
            return True
    except Exception as e:
        print(f"  [失败] {safe_name}.pdf: {e}")
        return False


def main():
    total = 0
    success = 0
    failed = []

    for category, names in LAWS_TO_DOWNLOAD.items():
        print(f"\n{'='*60}")
        print(f"分类: {category} (共 {len(names)} 部)")
        print(f"{'='*60}")

        dept_duty = 5001 if category == "规章" else 4001
        print(f"正在获取 {category} 列表...")
        law_map = fetch_law_list(category, dept_duty)
        print(f"获取到 {len(law_map)} 条记录")

        save_dir = os.path.join(OUTPUT_DIR, category)
        os.makedirs(save_dir, exist_ok=True)

        for name in names:
            total += 1
            pdf_path = law_map.get(name)
            if not pdf_path:
                # Try fuzzy match
                matched = [k for k in law_map if name in k or k in name]
                if matched:
                    pdf_path = law_map[matched[0]]
                    print(f"  [模糊匹配] {name} -> {matched[0]}")
                else:
                    print(f"  [未找到] {name}")
                    failed.append(name)
                    continue

            if download_pdf(name, pdf_path, save_dir):
                success += 1
            else:
                failed.append(name)

            time.sleep(0.3)  # 礼貌性延迟

    print(f"\n{'='*60}")
    print(f"下载完成: {success}/{total} 成功")
    if failed:
        print(f"失败 ({len(failed)}):")
        for name in failed:
            print(f"  - {name}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
