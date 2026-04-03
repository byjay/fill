# SCMS Changelog — Version History

## v3.5.0 (2026-04-03) — BOM Overhaul + Node System + Tray Fill 9-Tier

### 🆕 New Features
- **Cable Gland BOM**: JIS OSCG 46종, 장비별 OD→D 매칭, 장비 그룹핑 UI
- **Cable Band/Tie BOM**: 30% Band + 70% Tie, 12종 타입 자동 분배
- **Name Tag BOM**: FROM/TO 2개 + CTYPE 코밍 통과 시 +2개 추가
- **Coaming BOM**: KP/KC/CBP/CBC 51종 전체, Excel 공식 반영
- **Node Editor (KaveRouter)**: 2D 캔버스 노드 생성/이동/연결/삭제 + DXF 배경
- **Path Validator**: BFS 연결성 검사, 6종 경로 이슈 탐지
- **NodeCheckPanel**: 검증 결과 KPI + 이슈 테이블 + CSV 내보내기
- **RPG 스타일 매뉴얼**: /manual.html 인터랙티브 HTML 매뉴얼
- **Manual 버튼**: 헤더에 📖 Manual 버튼 추가
- **PDF 매뉴얼**: docs/SCMS_Manual_v1.pdf 자동 생성

### 🔧 Enhancements
- **Tray Fill 9단 확장**: L1~L9 (기존 L1~L5)
- **Tray Fill 듀얼 레이아웃**: 좌우 가로 분할, 등가 면적 매칭
- **Tray Fill 표준 폭 제한**: 200~900mm만 허용 (100/1000 제거)
- **TRAY TYPE 팝업**: 72셀 참조표, 클릭 전환
- **Details 토글**: Matrix/Summary 숨김/표시
- **Fill 진입 확인 팝업**: 계산 시간 안내 + 백그라운드 계산 옵션
- **Terminal BOM**: terminalEa DB값 우선 사용 (정확한 코어수)
- **Cable Type DB**: 349종 하드코딩 (data/defaultCableTypes.ts)
- **고급 메뉴 연결**: 8개 고급 탭 전체 App.tsx 통합

### 🐛 Bug Fixes
- **Admin Google 로그인**: admin 계정 → admin 화면 직행 (projects 화면 아님)
- **Login 모바일 고정**: max-w-430px 중앙 정렬 (데스크톱에서도 모바일 UI)
- **cableTypeData 참조 에러**: TopToolbar에 prop 전달 누락 수정
- **3D 케이블 라인**: fromNode→toNode fallback 직선 연결 추가
- **Tray Fill 비표준 폭**: W100/W1000 제거, 200~900mm만 사용

### 🔨 Drum Manager
- **OD 기반 조장**: OD<30mm→1000m, OD≥30mm→500m
- **4단계 그룹핑**: TYPE → SYSTEM → FROM → TO
- **타입별 조장 편집 테이블**: 프로젝트 내 타입만 필터링, 편집 가능

---

## v3.4.0 (2026-04-02) — Login Persistence + VoltageDropTab + Terminal BOM

### 🆕 New Features
- **VoltageDropTab**: IEC 60092 전압강하 + Iz 허용전류 100%/85% 디레이팅
- **Terminal BOM**: 페룰(0.5-6mm²) + 링단자(10mm²↑), 56종 코어맵
- **Guest Password**: .env.local VITE_GUEST_PASSWORD 환경변수

### 🐛 Bug Fixes
- **Login Persistence**: localStorage scms_last_project_id + isLoading guard
- **Conductor Parsing**: terminalCore 기반 도체 mm² (crossSection 아님)

---

## v3.3.0 (2026-04-01) — Initial Cloud Deploy

### 🆕 New Features
- Cloudflare Pages + D1 Database 배포
- Google/Kakao/Naver SSO 로그인
- 프로젝트 CRUD (D1 기반)
- Admin Panel (사용자/승인 관리)
- Dashboard, Cable List, Node Info, BOM, Routing, Tray Fill, 3D View
- Smart Router (Dijkstra + Load Balancing)
- Analysis, History, Cable Type tabs
