import React from 'react';
import * as XLSX from 'xlsx';
import { useProject } from '../contexts/ProjectContext';
import { Download, FileJson, Save, Clock, Ship, Cable } from 'lucide-react';

interface ProjectTabProps {
  onExportCableList: () => void;
  onExportNodeInfo: () => void;
  onJsonSave: () => void;
}

export default function ProjectTab({ onExportCableList, onExportNodeInfo, onJsonSave }: ProjectTabProps) {
  const { currentProject, saveCurrentProject } = useProject();
  if (!currentProject) return null;

  const cables = currentProject.cables;
  const nodes = currentProject.nodes;
  const history = currentProject.history;

  const totalLength = cables.reduce((s, c) => s + (c.calculatedLength || c.length || 0), 0);
  const routedCount = cables.filter(c => c.calculatedPath).length;

  const handleExportExcel = () => {
    const rows = cables.map(c => ({
      SYSTEM: c.system || '',
      WD_PAGE: c.wdPage || '',
      CABLE_NAME: c.name,
      CABLE_TYPE: c.type,
      FROM_ROOM: c.fromRoom || '',
      FROM_EQUIP: c.fromEquip || '',
      FROM_NODE: c.fromNode || '',
      FROM_REST: c.fromRest || 0,
      TO_ROOM: c.toRoom || '',
      TO_EQUIP: c.toEquip || '',
      TO_NODE: c.toNode || '',
      TO_REST: c.toRest || 0,
      LENGTH: +(c.calculatedLength || c.length || 0).toFixed(1),
      PATH: c.calculatedPath || c.path || '',
      OD: c.od || 0,
      CHECK_NODE: c.checkNode || '',
      SUPPLY_DECK: c.supplyDeck || '',
      POR_WEIGHT: c.porWeight || 0,
      REMARK: c.remark || '',
      REVISION: c.revision || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cable List');
    XLSX.writeFile(wb, `${currentProject.vesselNo || currentProject.name}_cables.xlsx`);
  };

  const actionLabel: Record<string, string> = {
    file_upload: '파일 업로드',
    path_calculation: '경로 계산',
    cable_edit: '케이블 편집',
    manual_save: '수동 저장',
    data_clear: '데이터 초기화',
  };
  const actionColor: Record<string, string> = {
    file_upload: 'text-blue-400',
    path_calculation: 'text-emerald-400',
    cable_edit: 'text-amber-400',
    manual_save: 'text-purple-400',
    data_clear: 'text-red-400',
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 bg-slate-950 text-slate-200">
      {/* Project Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Ship size={16} className="text-blue-400" />
          <h2 className="text-sm font-black text-white">프로젝트 정보</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '호선명', value: currentProject.name },
            { label: '호선번호', value: currentProject.vesselNo || '-' },
            { label: '생성일', value: new Date(currentProject.createdAt).toLocaleDateString('ko-KR') },
            { label: '수정일', value: new Date(currentProject.updatedAt).toLocaleDateString('ko-KR') },
            { label: '케이블', value: `${cables.length}개` },
            { label: '노드', value: `${nodes.length}개` },
            { label: '경로 산출', value: `${routedCount}/${cables.length}` },
            { label: '총 길이', value: `${totalLength.toFixed(1)} m` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800 rounded-lg p-3">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-black text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Download size={16} className="text-emerald-400" />
          <h2 className="text-sm font-black text-white">내보내기</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <Download size={13} /> Excel (케이블)
          </button>
          <button
            onClick={onExportCableList}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <Download size={13} /> CSV (케이블)
          </button>
          <button
            onClick={onExportNodeInfo}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <Download size={13} /> CSV (노드)
          </button>
          <button
            onClick={onJsonSave}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <FileJson size={13} /> JSON 전체
          </button>
          <button
            onClick={saveCurrentProject}
            className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <Save size={13} /> D1 저장
          </button>
        </div>
      </div>

      {/* History */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-purple-400" />
          <h2 className="text-sm font-black text-white">작업 히스토리</h2>
          <span className="text-[10px] text-slate-500 ml-1">최근 {Math.min(history.length, 50)}건</span>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">아직 기록이 없습니다</p>
        ) : (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-1.5 px-2 text-slate-500 font-bold uppercase text-[9px] w-40">시각</th>
                  <th className="text-left py-1.5 px-2 text-slate-500 font-bold uppercase text-[9px] w-24">유형</th>
                  <th className="text-left py-1.5 px-2 text-slate-500 font-bold uppercase text-[9px]">설명</th>
                  <th className="text-right py-1.5 px-2 text-slate-500 font-bold uppercase text-[9px] w-16">케이블</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0, 50).map(e => (
                  <tr key={e.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="py-1 px-2 text-slate-500 text-[10px]">
                      {new Date(e.timestamp).toLocaleString('ko-KR')}
                    </td>
                    <td className={`py-1 px-2 font-bold text-[10px] ${actionColor[e.action] ?? 'text-slate-400'}`}>
                      {actionLabel[e.action] ?? e.action}
                    </td>
                    <td className="py-1 px-2 text-[10px]">{e.description}</td>
                    <td className="py-1 px-2 text-right text-blue-400 text-[10px]">
                      {e.cableCount ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
