#!/usr/bin/env python3
"""SCMS Product Manual PDF Generator — Korean + English hybrid"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── Font Setup (Korean support) ─────────────────────────────────────────────
FONT_DIR = "C:/Windows/Fonts"
fonts_registered = False
try:
    pdfmetrics.registerFont(TTFont('NanumGothic', os.path.join(FONT_DIR, 'NanumGothic.ttf')))
    pdfmetrics.registerFont(TTFont('NanumGothicBold', os.path.join(FONT_DIR, 'NanumGothicBold.ttf')))
    FONT = 'NanumGothic'
    FONT_BOLD = 'NanumGothicBold'
    fonts_registered = True
except:
    try:
        pdfmetrics.registerFont(TTFont('Malgun', os.path.join(FONT_DIR, 'malgun.ttf')))
        pdfmetrics.registerFont(TTFont('MalgunBold', os.path.join(FONT_DIR, 'malgunbd.ttf')))
        FONT = 'Malgun'
        FONT_BOLD = 'MalgunBold'
        fonts_registered = True
    except:
        FONT = 'Helvetica'
        FONT_BOLD = 'Helvetica-Bold'

# ─── Colors ──────────────────────────────────────────────────────────────────
NAVY = HexColor('#0f172a')
BLUE = HexColor('#2563eb')
DARK_BLUE = HexColor('#1e3a5f')
LIGHT_BLUE = HexColor('#dbeafe')
GREEN = HexColor('#059669')
ORANGE = HexColor('#ea580c')
RED = HexColor('#dc2626')
GRAY = HexColor('#64748b')
LIGHT_GRAY = HexColor('#f1f5f9')
DARK_GRAY = HexColor('#334155')

# ─── Styles ──────────────────────────────────────────────────────────────────
sTitle = ParagraphStyle('Title', fontName=FONT_BOLD, fontSize=28, textColor=NAVY, alignment=TA_CENTER, spaceAfter=6*mm)
sSubtitle = ParagraphStyle('Subtitle', fontName=FONT, fontSize=13, textColor=GRAY, alignment=TA_CENTER, spaceAfter=12*mm)
sH1 = ParagraphStyle('H1', fontName=FONT_BOLD, fontSize=18, textColor=NAVY, spaceBefore=8*mm, spaceAfter=4*mm, borderWidth=0, borderColor=BLUE, borderPadding=2)
sH2 = ParagraphStyle('H2', fontName=FONT_BOLD, fontSize=14, textColor=DARK_BLUE, spaceBefore=6*mm, spaceAfter=3*mm)
sH3 = ParagraphStyle('H3', fontName=FONT_BOLD, fontSize=11, textColor=BLUE, spaceBefore=4*mm, spaceAfter=2*mm)
sBody = ParagraphStyle('Body', fontName=FONT, fontSize=10, textColor=DARK_GRAY, leading=16, spaceAfter=2*mm)
sBullet = ParagraphStyle('Bullet', fontName=FONT, fontSize=10, textColor=DARK_GRAY, leading=16, leftIndent=12, bulletIndent=0, spaceAfter=1*mm)
sSmall = ParagraphStyle('Small', fontName=FONT, fontSize=8, textColor=GRAY, leading=12)
sFooter = ParagraphStyle('Footer', fontName=FONT, fontSize=7, textColor=GRAY, alignment=TA_CENTER)
sKPI = ParagraphStyle('KPI', fontName=FONT_BOLD, fontSize=20, textColor=BLUE, alignment=TA_CENTER)
sKPILabel = ParagraphStyle('KPILabel', fontName=FONT, fontSize=8, textColor=GRAY, alignment=TA_CENTER)

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=HexColor('#cbd5e1'), spaceAfter=3*mm, spaceBefore=2*mm)

def kpi_table(items):
    """items = [(value, label), ...]"""
    data = [[Paragraph(str(v), sKPI) for v, _ in items],
            [Paragraph(l, sKPILabel) for _, l in items]]
    t = Table(data, colWidths=[45*mm]*len(items))
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_BLUE),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 0.5, BLUE),
        ('INNERGRID', (0,0), (-1,-1), 0.3, HexColor('#93c5fd')),
        ('TOPPADDING', (0,0), (-1,0), 4*mm),
        ('BOTTOMPADDING', (0,0), (-1,0), 1*mm),
        ('TOPPADDING', (0,1), (-1,1), 1*mm),
        ('BOTTOMPADDING', (0,1), (-1,1), 3*mm),
    ]))
    return t

def feature_table(rows):
    """rows = [(feature, description), ...]"""
    header = [Paragraph('<b>Feature</b>', ParagraphStyle('th', fontName=FONT_BOLD, fontSize=9, textColor=white)),
              Paragraph('<b>Description</b>', ParagraphStyle('th', fontName=FONT_BOLD, fontSize=9, textColor=white))]
    data = [header]
    for feat, desc in rows:
        data.append([
            Paragraph(feat, ParagraphStyle('td', fontName=FONT_BOLD, fontSize=9, textColor=NAVY)),
            Paragraph(desc, ParagraphStyle('td', fontName=FONT, fontSize=9, textColor=DARK_GRAY, leading=13))
        ])
    t = Table(data, colWidths=[50*mm, 120*mm])
    style = [
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOX', (0,0), (-1,-1), 0.5, GRAY),
        ('INNERGRID', (0,0), (-1,-1), 0.3, HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 2*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 3*mm),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0,i), (-1,i), LIGHT_GRAY))
    t.setStyle(TableStyle(style))
    return t

# ─── Build Document ──────────────────────────────────────────────────────────
output_path = os.path.join(os.path.dirname(__file__), 'SCMS_Manual_v1.pdf')
doc = SimpleDocTemplate(output_path, pagesize=A4,
                        topMargin=20*mm, bottomMargin=20*mm,
                        leftMargin=18*mm, rightMargin=18*mm)
story = []

# ══════════════════════════════════════════════════════════════════════════════
# COVER PAGE
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 40*mm))
story.append(Paragraph("SCMS", ParagraphStyle('CoverTitle', fontName=FONT_BOLD, fontSize=52, textColor=NAVY, alignment=TA_CENTER)))
story.append(Spacer(1, 5*mm))
story.append(Paragraph("SEASTAR Cable Management System", ParagraphStyle('CoverSub1', fontName=FONT_BOLD, fontSize=16, textColor=BLUE, alignment=TA_CENTER)))
story.append(Spacer(1, 8*mm))
story.append(HRFlowable(width="60%", thickness=2, color=BLUE, spaceAfter=8*mm))
story.append(Paragraph("Product Manual & Feature Guide", ParagraphStyle('CoverSub2', fontName=FONT, fontSize=12, textColor=GRAY, alignment=TA_CENTER)))
story.append(Spacer(1, 4*mm))
story.append(Paragraph("Version 1.0 | April 2026", ParagraphStyle('CoverVer', fontName=FONT, fontSize=10, textColor=GRAY, alignment=TA_CENTER)))
story.append(Spacer(1, 30*mm))
story.append(Paragraph("SEASTAR Corp.", ParagraphStyle('CoverCo', fontName=FONT_BOLD, fontSize=14, textColor=NAVY, alignment=TA_CENTER)))
story.append(Paragraph("World Shipbuilding & Offshore Design Provider", ParagraphStyle('CoverTag', fontName=FONT, fontSize=9, textColor=GRAY, alignment=TA_CENTER)))
story.append(Spacer(1, 6*mm))
story.append(Paragraph("https://scm.seastar.work", ParagraphStyle('CoverURL', fontName=FONT, fontSize=10, textColor=BLUE, alignment=TA_CENTER)))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TABLE OF CONTENTS
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Contents", sH1))
story.append(hr())
toc_items = [
    "1. System Overview",
    "2. Dashboard",
    "3. Cable List & Data Management",
    "4. Node Info & Network Topology",
    "5. Routing & Smart Path Calculation",
    "6. Tray Fill Optimization (9-Tier)",
    "7. 3D Visualization",
    "8. BOM Analysis (6 Modules)",
    "9. Verification & Compliance",
    "10. Node Editor (KaveRouter)",
    "11. Advanced Features",
    "12. Technical Specifications",
]
for item in toc_items:
    story.append(Paragraph(item, ParagraphStyle('TOC', fontName=FONT, fontSize=11, textColor=DARK_BLUE, leading=20, leftIndent=8*mm)))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 1. SYSTEM OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("1. System Overview", sH1))
story.append(hr())
story.append(Paragraph(
    "SCMS(SEASTAR Cable Management System)는 선박 및 해양 플랜트의 케이블 설계·관리를 위한 "
    "클라우드 기반 SaaS 플랫폼입니다. 엑셀 데이터 업로드만으로 자동 경로 계산, 트레이 최적화, "
    "3D 시각화, BOM 산출, 선급 검증까지 원스톱으로 처리합니다.", sBody))
story.append(Spacer(1, 4*mm))
story.append(kpi_table([
    ("349+", "Cable Types DB"),
    ("9-Tier", "Tray Optimization"),
    ("6", "BOM Modules"),
    ("3D", "Visualization"),
]))
story.append(Spacer(1, 6*mm))
story.append(Paragraph("Key Differentiators", sH2))
story.append(feature_table([
    ("Cloud-Native", "Cloudflare Pages + D1 Database, 글로벌 엣지 배포, 제로 인프라 비용"),
    ("Real-time Collaboration", "Google/Kakao/Naver SSO 로그인, 프로젝트별 독립 데이터"),
    ("Physics-Based Solver", "중력 기반 케이블 배치 시뮬레이션, 충돌 검사, 지지 검증"),
    ("IEC/JIS Compliance", "IEC 60092, JIS C3410-2010, DNV/KR/LR 선급 규칙 30개 자동 검증"),
    ("One-Click BOM", "터미널, 트레이, 발주, 코밍, 네임태그, 그랜드 6종 BOM 자동 산출"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 2. DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("2. Dashboard", sH1))
story.append(hr())
story.append(Paragraph(
    "프로젝트 진입 시 가장 먼저 보이는 대시보드입니다. 전체 케이블/노드 현황을 한눈에 파악합니다.", sBody))
story.append(Spacer(1, 3*mm))
story.append(Paragraph("KPI Summary", sH3))
story.append(kpi_table([
    ("2,469", "Total Cables"),
    ("1,094", "Total Nodes"),
    ("152,465m", "Total Length"),
    ("2,469", "Calculated Paths"),
]))
story.append(Spacer(1, 4*mm))
story.append(feature_table([
    ("System Distribution", "POWER, LTG, CONT, FIRE, COMM 등 시스템별 도넛 차트"),
    ("Type Distribution", "케이블 타입별 수량 막대 차트 (DY2, MY4, FMY2, TY150 등)"),
    ("Top 10 Nodes", "케이블 밀집도 상위 10개 노드 수평 막대 (PR130, PR030, SF99S 등)"),
    ("Quick Actions", "프로젝트 전환, 데이터 새로고침, Undo/Redo"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 3. CABLE LIST
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("3. Cable List & Data Management", sH1))
story.append(hr())
story.append(Paragraph(
    "엑셀 파일로 케이블 데이터를 업로드하고 실시간 편집·검색·필터링합니다. "
    "케이블 타입 DB(349종 하드코딩)와 자동 매칭하여 O.D, 단면적, 중량을 자동 반영합니다.", sBody))
story.append(feature_table([
    ("Excel Upload", "CABLE LIST 엑셀 업로드 → 자동 컬럼 매핑 (NAME, TYPE, OD, FROM/TO NODE 등)"),
    ("Cable Type DB", "349종 JIS/IEC 해양 케이블 타입 사전 등록 (O.D, 단면적, 무게, DIN, Gland Size)"),
    ("Auto OD Matching", "케이블 타입 → O.D 자동 매핑 (수동 입력 불필요)"),
    ("Inline Edit", "셀 클릭으로 즉시 편집, Ctrl+Z Undo 지원"),
    ("Smart Filter", "타입, 시스템, 이름 검색 필터"),
    ("Excel Export", "전체 데이터 엑셀 내보내기"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 4. NODE INFO
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("4. Node Info & Network Topology", sH1))
story.append(hr())
story.append(Paragraph(
    "노드(배선 경유점)의 속성 조회 및 케이블 통과량 분석. 각 노드의 단면적, 추천 트레이 폭을 자동 산출합니다.", sBody))
story.append(feature_table([
    ("Node Summary", "이름, 구조물, 타입, 연결(Relation), 링크 길이, 좌표(X/Y/Z), 덱 정보"),
    ("Cable Analysis", "노드 통과 케이블 수, 단면적 합계, 권장 트레이 폭 자동 계산"),
    ("Cross-Section", "케이블 OD 기반 단면적(mm2) 합산 → Fill Rate 40% 기준 폭 산출"),
    ("Excel Export", "노드별 통과 케이블 상세 시트 포함 엑셀 내보내기"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 5. ROUTING
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("5. Routing & Smart Path Calculation", sH1))
story.append(hr())
story.append(Paragraph(
    "노드 네트워크에서 최적 케이블 경로를 자동 계산합니다. BFS 기본 라우터와 Dijkstra 기반 "
    "스마트 라우터 2종을 제공합니다.", sBody))
story.append(Spacer(1, 3*mm))
story.append(Paragraph("Routing Algorithms", sH2))
story.append(feature_table([
    ("Basic Router", "BFS(Breadth-First Search) — 최소 홉 경로, 체크포인트(checkNode) 지원"),
    ("Smart Router", "가중 Dijkstra + 동적 부하 페널티 — 부하 분산, 시스템 분리, K-경로 대안"),
    ("CheckNode", "중간 경유점(코밍, MCT 등) 지정 → 반드시 해당 노드 경유 보장"),
    ("Load Balancing", "케이블 밀집 노드에 페널티 → 자동 우회 분산 (loadBalanceFactor 조정)"),
    ("Batch Optimization", "긴 케이블 우선 라우팅 → 짧은 케이블은 유연하게 우회"),
    ("Bottleneck Report", "상위 10개 과밀 노드, 평균/최대 부하, 개선율 리포트"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 6. TRAY FILL
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("6. Tray Fill Optimization", sH1))
story.append(hr())
story.append(Paragraph(
    "물리 기반 시뮬레이션으로 케이블 트레이 최적 배치를 계산합니다. "
    "9단(L1~L9) × 8폭(200~900mm) = 72가지 조합을 자동 분석하여 최적 설정 2개를 추천합니다.", sBody))
story.append(Spacer(1, 3*mm))
story.append(kpi_table([
    ("9-Tier", "L1~L9 단수"),
    ("72", "Matrix Combinations"),
    ("Dual", "Compare Layout"),
    ("DXF", "CAD Export"),
]))
story.append(Spacer(1, 4*mm))
story.append(feature_table([
    ("Physics Solver", "중력 기반 배치, 충돌 검사, 지지 검증 (15도 간격 후보 탐색)"),
    ("9-Tier Support", "L1~L9 단수 선택 (기존 5단 → 9단 확장)"),
    ("Fill Rate Matrix", "9x8 매트릭스 → 최적(초록), 여유(파랑), 초과(빨강) 시각화"),
    ("Dual Layout", "가장 효율적인 2개 설정 동시 비교 (상/하 분할 뷰)"),
    ("TRAY TYPE Table", "LA2~LI9 명명 체계, 72셀 팝업 참조표, 클릭 전환"),
    ("Node Selection", "노드별 통과 케이블 필터, 최다 통과 노드 자동 선택"),
    ("DXF Export", "트레이 구조 + 케이블 배치 CAD 도면 내보내기"),
    ("Details Toggle", "Matrix/Summary 패널 숨김/표시 토글"),
]))
story.append(Spacer(1, 4*mm))
story.append(Paragraph("TRAY TYPE Naming Convention", sH3))
tray_data = [
    [Paragraph('<b>Level\\Width</b>', sSmall)] + [Paragraph(f'<b>{w}</b>', sSmall) for w in [200,300,400,500,600,700,800,900]],
]
letters = 'ABCDEFGHI'
for i, letter in enumerate(letters):
    row = [Paragraph(f'<b>{i+1} ({letter})</b>', sSmall)]
    for w in [200,300,400,500,600,700,800,900]:
        row.append(Paragraph(f'L{letter}{w//100}', sSmall))
    tray_data.append(row)
tray_t = Table(tray_data, colWidths=[18*mm]+[18*mm]*8)
tray_t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), NAVY),
    ('BACKGROUND', (0,1), (0,-1), DARK_BLUE),
    ('TEXTCOLOR', (0,0), (-1,0), white),
    ('TEXTCOLOR', (0,1), (0,-1), white),
    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('BOX', (0,0), (-1,-1), 0.5, GRAY),
    ('INNERGRID', (0,0), (-1,-1), 0.3, HexColor('#e2e8f0')),
    ('FONTSIZE', (0,0), (-1,-1), 7),
    ('TOPPADDING', (0,0), (-1,-1), 1.5*mm),
    ('BOTTOMPADDING', (0,0), (-1,-1), 1.5*mm),
]))
story.append(tray_t)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 7. 3D VIEW
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("7. 3D Visualization", sH1))
story.append(hr())
story.append(Paragraph(
    "Three.js 기반 실시간 3D 시각화. 노드 네트워크와 케이블 경로를 입체적으로 탐색합니다.", sBody))
story.append(feature_table([
    ("Coordinate Mode", "실제 선박 좌표(X/Y/Z) 기반 배치 — 덱 평면 시각화"),
    ("Auto Layout", "Force-directed 물리 시뮬레이션 자동 배치 (80회 반복)"),
    ("Cable Paths", "계산된 경로를 3D 라인으로 시각화 (초록 = 일반, 주황 = 하이라이트)"),
    ("Interactive", "OrbitControls 회전/확대, 노드 클릭 선택, 케이블 검색/하이라이트"),
    ("Camera Presets", "ISO / Top / Side / Front 4방향 프리셋"),
    ("Color Legend", "덱별 또는 타입별 색상 범례 (토글)"),
    ("Fire Animation", "선택 케이블 경로 펄스 애니메이션 (빨강→주황 그라데이션)"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 8. BOM ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("8. BOM Analysis — 6 Modules", sH1))
story.append(hr())
story.append(Paragraph(
    "BOM 상세 분석 6종을 한 화면에서 탭 전환으로 제공합니다. 각 모듈별 KPI 카드, 상세 테이블, CSV 내보내기를 지원합니다.", sBody))
story.append(Spacer(1, 3*mm))

# 8-1 Terminal
story.append(Paragraph("8-1. Terminal BOM (터미널 BOM)", sH2))
story.append(Paragraph(
    "케이블 도체 단면적(mm2) 기반 페룰/링 단자 자동 산출. IEC 60228 / JIS C3410 기준.", sBody))
story.append(kpi_table([("23,684", "Total Terminals"), ("21,158", "Ferrule"), ("2,526", "Ring Lug"), ("12", "Spec Types")]))
story.append(Spacer(1, 3*mm))
story.append(feature_table([
    ("Ferrule (0.5~6mm2)", "E0508, E7508, E1008, E1508, E2508, E4009, E6012 — 7종"),
    ("Ring Lug (10mm2+)", "RL-10-M5 ~ RL-95-M20 — 5종 (볼트 크기별)"),
    ("Core Count Map", "56종 케이블 타입별 정확한 코어수 매핑 (MY4=8C, DY2=2C 등)"),
    ("Quantity Formula", "케이블 수 x 코어수 x 2단 (FROM端 + TO端)"),
]))
story.append(Spacer(1, 3*mm))

# 8-2 Tray
story.append(Paragraph("8-2. Tray BOM (트레이 BOM)", sH2))
story.append(Paragraph("경로 세그먼트별 트레이 폭/길이 집계. 노드 linkLength 기반 추정.", sBody))
story.append(Spacer(1, 2*mm))

# 8-3 Procurement
story.append(Paragraph("8-3. Procurement BOM (발주 BOM)", sH2))
story.append(Paragraph("케이블 타입별 총 길이 + 5% 여유 + 단위중량(kg/km) 기반 총 중량 산출.", sBody))
story.append(Spacer(1, 2*mm))

# 8-4 Coaming
story.append(Paragraph("8-4. Coaming BOM (코밍 BOM)", sH2))
story.append(Paragraph(
    "코밍 관통부 컴파운드/마가나 물량 산출. E/R+C/H→COMPOUND, ACC→MANGANA.", sBody))
story.append(feature_table([
    ("10 Types", "CBP-100A, CBC-4~CBC-39 (사전 등록, 수량 편집 가능)"),
    ("COMPOUND", "밀도 2.0 Kg/dm3, 1세트=12.5Kg (POWDER 7.5+HARDNER 5.0)"),
    ("MANGANA", "100x100mm 박스, 0.84 Kg/EA"),
    ("Cable Fill", "기본 35% (조정 가능), 컴파운드 충진 = 65%"),
]))
story.append(Spacer(1, 2*mm))

# 8-5 Tag
story.append(Paragraph("8-5. Name Tag BOM (네임태그 BOM)", sH2))
story.append(Paragraph("케이블당 기본 2개(FROM/TO) + CTYPE 코밍 통과 시 추가 옵션.", sBody))
story.append(Spacer(1, 2*mm))

# 8-6 Gland
story.append(Paragraph("8-6. Cable Gland BOM (그랜드 BOM)", sH2))
story.append(Paragraph(
    "JIS Standard OSCG Type 46종. 장비별 Cable OD → D >= OD 최소 매칭.", sBody))
story.append(kpi_table([("4,938", "Total Glands"), ("19", "Gland Types"), ("901", "Equipment")]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 9. VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("9. Verification & Compliance", sH1))
story.append(hr())

story.append(Paragraph("9-1. Interference Check (간섭 체크)", sH2))
story.append(Paragraph("파워/시그널 케이블 혼재, 트레이 과적, 시스템 분리 위반 자동 검출.", sBody))

story.append(Paragraph("9-2. Voltage Drop (전압강하)", sH2))
story.append(Paragraph(
    "IEC 60092 기준 전압강하 계산. terminalCore 파싱으로 도체 단면적 자동 추출. "
    "허용전류 Iz 테이블(100%/85% 디레이팅) 포함.", sBody))
story.append(feature_table([
    ("Auto Conductor", "terminalCore 'NxM' 형식 파싱 → 도체 mm2 자동 추출"),
    ("IEC Iz Table", "0.5~300mm2, 45도C 기준 허용전류 19단계"),
    ("Derating Toggle", "100% (단독/자유 공기) vs 85% (묶음/트레이) 전환"),
    ("Pass/Fail/Overcurrent", "전압강하 PASS + 과전류 경고(주황) 3단계 판정"),
]))
story.append(Spacer(1, 3*mm))

story.append(Paragraph("9-3. Class Rule (선급 Rule)", sH2))
story.append(Paragraph("DNV/KR/LR 30개 선급 규칙 자동 검증. 케이블별 적합/부적합 판정.", sBody))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 10. NODE EDITOR
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("10. Node Editor (KaveRouter)", sH1))
story.append(hr())
story.append(Paragraph(
    "2D 캔버스 기반 인터랙티브 노드 편집기. DXF 도면 배경 위에서 노드를 생성/이동/연결/삭제합니다. "
    "변경사항은 프로젝트 D1 데이터베이스에 즉시 저장됩니다.", sBody))
story.append(Spacer(1, 3*mm))
story.append(feature_table([
    ("3 Editor Modes", "Select (선택/이동) · Place (노드 생성) · Connect (연결 생성)"),
    ("DXF Background", "AutoCAD DXF 도면 업로드 → 레이어별 표시/숨김"),
    ("Axis Lock", "Free(F) / X / Y / Z 축 잠금으로 정밀 이동"),
    ("Deck Filter", "덱별 노드 필터링 (All Decks / 특정 덱)"),
    ("Multi-Select", "Shift+클릭 다중 선택 → 일괄 삭제/복사"),
    ("Node Properties", "이름, 덱, 구조물, 타입, 좌표(X/Y/Z), 링크 길이 편집"),
    ("Connection Mgmt", "양방향 Relation 자동 관리, 중복 방지, 삭제 시 정리"),
    ("Auto Save", "노드 변경 → ProjectContext → D1 자동 저장"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 11. ADVANCED
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("11. Advanced Features", sH1))
story.append(hr())

story.append(Paragraph("11-1. Drum Manager (드럼 관리)", sH2))
story.append(Paragraph("케이블 드럼 절단 최적화. 낭비 최소화 알고리즘.", sBody))

story.append(Paragraph("11-2. Deck Quantity (데크별 물량)", sH2))
story.append(Paragraph("데크/구역별 케이블 수량·길이 집계. 시공 계획 수립 지원.", sBody))

story.append(Paragraph("11-3. Bottleneck Analyzer (병목 분석)", sH2))
story.append(Paragraph("자동 부하 분산 분석. 과밀 노드 탐지 → 우회 경로 제안.", sBody))

story.append(Paragraph("11-4. Path Validator (경로 검증)", sH2))
story.append(Paragraph(
    "BFS 기반 노드 연결성 검사 + 6종 경로 이슈 자동 탐지.", sBody))
story.append(feature_table([
    ("missing_from_node", "FROM 노드가 노드 목록에 없음"),
    ("missing_to_node", "TO 노드가 노드 목록에 없음"),
    ("broken_link", "경로 내 연속 노드 간 연결(Relation) 없음"),
    ("disconnected", "FROM/TO 노드가 서로 다른 연결 그룹에 속함"),
    ("missing_path_node", "경로에 포함된 노드가 존재하지 않음"),
    ("no_path", "FROM/TO 노드는 있으나 계산된 경로 없음"),
]))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# 12. TECH SPECS
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("12. Technical Specifications", sH1))
story.append(hr())
story.append(feature_table([
    ("Frontend", "React 18 + TypeScript + Vite 6"),
    ("3D Engine", "Three.js + @react-three/fiber + drei"),
    ("Styling", "TailwindCSS (CDN)"),
    ("Backend", "Cloudflare Pages Functions (Edge Workers)"),
    ("Database", "Cloudflare D1 (SQLite Edge)"),
    ("Auth", "Google / Kakao / Naver SSO + Guest Code"),
    ("Deploy", "Cloudflare Pages (Global CDN, <50ms latency)"),
    ("Cable Type DB", "349 types hardcoded (JIS/IEC marine cables)"),
    ("Solver", "Gravity-based physics simulation, O(n2) per tier"),
    ("Router", "BFS + Weighted Dijkstra with load penalty"),
    ("Export", "CSV, DXF, JSON, Excel"),
    ("Domain", "scm.seastar.work (HTTPS, HSTS)"),
]))
story.append(Spacer(1, 10*mm))
story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=5*mm))
story.append(Paragraph("SEASTAR Corp. | World Shipbuilding & Offshore Design Provider",
    ParagraphStyle('End', fontName=FONT_BOLD, fontSize=10, textColor=NAVY, alignment=TA_CENTER)))
story.append(Paragraph("https://scm.seastar.work | designsir@naver.com",
    ParagraphStyle('EndURL', fontName=FONT, fontSize=9, textColor=BLUE, alignment=TA_CENTER)))

# ─── Build ───────────────────────────────────────────────────────────────────
doc.build(story)
print(f"PDF generated: {output_path}")
print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")
