import { useEffect, useRef, useState } from 'react';
import { BossChallengeModal } from './components/BossChallengeModal';
import { CampaignBriefing } from './components/CampaignBriefing';
import { HudOverlay } from './components/HudOverlay';
import { MainMenu } from './components/MainMenu';
import { GameOverModal, PauseModal } from './components/PauseGameOverModal';
import { SettingsModal } from './components/SettingsModal';
import { SkirmishSetup } from './components/SkirmishSetup';
import { UnitHangar } from './components/UnitHangar';
import { GameEngine } from './game/engine';
import { CAMPAIGN_MISSIONS } from './game/missions';
import { loadSaveData, persistSaveData } from './game/storage';
import { AppScreen, HudSnapshot, MechClassId, MechLoadoutCustomization, SaveData, SettingsData, UpgradeId } from './game/types';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [save, setSave] = useState<SaveData>(() => loadSaveData());
  const [muted, setMuted] = useState(false);
  const [returnScreenAfterSettings, setReturnScreenAfterSettings] = useState<AppScreen>('title');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas, (snap) => {
      setHud(snap);
    });
    engineRef.current = engine;
    engine.pushHudSnapshot();
    engine.start();

    // Support ?autostart=1 to jump directly into active gameplay for automated verification
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startCampaignMission(1);
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const syncSave = (next: SaveData) => {
    persistSaveData(next);
    setSave({ ...next });
    if (engineRef.current) {
      engineRef.current.applySettings(next.settings);
    }
  };

  const screen: AppScreen = hud?.screen ?? 'title';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0b0e12]">
      {/* Isolated Full-Viewport Simulation Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        className="block w-full h-full"
      />

      {/* Title Screen */}
      {screen === 'title' && (
        <MainMenu
          selectedUnit={save.selectedUnit}
          credits={save.credits}
          completedMissions={save.completedMissions}
          highestWave={save.highestSurvivalWave}
          onQuickDeploy={() => engineRef.current?.startCampaignMission(1)}
          onOpenCampaign={() => engineRef.current?.setScreen('briefing')}
          onOpenBossChallenge={() => engineRef.current?.setScreen('boss_setup')}
          onOpenSkirmish={() => engineRef.current?.setScreen('skirmish_setup')}
          onStartSurvival={() => engineRef.current?.startSurvival()}
          onStartTraining={() => engineRef.current?.startTraining()}
          onStartFreeRoam={() => engineRef.current?.startFreeRoam('grassland')}
          onOpenHangar={() => engineRef.current?.setScreen('hangar')}
          onOpenSettings={() => {
            setReturnScreenAfterSettings('title');
            engineRef.current?.setScreen('settings');
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {screen === 'playing' && hud && (
        <HudOverlay
          hud={hud}
          muted={muted}
          onToggleMute={() => {
            const eng = engineRef.current;
            if (!eng) return;
            const next = !eng.audio.isMuted();
            eng.audio.setMuted(next);
            setMuted(next);
          }}
          onPause={() => engineRef.current?.setScreen('paused')}
          onRestart={() => engineRef.current?.restartCurrentMode()}
          onSelectWeapon={(slot) => {
            if (engineRef.current) {
              engineRef.current.player.activeSlot = slot;
              engineRef.current.pushHudSnapshot();
            }
          }}
          onSelectMortarAmmo={(ammo) => engineRef.current?.setPlayerMortarAmmo(ammo)}
          onActivateSpecial={() => {
            if (engineRef.current) {
              engineRef.current.activateSpecialAbility(engineRef.current.player);
            }
          }}
          onTriggerDash={() => engineRef.current?.triggerPlayerDash()}
          onTriggerGrapple={() => engineRef.current?.triggerPlayerGrapple()}
          onToggleStealth={() => engineRef.current?.triggerPlayerStealth()}
          onSetDodgeTarget={(normX) => engineRef.current?.setPlayerDodgeTarget(normX)}
          onTriggerDodgeDash={(dir) => engineRef.current?.submitPlayerTakedownTiming(dir)}
          onIssueOrder={(order) => engineRef.current?.issueSquadOrder(order)}
          onCloseTactical={() => {
            if (engineRef.current) {
              engineRef.current.setScreen('playing');
            }
          }}
          onTrainingDamageLimb={() => engineRef.current?.triggerTrainingLimbDamage()}
          onTrainingRepair={() => engineRef.current?.repairTrainingPlayer()}
          onTrainingToggleGod={() => engineRef.current?.toggleTrainingGodMode()}
          onTrainingTriggerUltimate={() => engineRef.current?.triggerTrainingBossUltimate()}
          onSandboxSpawn={(entryId, count, team, behavior) =>
            engineRef.current?.sandboxSpawnEntry(entryId, count, team, behavior)
          }
          onSandboxRemoveLast={() => engineRef.current?.sandboxRemoveLast()}
          onSandboxClearAll={() => engineRef.current?.sandboxClearAll()}
          onSandboxReset={() => engineRef.current?.sandboxResetEnvironment()}
          onSandboxTogglePause={() => engineRef.current?.sandboxToggleSimPause()}
          onSandboxToggleInfiniteAmmo={() => engineRef.current?.sandboxToggleInfiniteAmmo()}
          onSandboxSetBehavior={(behavior) => engineRef.current?.sandboxSetBehavior(behavior)}
          onSandboxSetTuning={(partial) => engineRef.current?.sandboxSetTuning(partial)}
          onSkipVictory={() => engineRef.current?.skipVictoryCinematic()}
          onCompleteVictory={() => engineRef.current?.completeVictoryCinematic()}
          onOpenTransformSelector={() => engineRef.current?.openTransformSelector()}
          onSelectTransformTarget={(id) => engineRef.current?.selectPlayerTransformTarget(id)}
          onCloseTransformSelector={() => engineRef.current?.closeTransformSelector()}
        />
      )}

      {/* Unit Selection & Customization Hangar */}
      {screen === 'hangar' && (
        <UnitHangar
          save={save}
          onSelectUnit={(id: MechClassId) => {
            syncSave({ ...save, selectedUnit: id });
          }}
          onUnlockUnit={(id: MechClassId, cost: number) => {
            if (save.credits < cost || save.unlockedUnits.includes(id)) return;
            syncSave({
              ...save,
              credits: save.credits - cost,
              unlockedUnits: [...save.unlockedUnits, id],
              selectedUnit: id,
            });
          }}
          onUpdateCustomization={(id: MechClassId, custom: MechLoadoutCustomization) => {
            syncSave({
              ...save,
              customLoadouts: { ...save.customLoadouts, [id]: custom },
            });
          }}
          onPurchaseUpgrade={(id: MechClassId, upId: UpgradeId, cost: number) => {
            if (save.credits < cost) return;
            const prev = save.customLoadouts[id] ?? {
              upgrades: {},
              paintId: 'spearhead',
              weaponVariant: 'standard',
              armorPackage: 'standard',
              supportModule: 'none',
            };
            const curLvl = prev.upgrades[upId] ?? 0;
            syncSave({
              ...save,
              credits: save.credits - cost,
              customLoadouts: {
                ...save.customLoadouts,
                [id]: {
                  ...prev,
                  upgrades: { ...prev.upgrades, [upId]: curLvl + 1 },
                },
              },
            });
          }}
          onTestInTraining={(id: MechClassId) => {
            if (save.unlockedUnits.includes(id)) {
              syncSave({ ...save, selectedUnit: id });
            }
            engineRef.current?.startTraining(id);
          }}
          onClose={() => engineRef.current?.setScreen('title')}
        />
      )}

      {/* Campaign Mission Briefing */}
      {screen === 'briefing' && (
        <CampaignBriefing
          completedMissions={save.completedMissions}
          selectedUnit={save.selectedUnit}
          onDeployMission={(missionId) => engineRef.current?.startCampaignMission(missionId)}
          onOpenHangar={() => engineRef.current?.setScreen('hangar')}
          onClose={() => engineRef.current?.setScreen('title')}
        />
      )}

      {/* Skirmish Setup */}
      {screen === 'skirmish_setup' && (
        <SkirmishSetup
          defaultUnit={save.selectedUnit}
          unlockedUnits={save.unlockedUnits}
          onLaunch={(cfg) => engineRef.current?.startSkirmish(cfg)}
          onClose={() => engineRef.current?.setScreen('title')}
        />
      )}

      {/* Boss Challenge Setup */}
      {screen === 'boss_setup' && (
        <BossChallengeModal
          defaultUnit={save.selectedUnit}
          unlockedUnits={save.unlockedUnits}
          onLaunch={(cfg) => engineRef.current?.startBossChallenge(cfg)}
          onClose={() => engineRef.current?.setScreen('title')}
        />
      )}

      {/* Settings & Remapping */}
      {screen === 'settings' && (
        <SettingsModal
          settings={save.settings}
          onSave={(nextSettings: SettingsData) => {
            syncSave({ ...save, settings: nextSettings });
          }}
          onClose={() => engineRef.current?.setScreen(returnScreenAfterSettings)}
        />
      )}

      {/* Pause Modal */}
      {screen === 'paused' && (
        <PauseModal
          onResume={() => engineRef.current?.setScreen('playing')}
          onRestart={() => engineRef.current?.restartCurrentMode()}
          onOpenSettings={() => {
            setReturnScreenAfterSettings('paused');
            engineRef.current?.setScreen('settings');
          }}
          onReturnToMenu={() => engineRef.current?.setScreen('title')}
        />
      )}

      {/* Victory / Game Over Modal */}
      {screen === 'gameover' && hud && (
        <GameOverModal
          hud={hud}
          onPlayAgain={() => engineRef.current?.restartCurrentMode()}
          onNextMission={
            hud.mode === 'campaign'
              ? (() => {
                  const curIdx = CAMPAIGN_MISSIONS.findIndex((m) => m.title && hud.missionTitle.includes(m.title));
                  const nextM = curIdx >= 0 && curIdx + 1 < CAMPAIGN_MISSIONS.length ? CAMPAIGN_MISSIONS[curIdx + 1] : null;
                  return nextM ? () => engineRef.current?.startCampaignMission(nextM.id) : undefined;
                })()
              : undefined
          }
          onReturnToMenu={() => engineRef.current?.setScreen('title')}
        />
      )}
    </div>
  );
}
