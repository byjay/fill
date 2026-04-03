# SCMS_V1 — SEASTAR Cable Manager System

## Tech Stack
- React 18 + TypeScript + Vite 6
- Cloudflare Pages + D1 Database
- TailwindCSS (CDN)
- Three.js + @react-three/fiber (3D View)

## Deploy
```bash
npx vite build
npx wrangler pages deploy dist --project-name fill --branch main
```
- Production: `*.fill-1sg.pages.dev`
- Project name: `fill` (NOT scms-v1)

## Rollback Points
```bash
# Tray Fill + Cable Type DB + BOM 전체 롤백
git checkout bbcf992 -- services/solver.ts components/TrayFillTab.tsx components/TrayVisualizer.tsx
# BomAdvTab 롤백 (코밍/태그/그랜드 이전)
git log --oneline  # cde193d 이전 커밋 참조
```

## Key Files
| File | Role |
|------|------|
| `App.tsx` | Main router, state, Excel parsing, NODE_COLUMNS |
| `data/defaultCableTypes.ts` | 349개 케이블타입 하드코딩 DB |
| `components/BomAdvTab.tsx` | BOM 6탭: 터미널/트레이/발주/코밍/네임태그/그랜드 |
| `components/TrayFillTab.tsx` | Tray Fill 9단, 듀얼 레이아웃, TRAY TYPE 팝업 |
| `components/TrayVisualizer.tsx` | SVG 트레이 시각화, compact/details 모드 |
| `services/solver.ts` | 물리 기반 케이블 배치 솔버, 9단 매트릭스 |
| `components/VoltageDropTab.tsx` | 전압강하 + IEC 허용전류 100%/85% |
| `contexts/ProjectContext.tsx` | 프로젝트 CRUD + localStorage persistence |
| `.env.local` | VITE_GUEST_PASSWORD, NAVER/KAKAO keys |

## Cable Type DB
- 349개 타입, `data/defaultCableTypes.ts` 하드코딩
- localStorage `scms_cable_type_data`에 저장된 값 우선 사용
- 없으면 DEFAULT_CABLE_TYPE_DB 자동 로드
- Excel 업로드로 갱신 가능 (CableTypeTab)

## BOM System (BomAdvTab.tsx)
1. **터미널 BOM**: terminalCore 파싱 → 페룰(0.5-6mm²)/링단자(10mm²↑), CABLE_CORE_MAP 56종
2. **트레이 BOM**: 경로 세그먼트별 트레이 폭/길이
3. **발주 BOM**: 타입별 총길이 + 5% 여유 + 중량
4. **코밍 BOM**: CBP/CBC 10종, E/R+C/H→COMPOUND, ACC→MANGANA, 충전율 35%
5. **네임태그 BOM**: FROM/TO 2개 + CTYPE 코밍 토글
6. **그랜드 BOM**: JIS OSCG Type, 장비별 OD→D 매칭, 46종 gland spec

## Tray Fill System
- 9단(L1-L9) × 8폭(200-900mm) 지원
- TRAY TYPE 명명: L{A-I}{2-9} (예: LA4 = 1단×400mm)
- 물리 기반 중력 시뮬레이션 배치
- 듀얼 레이아웃: 최적 2개 설정 동시 비교
- Matrix/Summary: Details 버튼 토글
- TRAY TYPE 팝업: 72셀 참조표, 클릭 전환

## Login & Auth
- Google, Kakao, Naver 소셜 로그인
- 게스트 로그인: VITE_GUEST_PASSWORD
- 세션 유지: localStorage `scms_user_session` + `scms_last_project_id`
- Admin: `admin_user` ID, D1 admin 테이블

## Important Notes
- `wrangler` deploy시 `--project-name fill` 필수
- Excel 파싱: NODE_COLUMNS에 x/y/z/deck 추가 시 3D 좌표 모드 활성화
- TS70 케이블타입 OD=38.6 (원본 386은 오타 수정됨)
- `cd /d E:\...` 형태 사용 (Windows 드라이브 변경)
