/**
 * AdvancedMenuDropdown — 추가 기능 드롭다운 메뉴 3개
 * Portal 기반으로 overflow 클리핑 문제 해결
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  ChevronDown, Shield, Zap, BarChart3, AlertTriangle,
  Package, Drum, Layers, FileText, Map, Cpu,
} from 'lucide-react';

export type AdvancedTab =
  | 'interference'
  | 'voltagedrop'
  | 'classrule'
  | 'bom-adv'
  | 'drum'
  | 'deck-qty'
  | 'bottleneck'
  | 'kave-router';

interface Props {
  onSelect: (tab: AdvancedTab) => void;
  activeTab: AdvancedTab | null;
}

interface MenuGroup {
  label: string;
  icon: React.ReactNode;
  color: string;
  items: { id: AdvancedTab; label: string; icon: React.ReactNode; desc: string }[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: '검증',
    icon: <Shield size={10} />,
    color: 'text-red-400',
    items: [
      { id: 'interference', label: '간섭 체크', icon: <AlertTriangle size={11} />, desc: '파워/시그널 분리, 트레이 과적' },
      { id: 'voltagedrop', label: '전압강하', icon: <Zap size={11} />, desc: 'IEC 60092 기준 전압강하 계산' },
      { id: 'classrule', label: '선급 Rule', icon: <Shield size={11} />, desc: 'DNV/KR/LR 30개 규칙 검증' },
    ],
  },
  {
    label: '물량',
    icon: <Package size={10} />,
    color: 'text-emerald-400',
    items: [
      { id: 'bom-adv', label: 'BOM 상세', icon: <FileText size={11} />, desc: '글랜드/트레이/발주 BOM' },
      { id: 'drum', label: '드럼 관리', icon: <Drum size={11} />, desc: '절단 최적화, 낭비 최소화' },
      { id: 'deck-qty', label: '데크별 물량', icon: <Layers size={11} />, desc: '데크/구역별 케이블 집계' },
    ],
  },
  {
    label: '고급',
    icon: <Cpu size={10} />,
    color: 'text-cyan-400',
    items: [
      { id: 'bottleneck', label: '병목 분석', icon: <BarChart3 size={11} />, desc: '자동 분산, 우회 제안' },
      { id: 'kave-router', label: 'Node Editor', icon: <Map size={11} />, desc: 'DXF 배경 + 노드 에디터' },
    ],
  },
];

interface DropdownPortalProps {
  group: MenuGroup;
  pos: { top: number; left: number };
  activeTab: AdvancedTab | null;
  onSelect: (tab: AdvancedTab) => void;
  onClose: () => void;
}

const DropdownPortal: React.FC<DropdownPortalProps> = ({ group, pos, activeTab, onSelect, onClose }) => {
  return ReactDOM.createPortal(
    <div
      data-adv-dropdown="true"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 99999,
        width: 224,
      }}
      className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden"
    >
      {group.items.map(item => (
        <button
          key={item.id}
          onClick={() => { onSelect(item.id); onClose(); }}
          className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors ${
            activeTab === item.id
              ? 'bg-blue-600/20 text-white'
              : 'text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className={`mt-0.5 ${group.color}`}>{item.icon}</span>
          <div>
            <div className="text-[11px] font-bold">{item.label}</div>
            <div className="text-[9px] text-slate-500">{item.desc}</div>
          </div>
        </button>
      ))}
    </div>,
    document.body
  );
};

export default function AdvancedMenuDropdown({ onSelect, activeTab }: Props) {
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleGroupClick = useCallback((gi: number) => {
    if (openGroup === gi) {
      setOpenGroup(null);
      return;
    }
    const btn = buttonRefs.current[gi];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpenGroup(gi);
  }, [openGroup]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openGroup === null) return;
      const target = e.target as Node;
      // 컨테이너 내부면 무시
      if (containerRef.current?.contains(target)) return;
      // portal dropdown 내부면 무시
      const portals = document.querySelectorAll('[data-adv-dropdown="true"]');
      for (const p of Array.from(portals)) {
        if (p.contains(target)) return;
      }
      setOpenGroup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openGroup]);

  return (
    <div ref={containerRef} className="flex items-center gap-0.5">
      {MENU_GROUPS.map((group, gi) => (
        <div key={group.label} className="relative">
          <button
            ref={el => { buttonRefs.current[gi] = el; }}
            onClick={() => handleGroupClick(gi)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap transition-colors ${
              openGroup === gi || group.items.some(it => it.id === activeTab)
                ? `${group.color} bg-slate-800`
                : 'text-slate-500 hover:text-white hover:bg-slate-800'
            }`}
          >
            {group.icon}
            <span>{group.label}</span>
            <ChevronDown size={9} className={`transition-transform ${openGroup === gi ? 'rotate-180' : ''}`} />
          </button>
        </div>
      ))}

      {/* Portal 기반 드롭다운 */}
      {openGroup !== null && (
        <DropdownPortal
          group={MENU_GROUPS[openGroup]}
          pos={dropdownPos}
          activeTab={activeTab}
          onSelect={onSelect}
          onClose={() => setOpenGroup(null)}
        />
      )}
    </div>
  );
}
