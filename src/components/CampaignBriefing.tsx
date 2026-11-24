import React, { useState } from 'react';
import { MECH_ROSTER } from '../game/mechRoster';
import { CAMPAIGN_MISSIONS } from '../game/missions';
import { MechClassId } from '../game/types';

interface CampaignBriefingProps {
  completedMissions: number[];
  selectedUnit: MechClassId;
  onDeployMission: (missionId: number) => void;
  onOpenHangar: () => void;
  onClose: () => void;
}

export const CampaignBriefing: React.FC<CampaignBriefingProps> = ({
  completedMissions,
  selectedUnit,
  onDeployMission,
  onOpenHangar,
  onClose,
}) => {
  const [selectedMissionId, setSelectedMissionId] = useState<number>(1);
  const mission = CAMPAIGN_MISSIONS.find((m) => m.id === selectedMissionId) ?? CAMPAIGN_MISSIONS[0];
  const playerUnit = MECH_ROSTER[selectedUnit];

  return (
    <div className="fixed inset-0 z-30 bg-[#0b0e12] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">Campaign Operations</h2>
          <p className="text-xs text-slate-400">Wardog Squadron · Autonomous Frontline Conflict</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-sm cursor-pointer"
        >
          Back to Menu
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        {/* Left Mission List */}
        <div className="md:col-span-4 border-r border-slate-800 p-5 space-y-2.5 overflow-y-auto">
          {CAMPAIGN_MISSIONS.map((m) => {
            const done = completedMissions.includes(m.id);
            const active = selectedMissionId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMissionId(m.id)}
                className={`w-full p-4 rounded-sm border text-left cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#1a222d] border-amber-400'
                    : 'bg-[#12161d] border-slate-800 hover:bg-[#171d26]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-amber-400">{m.code}</span>
                  <span className={done ? 'text-emerald-400' : 'text-slate-400'}>
                    {done ? 'CLEARED' : `+${m.rewardCredits} CR`}
                  </span>
                </div>
                <div className="text-base font-semibold text-slate-100 mt-1">{m.title}</div>
                <div className="text-xs text-slate-400 mt-1 line-clamp-2">{m.objectivesSummary}</div>
              </button>
            );
          })}
        </div>

        {/* Right Mission Briefing */}
        <div className="md:col-span-8 p-8 flex flex-col justify-between overflow-y-auto">
          <div className="max-w-2xl space-y-6">
            <div>
              <div className="text-xs font-mono-tabular text-amber-400">{mission.code} · Tactical Briefing</div>
              <h3 className="font-display text-4xl font-bold text-slate-100 mt-1">{mission.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed mt-3">{mission.briefing}</p>
            </div>

            <div className="border-y border-slate-800 py-4 space-y-3">
              <div className="text-xs font-mono-tabular text-slate-400">Pilot Radio Log</div>
              {mission.dialogue.map((line, i) => (
                <div key={i} className="text-sm text-slate-200">
                  <span className="text-amber-400 font-semibold">{line.speaker}</span>{' '}
                  <span className="text-xs text-slate-500">({line.role})</span>: &ldquo;{line.text}&rdquo;
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-[#12161d] border border-slate-800 rounded-sm">
                <div className="text-slate-400 font-mono-tabular">Assigned Squad</div>
                <div className="mt-1.5 space-y-1 text-slate-200">
                  <div>Wardog-1 (You): {playerUnit.name}</div>
                  {mission.allies.map((a, idx) => (
                    <div key={idx}>
                      {a.callsign}: {MECH_ROSTER[a.classId].name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3.5 bg-[#12161d] border border-slate-800 rounded-sm">
                <div className="text-slate-400 font-mono-tabular">Mission Rewards</div>
                <div className="mt-1.5 space-y-1 text-slate-200">
                  <div>{mission.rewardCredits} Credits</div>
                  {mission.unlockUnit && (
                    <div className="text-emerald-400">
                      Unlocks {MECH_ROSTER[mission.unlockUnit].name}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-6 mt-6 border-t border-slate-800 max-w-2xl">
            <button
              type="button"
              data-start="true"
              onClick={() => onDeployMission(mission.id)}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-sm cursor-pointer"
            >
              Launch Operation
            </button>
            <button
              type="button"
              onClick={onOpenHangar}
              className="px-5 py-3 bg-[#171d26] hover:bg-slate-800 border border-slate-700 text-slate-100 text-sm font-medium rounded-sm cursor-pointer"
            >
              Change Chassis ({playerUnit.code})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
