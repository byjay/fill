# TRAY FILL 강화 계획서 — 9단 확장 + 듀얼 레이아웃 + TRAY TYPE

## 1. 현재 상태 분석

### 현재 제약사항
| 항목 | 현재 | 목표 |
|------|------|------|
| UI 단수 선택 | L1~L5 (5단) | L1~L9 (9단) |
| 매트릭스 단수 | 1~6 | 1~9 |
| 트레이 폭 | 200~900mm (8종) | 동일 유지 |
| 레이아웃 | 단일 시각화 | 듀얼 비교 시각화 |
| Matrix/Summary | 항상 표시 | 토글 버튼으로 제어 |
| TRAY TYPE 참조표 | 없음 | 팝업 테이블 추가 |

### 수정 대상 파일 (3개)
1. `services/solver.ts` — 매트릭스 계산 범위 확장
2. `components/TrayFillTab.tsx` — UI 레이아웃 + 9단 + 듀얼 모드
3. `components/TrayVisualizer.tsx` — compact 모드 + 토글 + 타입 라벨

---

## 2. TRAY TYPE 명명 체계

```
   Width →  200   300   400   500   600   700   800   900
Tier ↓
  1단(A)    LA2   LA3   LA4   LA5   LA6   LA7   LA8   LA9
  2단(B)    LB2   LB3   LB4   LB5   LB6   LB7   LB8   LB9
  3단(C)    LC2   LC3   LC4   LC5   LC6   LC7   LC8   LC9
  4단(D)    LD2   LD3   LD4   LD5   LD6   LD7   LD8   LD9
  5단(E)    LE2   LE3   LE4   LE5   LE6   LE7   LE8   LE9
  6단(F)    LF2   LF3   LF4   LF5   LF6   LF7   LF8   LF9
  7단(G)    LG2   LG3   LG4   LG5   LG6   LG7   LG8   LG9
  8단(H)    LH2   LH3   LH4   LH5   LH6   LH7   LH8   LH9
  9단(I)    LI2   LI3   LI4   LI5   LI6   LI7   LI8   LI9
```

TRAY AREA = Width × 48mm (내부 높이 48mm 기준)
- 예: LA2 = 200 × 48 = 9,600 mm²
- 예: LC5 = 500 × 48 = 24,000 mm²

코드:
```typescript
function getTrayTypeName(tiers: number, width: number): string {
  const letters = 'ABCDEFGHI';
  return `L${letters[tiers - 1]}${width / 100}`;
}
```

---

## 3. 수정 상세

### 3-1. solver.ts 수정 (1곳만)

**변경 내용**: `calculateOptimizationMatrix`의 tierCounts 배열 확장

```diff
- const tierCounts = [1, 2, 3, 4, 5, 6];
+ const tierCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9];
```

**영향 범위**:
- 매트릭스가 6×8 → 9×8로 확대 (48셀 → 72셀)
- `solveSystem`, `solveSystemAtWidth`는 변경 없음 (이미 임의 tier 수 지원)
- 계산 시간 약 50% 증가 (but 원래도 빠른 편)
- `attemptFit` 물리 시뮬레이션은 변경 없음

**위험도**: ⬇ 매우 낮음 (배열 확장만)

---

### 3-2. TrayVisualizer.tsx 수정

**3-2a. Props 확장**
```typescript
interface TrayVisualizerProps {
  // 기존 props 유지
  compact?: boolean;      // 컴팩트 모드: 사이드바·매트릭스 숨김
  trayTypeLabel?: string; // "LA4", "LB2" 등
  showDetails?: boolean;  // Summary/Matrix 표시 여부
}
```

**3-2b. 컴팩트 모드 변경사항**
| 요소 | compact=false (기본) | compact=true |
|------|---------------------|--------------|
| Status Header | 풀사이즈 | 축소 (1줄) |
| Tier Summary 패널 | showDetails 따라 | 숨김 |
| SVG 시각화 | 풀사이즈 | 풀사이즈 (유지) |
| Matrix 테이블 | showDetails 따라 | 숨김 |
| Cable Index 사이드바 | 표시 | 숨김 |
| Tray Type 라벨 | - | 헤더에 표시 |
| Export 버튼 | 표시 | 숨김 |

**3-2c. showDetails 토글**
- Summary 패널 (Tier L1~LN Summary): showDetails=true일 때만 표시
- Matrix 테이블: showDetails=true일 때만 표시
- compact=true이면 showDetails 무시 (항상 숨김)

**3-2d. Tray Type 라벨 표시**
- Status Header에 `trayTypeLabel` prop 값 표시
- 예: `"LA4 (W400 × L1)"` → 큰 글씨로 표시

**위험도**: ⬇ 낮음 (기존 기능에 조건부 렌더만 추가)

---

### 3-3. TrayFillTab.tsx 수정

**3-3a. 단수 선택 UI 확장**
```diff
- {[1, 2, 3, 4, 5].map(t => (
+ {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => (
```
버튼 크기 자동 조정 (flex-1 유지)

**3-3b. 새 State 추가**
```typescript
const [showDetails, setShowDetails] = useState(false);
const [showTraySpec, setShowTraySpec] = useState(false);
```

**3-3c. 듀얼 최적 설정 자동 탐색**

매트릭스에서 최적(isOptimal=true) 셀 2개 자동 선택:

```typescript
const dualConfigs = useMemo(() => {
  if (!systemResult?.optimizationMatrix) return null;

  // 1. 모든 optimal 셀 수집
  const allOptimal: MatrixCell[] = [];
  for (const row of systemResult.optimizationMatrix) {
    for (const cell of row) {
      if (cell.isOptimal) allOptimal.push(cell);
    }
  }
  if (allOptimal.length === 0) return null;

  // 2. fill ratio 높은 순 정렬 (목표치에 가장 가까운 것)
  allOptimal.sort((a, b) => b.fillRatio - a.fillRatio);

  const primary = allOptimal[0]; // 가장 효율적인 설정

  // 3. 다른 tier 수를 가진 차선책 탐색
  const secondary = allOptimal.find(c => c.tiers !== primary.tiers);

  return { primary, secondary: secondary || null };
}, [systemResult]);
```

선택 기준:
- Primary: fill ratio가 가장 높은 optimal 설정
- Secondary: Primary와 다른 tier 수를 가진 optimal 설정 중 가장 효율적인 것
- 예: Primary = LC4 (3단×400mm, 38.2%), Secondary = LB6 (2단×600mm, 36.1%)

**3-3d. 듀얼 SystemResult 계산**

```typescript
const secondaryResult = useMemo(() => {
  if (!dualConfigs?.secondary) return null;
  const { tiers, width } = dualConfigs.secondary;
  return solveSystemAtWidth(activeCables, tiers, width, maxHeightLimit, fillRatioLimit);
}, [dualConfigs, activeCables, maxHeightLimit, fillRatioLimit]);
```

**3-3e. 듀얼 레이아웃 렌더링**

```
┌────────────┬─────────────────────────────────────┐
│ Node List  │ ┌─ Config A: LA4 (W400×L1) ─────┐  │
│            │ │  [TrayVisualizer compact]       │  │
│            │ └─────────────────────────────────┘  │
│            │ ┌─ Config B: LB2 (W200×L2) ─────┐  │
│            │ │  [TrayVisualizer compact]       │  │
│            │ └─────────────────────────────────┘  │
│            │ [Details ▼]  [TRAY TYPE 📋]         │
├────────────┴─────────────────────────────────────┤
│ Controls: H-limit | Fill% | Tiers L1~L9          │
└──────────────────────────────────────────────────┘
```

- Secondary가 없으면: 기존 단일 시각화 (풀사이즈, compact=false)
- Secondary가 있으면: 듀얼 시각화 (각각 compact=true, 50%씩)

**3-3f. Details 토글 버튼**

컨트롤 바에 추가:
```tsx
<button onClick={() => setShowDetails(v => !v)}>
  {showDetails ? '▲ Details' : '▼ Details'}
</button>
```

클릭 시: Matrix + Summary 패널 표시/숨김

**3-3g. TRAY TYPE 참조표 버튼**

컨트롤 바에 추가:
```tsx
<button onClick={() => setShowTraySpec(v => !v)}>📋 TRAY TYPE</button>
```

클릭 시: 팝업 오버레이로 9단×8폭 TRAY TYPE 테이블 표시
- 각 셀: 타입명 + 면적 표시
- 현재 선택된 설정 하이라이트

**위험도**: ⬇ 중간 — 레이아웃 변경이 있으나 기존 TrayVisualizer는 유지

---

## 4. 케이블 배치 전략 (기존 유지 확인)

현재 `customSortCables`:
1. System 오름차순
2. **OD 내림차순** (큰 케이블 먼저 → 하단 배치 자연 달성)
3. FromNode 오름차순

Round-robin 분배: `tierBuckets[i % numberOfTiers]`
→ 큰 케이블이 먼저 정렬되고 round-robin으로 분배되므로 **큰 케이블이 자연스럽게 하단 tier에 분배됨**

**변경 없음** — 이미 요구사항 충족

---

## 5. 구현 순서 (의존성 순)

```
Step 1: solver.ts (독립, 1분 소요)
  └── tierCounts 배열 확장만

Step 2: TrayVisualizer.tsx (solver 후)
  └── compact prop 추가
  └── showDetails/trayTypeLabel 지원
  └── 조건부 렌더링

Step 3: TrayFillTab.tsx (Step 1,2 후)
  └── 9단 UI
  └── 듀얼 설정 계산
  └── 듀얼 레이아웃
  └── Details 토글
  └── TRAY TYPE 테이블
```

---

## 6. 롤백 전략

```bash
# 복원점 커밋 생성 완료:
git log --oneline -1
# bbcf992 checkpoint: before tray fill enhancement + cable type DB hardcoding

# 문제 발생 시:
git stash  # 현재 변경사항 저장
git checkout bbcf992 -- services/solver.ts components/TrayFillTab.tsx components/TrayVisualizer.tsx
```

---

## 7. Node List TRAY TYPE 반영

사전계산 완료 후 노드 리스트에 TRAY TYPE명 표시:

```
기존: ▶ 400mm (38.2% fill)
변경: ▶ LA4 400mm (38.2% fill)
```

`TrayFillTab.tsx`의 노드 리스트 렌더링에서:
- `preCalc.recommendedWidth` → `getTrayTypeName(1, width)` 호출하여 라벨 추가
- 사전계산은 1단(tier=1) 기준이므로 항상 `LA{width/100}` 형태

---

## 8. 검증 체크리스트

- [ ] L1~L9 버튼 모두 정상 작동
- [ ] Matrix 테이블이 9×8 (9단×8폭)으로 표시
- [ ] Matrix/Summary가 기본 숨김, Details 버튼으로 토글
- [ ] 듀얼 레이아웃에서 두 설정 동시 표시
- [ ] 각 시각화에 TRAY TYPE 라벨 표시 (예: LA4, LB2)
- [ ] TRAY TYPE 버튼 클릭 시 참조표 팝업
- [ ] 큰 케이블이 하단 tier에 배치됨 확인
- [ ] 기존 DXF 내보내기 정상 작동
- [ ] 기존 Matrix 셀 클릭 → 설정 변경 정상 작동
- [ ] 빌드 에러 없음
- [ ] 배포 성공
