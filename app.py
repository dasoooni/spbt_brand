import random
from flask import Flask, render_template, jsonify

app = Flask(__name__)
# 개발 중 정적 파일(CSS/JS) 캐시 비활성화 — 브라우저가 항상 최신 파일을 받도록
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

MONTH_LABELS = ["25.11", "25.12", "26.01", "26.02", "26.03", "26.04"]


# 동래정 실제 영업중 매장 (2026-04-28 기준 58개) — 폐점 11개 제외
DRJ_STORE_NAMES = [
    # 직영 (3)
    "선릉점", "본점", "신논현직영",
    # 서울 가맹 대형/요지 (9)
    "잠실새내점", "신풍역점", "화곡점", "목동점", "송파가락점", "충무로점",
    "신도림점", "망원점", "아현점",
    # 서울 가맹 일반 (11)
    "노원역점", "길음점", "가재울뉴타운점", "가양역점", "까치산점", "대흥점",
    "역촌점", "상봉점", "창동점", "장안점", "방이점",
    # 경기/인천 (24)
    "하남미사점", "파주운정점", "삼송점", "다산점", "일산식사점", "일산주엽점",
    "일산화정점", "고양덕은점", "동탄역점", "양주옥정점", "의정부고산점", "안양비산점",
    "풍무점", "김포걸포점", "김포구래점", "운양점", "신영통점", "부천옥길점",
    "화성향남점", "수지점", "용인동백점", "산성역점", "다율점", "검단신도시점",
    # 지방 (11)
    "부산시청점", "정관점", "부산명지점", "용호빌리브점", "울산매곡점",
    "대전시청점", "광주첨단신용점", "여수여서점", "순천신대점",
    "김천점", "구미점",
]

DRJ_OPENING_STORES = [
    {"name": "동래정 안성중앙대점",  "region": "경기 안성시 대덕면",         "open_plan": "26-05-08", "stage": "오픈 진행 중"},
    {"name": "동래정 고덕점",        "region": "서울 강동구 고덕동",        "open_plan": "26-05-13", "stage": "오픈 D-7 (옥정점주 2호점)"},
    {"name": "동래정 신정뉴타운점",   "region": "서울 양천구 신월동",        "open_plan": "26-05-13", "stage": "오픈 D-7"},
    {"name": "동래정 청주가경점",    "region": "충북 청주시 흥덕구 가경동",  "open_plan": "26-05-13", "stage": "오픈 D-7"},
    {"name": "동래정 광양중마점",    "region": "전남 광양시 중동",           "open_plan": "26-05-27", "stage": "디자인물 진행 (순천 2호점)"},
    {"name": "동래정 철산점",       "region": "경기 광명시 철산동",        "open_plan": "26-07월",   "stage": "6/1 착공 예정"},
    {"name": "동래정 수원화서점",   "region": "경기 수원시 팔달구",         "open_plan": "미정",     "stage": "실측 진행 (신도림 점주 지인)"},
]

# 동래정 오픈 유력 매장 (가계약/협의 중) - 계약완료 단계에 표시
DRJ_PROBABLE_STORES = [
    {"name": "동래정 영종도점",    "region": "인천 중구 해맞이길",        "open_plan": "협의 중", "stage": "정보공개서 점주 확인 완료 (4/14)"},
    {"name": "동래정 창원용호점",  "region": "경남 창원시 성산구 용호동", "open_plan": "협의 중", "stage": "건물주 협의 중 (실측 완료)"},
    {"name": "동래정 고척동점",   "region": "서울 구로구 중앙로14길",    "open_plan": "협의 중", "stage": "후보 자리 탐색 (윤재승 이사)"},
    {"name": "동래정 부천점",     "region": "인천 부평구 마장로",        "open_plan": "협의 중", "stage": "한화프라자 117호 검토"},
]


def _gen_drj_stores():
    """동래정 58개 매장의 전전월/전월 매출 mock 생성 (seed 고정으로 재실행해도 동일)"""
    rng = random.Random(2604)
    # 직영 3개는 개별 매출 범위 (선릉 > 본점 > 신논현)
    directs = {
        "선릉점":      (98_000_000, 105_000_000),
        "본점":        (88_000_000, 95_000_000),
        "신논현직영":  (80_000_000, 88_000_000),
    }
    # 인덱스 범위:
    #   0~2   직영 3
    #   3~11  서울 대형 가맹 9
    #   12~22 서울 일반 가맹 11
    #   23~46 경기/인천 24
    #   47~57 지방 11
    stores = []
    for i, name in enumerate(DRJ_STORE_NAMES):
        if name in directs:
            lo, hi = directs[name]
            prev = rng.randint(lo, hi)
        elif i < 12:                       # 서울 대형 가맹 (잠실·신풍·화곡 등)
            prev = rng.randint(55_000_000, 78_000_000)
        elif i < 23:                       # 서울 일반 가맹
            prev = rng.randint(34_000_000, 55_000_000)
        elif i < 47:                       # 경기/인천
            prev = rng.randint(28_000_000, 52_000_000)
        else:                              # 지방
            prev = rng.randint(22_000_000, 45_000_000)
        # 전월 대비 변화율: 대부분 ±5% 안정, 가끔 더 큰 변동
        pct = rng.choices([
            rng.uniform(-2, 4),    # 안정
            rng.uniform(3, 8),     # 성장
            rng.uniform(-8, -3),   # 부진
        ], weights=[60, 25, 15])[0]
        prev_prev = int(prev / (1 + pct / 100))
        stores.append({"name": name, "prev_prev": prev_prev, "prev": prev})
    # 매출 큰 순으로 정렬
    stores.sort(key=lambda s: s["prev"], reverse=True)
    return stores


DRJ_STORES_MONTHLY = _gen_drj_stores()
DRJ_STORE_TOTAL = len(DRJ_STORES_MONTHLY)
DRJ_FRANCHISE_AVG = sum(s["prev"] for s in DRJ_STORES_MONTHLY) // DRJ_STORE_TOTAL

# 사이드바 표시 순서
SIDEBAR_ORDER = ["DRJ", "YSK", "CYHU", "MJD", "PAD", "HMNBM"]

# ============ 단계별 상세 (가맹점 현황) ============
PIPELINE_DETAIL = {
    "HMNBM": {
        "상담중": [
            {"name": "유덕진", "region": "서울/경기",   "budget": "3억",     "stage": "정보공개서 발송", "due": "26-04-30"},
            {"name": "임순자", "region": "강동구",       "budget": "1억 이하","stage": "임대차 완료·철거", "due": "26-04-30"},
            {"name": "손형남", "region": "천안 아산",   "budget": "1.5억",   "stage": "5/26 화상 미팅", "due": "26-05-01"},
            {"name": "백동준", "region": "수원 영통구", "budget": "1억",     "stage": "2단계 대면 상담", "due": "26-05-03"},
            {"name": "김선영", "region": "서울 성동구", "budget": "미정",     "stage": "정보공개서 발송", "due": "26-05-03"},
            {"name": "강용구", "region": "지역 무관",   "budget": "협의",     "stage": "상권분석 의뢰",  "due": "26-05-08"},
            {"name": "조인후", "region": "경남 양산",   "budget": "최소",     "stage": "1단계 통화 완료","due": "26-05-10"},
        ],
        "계약완료": [
            {"name": "박서윤점주",  "region": "분당 야탑",   "open_plan": "26-06-10", "stage": "인테리어 발주"},
            {"name": "최정훈점주",  "region": "안양 평촌",   "open_plan": "26-06-25", "stage": "디자인물 진행"},
            {"name": "김도현점주",  "region": "서울 강서",   "open_plan": "26-07-05", "stage": "상권 분석 완료"},
            {"name": "이지은점주",  "region": "고양 일산",   "open_plan": "26-07-20", "stage": "계약 완료"},
        ],
        "오픈예정": [
            {"name": "분당 야탑점",  "region": "성남 분당구", "open_plan": "26-06-10", "stage": "오픈 D-7 준비"},
            {"name": "안양 평촌점",  "region": "안양 동안구", "open_plan": "26-06-25", "stage": "교육 진행 중"},
            {"name": "서울 강서점",  "region": "서울 강서구", "open_plan": "26-07-05", "stage": "인테리어 진행"},
        ],
    },
    "DRJ": {
        "상담중": [
            {"name": "최정훈", "region": "판교/분당",   "budget": "2.5억", "stage": "2단계 대면",       "due": "26-04-25"},
            {"name": "박서윤", "region": "서울 마포",   "budget": "2억",   "stage": "임대차 진행중",     "due": "26-04-28"},
            {"name": "김도현", "region": "대구 수성구", "budget": "3억",   "stage": "상권분석 의뢰",     "due": "26-05-03"},
            {"name": "이지은", "region": "고양 일산",   "budget": "1.8억", "stage": "2단계 대면 예정",   "due": "26-05-07"},
        ],
        "계약완료": DRJ_PROBABLE_STORES + [
            {"name": "김명진점주",   "region": "서울 강북구",   "open_plan": "26-08-15", "stage": "상권분석 완료"},
            {"name": "정수영점주",   "region": "용인 동탄2",    "open_plan": "26-08-30", "stage": "디자인물 진행"},
            {"name": "박지영점주",   "region": "고양시 화정",   "open_plan": "26-09-10", "stage": "임대차 완료"},
            {"name": "오상민점주",   "region": "서울 노원",     "open_plan": "26-09-25", "stage": "인테리어 발주"},
        ],
        "오픈예정": DRJ_OPENING_STORES,
    },
    "MJD": {
        "상담중": [
            {"name": "정한솔", "region": "서울 강남",   "budget": "4억",   "stage": "고급상권 매물 탐색", "due": "26-04-20"},
            {"name": "오재현", "region": "성남 분당",   "budget": "3억",   "stage": "2단계 대면 상담",   "due": "26-05-02"},
            {"name": "한지유", "region": "서울 용산",   "budget": "2.5억", "stage": "임대차 검토",       "due": "26-05-05"},
        ],
        "계약완료": [
            {"name": "박상민점주", "region": "용인 기흥",   "open_plan": "26-06-10", "stage": "디자인물 진행"},
            {"name": "김혜진점주", "region": "인천 송도",   "open_plan": "26-07-20", "stage": "상권 분석 완료"},
        ],
        "오픈예정": [
            {"name": "배곧점",       "region": "시흥시 정왕동", "open_plan": "26-06-10", "stage": "오픈 D-7 준비"},
            {"name": "인천 송도점",  "region": "인천 연수구",   "open_plan": "26-07-20", "stage": "인테리어 진행"},
        ],
    },
    "PAD": {
        "상담중": [
            {"name": "임철수", "region": "서울 종로", "budget": "2.2억", "stage": "상권분석 의뢰",   "due": "26-05-01"},
            {"name": "조영자", "region": "경기 성남", "budget": "2억",   "stage": "2단계 대면 예정", "due": "26-05-06"},
        ],
        "계약완료": [
            {"name": "정수호점주", "region": "마포 합정", "open_plan": "26-07-15", "stage": "임대차 완료"},
        ],
        "오픈예정": [
            {"name": "마포 합정점", "region": "서울 마포구", "open_plan": "26-07-15", "stage": "교육 진행 중"},
        ],
    },
    "YSK": {
        "상담중": [
            {"name": "박준영", "region": "서울 마포",   "budget": "1억",   "stage": "분쟁 관련 답변 대기", "due": "26-05-01"},
            {"name": "최예린", "region": "인천 송도",   "budget": "1.2억", "stage": "1단계 통화 완료",   "due": "26-05-03"},
            {"name": "김민서", "region": "경기 안양",   "budget": "8천",   "stage": "예산 부족 안내",     "due": "26-05-07"},
        ],
        "계약완료": [
            {"name": "이태호점주", "region": "고양 일산", "open_plan": "26-06-30", "stage": "인테리어 진행"},
        ],
        "오픈예정": [
            {"name": "일산 정발산점", "region": "고양 일산동구", "open_plan": "26-06-30", "stage": "디자인물 진행"},
        ],
    },
    "CYHU": {
        "상담중": [
            {"name": "서동현", "region": "서울 강서",   "budget": "2.5억", "stage": "2단계 대면 완료",   "due": "26-04-27"},
            {"name": "윤채린", "region": "수원 영통",   "budget": "1.8억", "stage": "임대차 진행",       "due": "26-05-02"},
            {"name": "김태우", "region": "부산 해운대", "budget": "2억",   "stage": "상권분석 의뢰",     "due": "26-05-06"},
            {"name": "장우진", "region": "천안 동남구", "budget": "1.5억", "stage": "1단계 통화 완료",   "due": "26-05-09"},
        ],
        "계약완료": [
            {"name": "남현수점주", "region": "강서 마곡", "open_plan": "26-06-20", "stage": "인테리어 발주"},
            {"name": "조희영점주", "region": "분당 수내", "open_plan": "26-07-15", "stage": "디자인물 진행"},
        ],
        "오픈예정": [
            {"name": "강서 마곡점", "region": "서울 강서구", "open_plan": "26-06-20", "stage": "교육 진행 중"},
            {"name": "분당 수내점", "region": "성남 분당구", "open_plan": "26-07-15", "stage": "인테리어 진행"},
        ],
    },
}

# ============ 월 마케팅 진행 현황 ============
# 각 채널: [예산(만원), 집행(만원), 성과텍스트]
MARKETING_DATA = {
    "HMNBM": {
        "month": "26.04",
        "items": [
            {"channel": "인플루언서",     "budget": 680, "spent": 620, "metric": "게재 12명 · 참여 5.2만"},
            {"channel": "인스타(광고)",   "budget": 450, "spent": 430, "metric": "도달 23.5만 · CTR 2.4%"},
            {"channel": "유튜브(자체)",   "budget": 200, "spent": 180, "metric": "조회 8.4만 · 구독 +850"},
            {"channel": "인스타(자체)",   "budget": 120, "spent": 115, "metric": "팔로워 +1,240"},
            {"channel": "스마트플레이스", "budget":  80, "spent":  75, "metric": "조회 12만"},
            {"channel": "블로그",         "budget":  60, "spent":  55, "metric": "포스팅 8건"},
            {"channel": "기사송출",       "budget":  50, "spent":  50, "metric": "노출 10건"},
            {"channel": "홈페이지",       "budget":  30, "spent":  25, "metric": "방문 4.2만"},
        ],
    },
    "DRJ": {
        "month": "26.04",
        "items": [
            {"channel": "인플루언서",     "budget": 850, "spent": 780, "metric": "게재 8명 · 참여 3.8만"},
            {"channel": "인스타(광고)",   "budget": 380, "spent": 360, "metric": "도달 18.2만 · CTR 1.9%"},
            {"channel": "유튜브(자체)",   "budget": 320, "spent": 305, "metric": "조회 6.1만 · 구독 +620"},
            {"channel": "인스타(자체)",   "budget": 150, "spent": 140, "metric": "팔로워 +780"},
            {"channel": "기사송출",       "budget": 120, "spent": 115, "metric": "경제지 12건"},
            {"channel": "블로그",         "budget":  80, "spent":  70, "metric": "포스팅 6건"},
            {"channel": "스마트플레이스", "budget":  60, "spent":  55, "metric": "조회 8.7만"},
            {"channel": "홈페이지",       "budget":  40, "spent":  40, "metric": "방문 3.1만"},
        ],
    },
    "MJD": {
        "month": "26.04",
        "items": [
            {"channel": "인플루언서",     "budget": 1250, "spent": 1180, "metric": "셀럽 4명 · 참여 8.4만"},
            {"channel": "인스타(광고)",   "budget":  520, "spent":  495, "metric": "도달 31.2만 · CTR 2.8%"},
            {"channel": "유튜브(자체)",   "budget":  280, "spent":  260, "metric": "조회 11.5만"},
            {"channel": "인스타(자체)",   "budget":  180, "spent":  170, "metric": "팔로워 +1,820"},
            {"channel": "기사송출",       "budget":   80, "spent":   75, "metric": "노출 8건"},
            {"channel": "블로그",         "budget":   70, "spent":   65, "metric": "포스팅 5건"},
            {"channel": "홈페이지",       "budget":   50, "spent":   48, "metric": "방문 5.3만"},
            {"channel": "스마트플레이스", "budget":   40, "spent":   38, "metric": "조회 6.4만"},
        ],
    },
    "PAD": {
        "month": "26.04",
        "items": [
            {"channel": "인플루언서",     "budget": 240, "spent": 220, "metric": "게재 3명 · 참여 1.2만"},
            {"channel": "인스타(광고)",   "budget": 180, "spent": 170, "metric": "도달 6.8만"},
            {"channel": "유튜브(자체)",   "budget":  80, "spent":  70, "metric": "조회 2.1만"},
            {"channel": "인스타(자체)",   "budget":  60, "spent":  55, "metric": "팔로워 +320"},
            {"channel": "기사송출",       "budget":  60, "spent":  60, "metric": "노출 5건"},
            {"channel": "블로그",         "budget":  40, "spent":  35, "metric": "포스팅 3건"},
            {"channel": "스마트플레이스", "budget":  30, "spent":  28, "metric": "조회 2.4만"},
            {"channel": "홈페이지",       "budget":  20, "spent":  18, "metric": "방문 1.1만"},
        ],
    },
    "YSK": {
        "month": "26.04",
        "items": [
            {"channel": "인스타(광고)",   "budget": 280, "spent": 230, "metric": "도달 9.4만 · CTR 1.2%"},
            {"channel": "인플루언서",     "budget": 120, "spent": 100, "metric": "게재 2명 · 참여 0.8만"},
            {"channel": "인스타(자체)",   "budget":  80, "spent":  70, "metric": "팔로워 +180"},
            {"channel": "유튜브(자체)",   "budget":  60, "spent":  45, "metric": "조회 1.2만"},
            {"channel": "기사송출",       "budget":  40, "spent":  40, "metric": "노출 4건"},
            {"channel": "블로그",         "budget":  40, "spent":  30, "metric": "포스팅 2건"},
            {"channel": "스마트플레이스", "budget":  20, "spent":  18, "metric": "조회 1.6만"},
            {"channel": "홈페이지",       "budget":  20, "spent":  15, "metric": "방문 0.8만"},
        ],
    },
    "CYHU": {
        "month": "26.04",
        "items": [
            {"channel": "인플루언서",     "budget": 480, "spent": 440, "metric": "게재 6명 · 참여 2.8만"},
            {"channel": "인스타(광고)",   "budget": 320, "spent": 300, "metric": "도달 14.7만 · CTR 2.1%"},
            {"channel": "유튜브(자체)",   "budget": 240, "spent": 220, "metric": "주간 시리즈 · 조회 5.4만"},
            {"channel": "인스타(자체)",   "budget": 110, "spent": 100, "metric": "팔로워 +680"},
            {"channel": "기사송출",       "budget":  70, "spent":  65, "metric": "노출 7건"},
            {"channel": "블로그",         "budget":  60, "spent":  55, "metric": "포스팅 5건"},
            {"channel": "스마트플레이스", "budget":  50, "spent":  48, "metric": "조회 5.1만"},
            {"channel": "홈페이지",       "budget":  40, "spent":  35, "metric": "방문 2.4만"},
        ],
    },
}

# ============ 브랜드 ============
BRANDS = [
    {
        "code": "HMNBM",
        "name": "할머니의 부뚜막",
        "ceo": "윤지원, 황제이",
        "category": "한식 · 반찬",
        "accent": "#3B82F6",
        "store_total": 12,
        "kpi": 88,
        "kpi_trend": [75, 78, 82, 85, 88, 88],
        "franchise_avg_rev": [44_000_000, 45_000_000, 46_000_000, 47_000_000, 47_500_000, 48_200_000],
        "stores_monthly": [
            {"name": "강남역점",   "prev_prev": 118_000_000, "prev": 124_068_000},
            {"name": "정자점",     "prev_prev": 80_500_000,  "prev": 82_418_375},
            {"name": "위례점",     "prev_prev": 60_500_000,  "prev": 62_559_000},
            {"name": "서현점",     "prev_prev": 51_500_000,  "prev": 53_229_500},
            {"name": "하남미사점", "prev_prev": 48_500_000,  "prev": 49_037_000},
            {"name": "흥덕점",     "prev_prev": 45_200_000,  "prev": 43_010_400},
            {"name": "보정점",     "prev_prev": 41_000_000,  "prev": 41_927_000},
            {"name": "역북점",     "prev_prev": 34_200_000,  "prev": 35_458_000},
            {"name": "수지점",     "prev_prev": 30_300_000,  "prev": 31_500_000},
            {"name": "광교법조점", "prev_prev": 28_500_000,  "prev": 27_125_000},
            {"name": "과천점",     "prev_prev": 26_500_000,  "prev": 27_001_000},
            {"name": "센텀점",     "prev_prev": 21_800_000,  "prev": 19_275_000},
        ],
        "pipeline": {"상담중": 38, "계약완료": 12, "오픈예정": 3, "오픈완료": 9},
        "projects": [
            {"name": "강남역점 오픈 (매출 1.2억 달성)",   "owner": "황다혜", "progress": 100, "due": "2026-01-26", "status": "완료"},
            {"name": "센텀점 매출 회복 플랜",              "owner": "이영재", "progress": 35,  "due": "2026-06-30", "status": "진행중"},
            {"name": "마이프차 입점 / 정보 최신화",        "owner": "이서연", "progress": 60,  "due": "2026-06-15", "status": "진행중"},
            {"name": "브랜드 슬로건 확정",                 "owner": "황다혜", "progress": 80,  "due": "2026-05-22", "status": "진행중"},
            {"name": "인플루언서 30명 게재 캠페인",        "owner": "박지훈", "progress": 45,  "due": "2026-07-10", "status": "진행중"},
        ],
        "issues": [
            {"title": "센텀점 매출 32% 달성 (오픈 후 부진)", "priority": "높음", "status": "해결대기"},
            {"title": "광교법조점 매출 54% 달성",           "priority": "중간", "status": "진행중"},
        ],
    },
    {
        "code": "DRJ",
        "name": "동래정",
        "ceo": "박병진, 양형석",
        "category": "한식 · 백탄직화",
        "accent": "#F59E0B",
        "store_total": DRJ_STORE_TOTAL,
        "kpi": 85,
        "kpi_trend": [80, 82, 83, 84, 85, 85],
        # 매장 다수 보유, 매장당 평균은 안정 수준
        "franchise_avg_rev": [44_500_000, 45_200_000, 45_800_000, 46_400_000, 46_700_000, DRJ_FRANCHISE_AVG],
        "stores_monthly": DRJ_STORES_MONTHLY,
        # 오픈완료 = 54, 오픈예정 = 6 (실제 사용자 데이터 반영)
        "pipeline": {"상담중": 28, "계약완료": 12, "오픈예정": len(DRJ_OPENING_STORES), "오픈완료": DRJ_STORE_TOTAL},
        "projects": [
            {"name": "2세대 모델 정립 (객단가 상향)",  "owner": "이영재", "progress": 70, "due": "2026-07-15", "status": "진행중"},
            {"name": "해외진출 검토 (일본)",           "owner": "박상진", "progress": 35, "due": "2026-08-31", "status": "진행중"},
            {"name": "미디어 PR 강화 (경제지·요식업)", "owner": "정수민", "progress": 55, "due": "2026-06-30", "status": "진행중"},
            {"name": "정보공개서 정기변경 (26.04.22)", "owner": "이영재", "progress": 100,"due": "2026-04-22", "status": "완료"},
        ],
        "issues": [
            {"title": "일산식사점·일산주엽점 매출 하락",     "priority": "중간", "status": "진행중"},
            {"title": "부산명지·여수여서점 부진 추세",      "priority": "중간", "status": "해결대기"},
        ],
    },
    {
        "code": "MJD",
        "name": "마장동김씨",
        "ceo": "오용석",
        "category": "한식 · 한우 전문",
        "accent": "#EC4899",
        "store_total": 34,
        "kpi": 78,
        "kpi_trend": [70, 72, 74, 76, 78, 78],
        "franchise_avg_rev": [58_200_000, 53_900_000, 55_330_000, 49_490_000, 52_100_000, 53_800_000],
        "stores_monthly": [
            {"name": "수원인계점",   "prev_prev": 114_500_000, "prev": 113_000_000},
            {"name": "인천구월점",   "prev_prev": 88_300_000,  "prev": 78_200_000},
            {"name": "산본점",       "prev_prev": 86_700_000,  "prev": 87_200_000},
            {"name": "명촌맛집점",   "prev_prev": 84_800_000,  "prev": 70_300_000},
            {"name": "봉명점",       "prev_prev": 81_300_000,  "prev": 72_500_000},
            {"name": "동남지구점",   "prev_prev": 67_500_000,  "prev": 69_500_000},
            {"name": "서면점",       "prev_prev": 66_700_000,  "prev": 66_400_000},
            {"name": "연산시청점",   "prev_prev": 56_400_000,  "prev": 60_100_000},
            {"name": "일광점",       "prev_prev": 58_500_000,  "prev": 53_300_000},
            {"name": "동래점",       "prev_prev": 57_100_000,  "prev": 53_700_000},
            {"name": "경남고성점",   "prev_prev": 46_500_000,  "prev": 48_000_000},
            {"name": "오류점",       "prev_prev": 41_500_000,  "prev": 42_300_000},
            {"name": "청라점",       "prev_prev": 38_000_000,  "prev": 40_500_000},
            {"name": "안성점",       "prev_prev": 37_600_000,  "prev": 40_200_000},
            {"name": "망포점",       "prev_prev": 35_400_000,  "prev": 37_500_000},
            {"name": "일산식사점",   "prev_prev": 18_500_000,  "prev": 17_200_000},
        ],
        "pipeline": {"상담중": 12, "계약완료": 3, "오픈예정": 2, "오픈완료": 32},
        "projects": [
            {"name": "리브랜딩 캠페인 (3개월)",            "owner": "박상진", "progress": 65, "due": "2026-06-30", "status": "진행중"},
            {"name": "브랜드 포지셔닝 + 톤앤매너 재정의", "owner": "이서연", "progress": 50, "due": "2026-05-30", "status": "진행중"},
            {"name": "어플리케이션 v2 출시 (멤버십 통합)","owner": "박상진", "progress": 65, "due": "2026-07-15", "status": "진행중"},
            {"name": "배곧점 오픈 준비 (BASE 6천만)",     "owner": "한도윤", "progress": 80, "due": "2026-06-10", "status": "진행중"},
        ],
        "issues": [
            {"title": "일산식사점 매출 하락 추세",         "priority": "중간", "status": "진행중"},
            {"title": "점주 불만 (가격 인상·인건비 이슈)", "priority": "중간", "status": "해결대기"},
        ],
    },
    {
        "code": "PAD",
        "name": "평안도식당",
        "ceo": "박병진, 양형석",
        "category": "한식 · 평양냉면",
        "accent": "#10B981",
        "store_total": 4,
        "kpi": 92,
        "kpi_trend": [90, 91, 92, 92, 91, 92],
        "franchise_avg_rev": [78_000_000, 79_500_000, 80_500_000, 81_200_000, 81_500_000, 82_000_000],
        "stores_monthly": [
            {"name": "을지로본점", "prev_prev": 89_500_000, "prev": 89_400_000},
            {"name": "광화문점",   "prev_prev": 82_500_000, "prev": 82_100_000},
            {"name": "강남대치점", "prev_prev": 78_200_000, "prev": 78_500_000},
            {"name": "판교점",     "prev_prev": 72_200_000, "prev": 71_800_000},
        ],
        "pipeline": {"상담중": 8, "계약완료": 3, "오픈예정": 1, "오픈완료": 3},
        "projects": [
            {"name": "본사 손익 안정화 (고정비 5% 절감)", "owner": "황혜란", "progress": 75, "due": "2026-06-30", "status": "진행중"},
            {"name": "점주 교육 프로그램 v2 (8주)",       "owner": "이서연", "progress": 40, "due": "2026-07-30", "status": "진행중"},
        ],
        "issues": [],
    },
    {
        "code": "YSK",
        "name": "요쇼쿠",
        "ceo": "강동윤",
        "category": "일식 · 가정식",
        "accent": "#8B5CF6",
        "store_total": 15,
        "kpi": 68,
        "kpi_trend": [72, 70, 68, 67, 66, 68],
        "franchise_avg_rev": [44_500_000, 43_200_000, 42_000_000, 41_300_000, 40_500_000, 40_800_000],
        "stores_monthly": [
            {"name": "명동점",     "prev_prev": 78_500_000, "prev": 77_300_000},
            {"name": "죽전점",     "prev_prev": 72_500_000, "prev": 70_300_000},
            {"name": "성수점",     "prev_prev": 65_800_000, "prev": 66_000_000},
            {"name": "기흥점",     "prev_prev": 58_700_000, "prev": 59_000_000},
            {"name": "목동점",     "prev_prev": 53_500_000, "prev": 52_900_000},
            {"name": "노원점",     "prev_prev": 53_000_000, "prev": 52_400_000},
            {"name": "김포공항점", "prev_prev": 48_500_000, "prev": 46_800_000},
            {"name": "파주점",     "prev_prev": 46_000_000, "prev": 45_200_000},
            {"name": "광교상현점", "prev_prev": 43_500_000, "prev": 41_500_000},
            {"name": "구월점",     "prev_prev": 35_000_000, "prev": 33_300_000},
            {"name": "중동점",     "prev_prev": 29_500_000, "prev": 27_700_000},
            {"name": "안산점",     "prev_prev": 27_500_000, "prev": 26_000_000},
            {"name": "춘천점",     "prev_prev": 25_500_000, "prev": 23_500_000},
            {"name": "일산점",     "prev_prev": 24_000_000, "prev": 22_500_000},
            {"name": "마곡점",     "prev_prev": 22_500_000, "prev": 20_900_000},
        ],
        "pipeline": {"상담중": 9, "계약완료": 2, "오픈예정": 1, "오픈완료": 14},
        "projects": [
            {"name": "QSR 전략 (배달 + 마케팅 최적화)",     "owner": "정수민", "progress": 55, "due": "2026-07-30", "status": "진행중"},
            {"name": "2세대 모델 타임테이블",               "owner": "한도윤", "progress": 45, "due": "2026-08-15", "status": "진행중"},
            {"name": "가맹점 분쟁 해결 (내용증명 3건)",     "owner": "정수민", "progress": 55, "due": "2026-06-30", "status": "진행중"},
            {"name": "부진 매장 회복 (마곡·구월·중동)",     "owner": "정수민", "progress": 30, "due": "2026-07-31", "status": "진행중"},
            {"name": "브랜드 리뉴얼 검토 (요쇼쿠천국)",     "owner": "한도윤", "progress": 20, "due": "2026-08-30", "status": "진행중"},
        ],
        "issues": [
            {"title": "내용증명 3건 답변 마감",           "priority": "높음", "status": "해결대기"},
            {"title": "마곡·구월점 매출 부진 (40% 수준)", "priority": "높음", "status": "진행중"},
        ],
    },
    {
        "code": "CYHU",
        "name": "청년한우",
        "ceo": "정성현",
        "category": "한식 · 한우 외식",
        "accent": "#06B6D4",
        "store_total": 12,
        "kpi": 70,
        "kpi_trend": [68, 69, 70, 70, 71, 70],
        "franchise_avg_rev": [25_600_000, 26_200_000, 26_800_000, 26_500_000, 27_100_000, 27_400_000],
        "stores_monthly": [
            {"name": "강동둔촌점",     "prev_prev": 56_500_000, "prev": 58_300_000},
            {"name": "송파방이점",     "prev_prev": 47_500_000, "prev": 48_200_000},
            {"name": "이촌점",         "prev_prev": 42_800_000, "prev": 42_100_000},
            {"name": "목동남부시장점", "prev_prev": 38_500_000, "prev": 37_900_000},
            {"name": "울산태화시장점", "prev_prev": 35_500_000, "prev": 34_600_000},
            {"name": "강동명일점",     "prev_prev": 27_500_000, "prev": 26_200_000},
            {"name": "수지구청점",     "prev_prev": 26_500_000, "prev": 25_600_000},
            {"name": "판교점",         "prev_prev": 24_500_000, "prev": 23_800_000},
            {"name": "상대점",         "prev_prev": 19_500_000, "prev": 20_600_000},
            {"name": "순천왕지점",     "prev_prev": 19_500_000, "prev": 18_700_000},
            {"name": "대전송촌점",     "prev_prev": 17_500_000, "prev": 16_500_000},
            {"name": "한민시장점",     "prev_prev": 13_500_000, "prev": 11_500_000},
        ],
        "pipeline": {"상담중": 22, "계약완료": 6, "오픈예정": 2, "오픈완료": 12},
        "projects": [
            {"name": "가맹점 매출 증대 전략 (전 매장 10%↑)","owner": "한도윤", "progress": 55, "due": "2026-07-31", "status": "진행중"},
            {"name": "3세대 모델 (정육+즉석식품)",          "owner": "박병진", "progress": 40, "due": "2026-08-31", "status": "진행중"},
            {"name": "VMD 보완 (수지구청 시범)",            "owner": "이서연", "progress": 70, "due": "2026-06-15", "status": "진행중"},
            {"name": "회원 데이터·CRM 도입 (재구매 분석)",  "owner": "박지훈", "progress": 35, "due": "2026-07-15", "status": "진행중"},
            {"name": "유튜브 콘텐츠 시리즈 (주 1편)",       "owner": "박지훈", "progress": 50, "due": "2026-07-15", "status": "진행중"},
        ],
        "issues": [
            {"title": "한민시장점 매출 57% 달성",          "priority": "높음", "status": "진행중"},
            {"title": "대전송촌·강동명일점 66% 수준",      "priority": "중간", "status": "해결대기"},
        ],
    },
]


def _by_code(code):
    for b in BRANDS:
        if b["code"] == code:
            return b
    return None


def _kpi_color(v):
    return "green" if v >= 90 else "orange" if v >= 70 else "red"


def _active_project_count(b):
    return sum(1 for p in b["projects"] if p["status"] != "완료")


def _brand_summary(b):
    return {
        "code": b["code"],
        "name": b["name"],
        "ceo": b["ceo"],
        "category": b["category"],
        "accent": b["accent"],
        "store_total": b["store_total"],
        "opening_count": b["pipeline"]["오픈예정"],
        "kpi": b["kpi"],
        "kpi_color": _kpi_color(b["kpi"]),
        "projects_count": _active_project_count(b),
        "issues_count": sum(1 for i in b["issues"] if i["status"] != "완료"),
    }


def _sidebar_sorted(brands):
    """SIDEBAR_ORDER 순서로 정렬"""
    return sorted(brands, key=lambda b: SIDEBAR_ORDER.index(b["code"]) if b["code"] in SIDEBAR_ORDER else 999)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/portfolio")
def api_portfolio():
    sorted_brands = _sidebar_sorted(BRANDS)
    brand_summaries = [_brand_summary(b) for b in sorted_brands]

    avg_kpi = round(sum(b["kpi"] for b in BRANDS) / len(BRANDS), 1)
    total_projects = sum(s["projects_count"] for s in brand_summaries)
    total_opening = sum(b["pipeline"]["오픈예정"] for b in BRANDS)
    total_issues = sum(s["issues_count"] for s in brand_summaries)
    total_stores = sum(b["store_total"] for b in BRANDS)

    priority_order = {"높음": 0, "중간": 1, "낮음": 2}
    status_order = {"해결대기": 0, "진행중": 1, "완료": 2}
    all_issues = []
    for b in BRANDS:
        for it in b["issues"]:
            all_issues.append({
                "title": it["title"],
                "brand": b["name"],
                "accent": b["accent"],
                "priority": it["priority"],
                "status": it["status"],
            })
    all_issues.sort(key=lambda x: (priority_order.get(x["priority"], 9), status_order.get(x["status"], 9)))

    return jsonify({
        "month_labels": MONTH_LABELS,
        "main_kpi": {
            "avg_kpi": avg_kpi,
            "avg_kpi_color": _kpi_color(avg_kpi),
            "total_projects": total_projects,
            "total_opening": total_opening,
            "total_issues": total_issues,
            "total_stores": total_stores,
        },
        "brands": brand_summaries,
        "chart_kpi": [{"name": b["name"], "kpi": b["kpi"], "color": _kpi_color(b["kpi"]), "accent": b["accent"]} for b in sorted_brands],
        "chart_pipeline": [{"name": b["name"], "opening": b["pipeline"]["오픈예정"], "opened": b["pipeline"]["오픈완료"]} for b in sorted_brands],
        "chart_franchise_avg_rev": {
            "prev_month": MONTH_LABELS[-1],         # 전월 (가장 최근)
            "prev_prev_month": MONTH_LABELS[-2],    # 전전월
            "items": [
                {
                    "name": b["name"],
                    "prev": b["franchise_avg_rev"][-1],
                    "prev_prev": b["franchise_avg_rev"][-2],
                    "accent": b["accent"],
                }
                for b in sorted_brands
            ],
        },
        "issues": all_issues,
    })


@app.route("/api/brand/<code>")
def api_brand(code):
    b = _by_code(code)
    if not b:
        return jsonify({"error": "brand not found"}), 404
    return jsonify({
        "code": b["code"],
        "name": b["name"],
        "ceo": b["ceo"],
        "category": b["category"],
        "accent": b["accent"],
        "store_total": b["store_total"],
        "main_kpi": {
            "kpi": b["kpi"],
            "kpi_color": _kpi_color(b["kpi"]),
            "projects_count": _active_project_count(b),
            "opening_count": b["pipeline"]["오픈예정"],
            "issues_count": sum(1 for i in b["issues"] if i["status"] != "완료"),
            "store_total": b["store_total"],
        },
        "projects": b["projects"],
        "pipeline": b["pipeline"],
        "pipeline_detail": PIPELINE_DETAIL.get(b["code"], {}),
        "marketing": MARKETING_DATA.get(b["code"], {"month": MONTH_LABELS[-1], "items": []}),
        "month_labels": MONTH_LABELS,
        "kpi_trend": b["kpi_trend"],
        "stores_monthly": b.get("stores_monthly", []),
        "stores_monthly_meta": {
            "prev_month": MONTH_LABELS[-1],
            "prev_prev_month": MONTH_LABELS[-2],
        },
        "issues": sorted(b["issues"], key=lambda x: ({"높음": 0, "중간": 1, "낮음": 2}.get(x["priority"], 9))),
    })


if __name__ == "__main__":
    import os
    # 로컬은 127.0.0.1:5000 · Render 같은 PaaS는 PORT 환경변수로 포트 지정
    port = int(os.environ.get("PORT", 5000))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host=host, port=port, debug=debug)
