"""
현재 app.py의 데이터를 9개 CSV 파일로 export.
Google Sheets에 import 하기 위함.

실행:
  python export_to_csv.py

결과: ./csv_export/ 폴더에 9개 CSV 파일 생성
"""
import csv
import os
from app import BRANDS, PIPELINE_DETAIL, MARKETING_DATA, MONTH_LABELS

OUT_DIR = "csv_export"
os.makedirs(OUT_DIR, exist_ok=True)

def write_csv(name, headers, rows):
    path = os.path.join(OUT_DIR, name + ".csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)
    print(f"  [OK] {path}  ({len(rows)} rows)")


# 1) 브랜드
write_csv("01_브랜드",
    ["코드", "이름", "대표", "카테고리", "색상", "KPI"],
    [[b["code"], b["name"], b["ceo"], b["category"], b["accent"], b["kpi"]] for b in BRANDS])

# 2) KPI 추이
write_csv("02_KPI추이",
    ["코드"] + MONTH_LABELS,
    [[b["code"]] + list(b["kpi_trend"]) for b in BRANDS])

# 3) 매장 (전전월·전월 매출)
rows = []
for b in BRANDS:
    for s in b.get("stores_monthly", []):
        rows.append([b["code"], s["name"], s["prev_prev"], s["prev"]])
write_csv("03_매장", ["코드", "매장명", "전전월매출", "전월매출"], rows)

# 4) 가맹점 파이프라인 (요약 카운트)
write_csv("04_가맹파이프라인",
    ["코드", "상담중", "계약완료", "오픈예정", "오픈완료"],
    [[b["code"], b["pipeline"]["상담중"], b["pipeline"]["계약완료"],
      b["pipeline"]["오픈예정"], b["pipeline"]["오픈완료"]] for b in BRANDS])

# 5) 상담중 상세
rows = []
for code, detail in PIPELINE_DETAIL.items():
    for it in detail.get("상담중", []):
        rows.append([code, it["name"], it["region"], it["budget"], it["stage"], it["due"]])
write_csv("05_상담중상세", ["코드", "성함", "희망지역", "예산", "단계", "유입일"], rows)

# 6) 계약완료 + 오픈예정 상세
rows = []
for code, detail in PIPELINE_DETAIL.items():
    for it in detail.get("계약완료", []):
        rows.append([code, "계약완료", it["name"], it["region"], it["open_plan"], it["stage"]])
    for it in detail.get("오픈예정", []):
        rows.append([code, "오픈예정", it["name"], it["region"], it["open_plan"], it["stage"]])
write_csv("06_오픈예정상세", ["코드", "단계", "매장명", "지역", "오픈예정일", "현재단계"], rows)

# 7) 프로젝트
rows = []
for b in BRANDS:
    for p in b["projects"]:
        rows.append([b["code"], p["name"], p["owner"], p["progress"], p["due"], p["status"]])
write_csv("07_프로젝트", ["코드", "이름", "담당", "진행률", "마감일", "상태"], rows)

# 8) 이슈
rows = []
for b in BRANDS:
    for i in b["issues"]:
        rows.append([b["code"], i["title"], i["priority"], i["status"]])
write_csv("08_이슈", ["코드", "안건명", "우선순위", "상태"], rows)

# 9) 마케팅
rows = []
for code, mk in MARKETING_DATA.items():
    for it in mk["items"]:
        rows.append([code, mk["month"], it["channel"], it["budget"], it["spent"], it["metric"]])
write_csv("09_마케팅", ["코드", "기준월", "채널", "예산(만원)", "집행(만원)", "성과"], rows)

print("\n완료! csv_export/ 폴더의 9개 CSV를 Google Sheets에 import 하세요.")
