import React, { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, formatKeyCode, shakeLevelToMultiplier } from '../game/storage';
import { CameraShakeLevel, KeyBindings, SettingsData } from '../game/types';

interface SettingsModalProps {
  settings: SettingsData;
  onSave: (next: SettingsData) => void;
  onClose: () => void;
}

const KEYBIND_LABELS: [keyof KeyBindings, string][] = [
  ['moveForward', 'Move Forward'],
  ['moveBackward', 'Move Backward'],
  ['moveLeft', 'Strafe / Turn Left'],
  ['moveRight', 'Strafe / Turn Right'],
  ['sprint', 'Sprint / Rocket Boost'],
  ['dash', 'Dash / Flight Ascend'],
  ['descend', 'Flight Descend'],
  ['grapple', 'Grapple Hook'],
  ['special', 'Special Ability'],
  ['stealth', 'Stealth Cloak (AS-09)'],
  ['reload', 'Reload Weapon'],
  ['interact', 'Training Respawn'],
  ['squadMenu', 'Squad Orders'],
  ['tacticalMap', 'Tactical Overview'],
  ['toggleMinimap', 'Toggle Radar'],
  ['pause', 'Pause Menu'],
];

const SHAKE_LEVELS: { level: CameraShakeLevel; label: string }[] = [
  { level: 'off', label: 'OFF' },
  { level: 'low', label: 'LOW' },
  { level: 'medium', label: 'MEDIUM' },
  { level: 'high', label: 'HIGH' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
  const [draft, setDraft] = useState<SettingsData>(structuredClone(settings));
  const [listeningKey, setListeningKey] = useState<keyof KeyBindings | null>(null);

  useEffect(() => {
    if (!listeningKey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraft((prev) => ({
        ...prev,
        keyBindings: {
          ...prev.keyBindings,
          [listeningKey]: e.code,
        },
      }));
      setListeningKey(null);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [listeningKey]);

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    zeroLabel?: string
  ) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono-tabular">
        <span className="text-slate-300">{label}</span>
        <span className="text-amber-400">
          {zeroLabel && value <= min + 0.001 ? zeroLabel : `${Math.round(value * 100)}%`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-[#07090d]/90 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#11151c] border border-slate-700 rounded-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-display text-2xl font-bold text-slate-100">Settings & Controls</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-sm cursor-pointer"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Audio, Camera & Mobility VFX */}
          <div className="space-y-3">
            <h3 className="font-display text-lg font-semibold text-amber-400">Audio, Camera & VFX</h3>
            {slider('Master Volume', draft.masterVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, masterVolume: v })
            )}
            {slider('Weapons Volume', draft.weaponsVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, weaponsVolume: v })
            )}
            {slider('Explosions Volume', draft.explosionsVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, explosionsVolume: v })
            )}
            {slider('Mechanical & Footsteps', draft.mechanicalVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, mechanicalVolume: v })
            )}
            {slider('Engines & Thrusters', draft.enginesVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, enginesVolume: v })
            )}
            {slider('Environment & Wind', draft.ambienceVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, ambienceVolume: v })
            )}
            {slider('Radio & Alerts', draft.radioVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, radioVolume: v })
            )}
            {slider('UI & Switches', draft.uiVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, uiVolume: v })
            )}
            {slider('Music Volume', draft.musicVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, musicVolume: v })
            )}
            {slider('Master SFX Trim', draft.sfxVolume, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, sfxVolume: v })
            )}
            <button
              type="button"
              data-testid="toggle-dynamic-audio-mix"
              onClick={() => setDraft({ ...draft, dynamicAudioMix: !draft.dynamicAudioMix })}
              className={`w-full px-3 py-1.5 text-xs rounded-sm border flex items-center justify-between cursor-pointer ${
                draft.dynamicAudioMix
                  ? 'bg-[#16221c] border-emerald-500/70 text-emerald-300'
                  : 'bg-[#161b23] border-slate-700 text-slate-400'
              }`}
            >
              <span>Dynamic Combat Audio Ducking</span>
              <span className="font-mono-tabular font-semibold">{draft.dynamicAudioMix ? 'ON' : 'OFF'}</span>
            </button>

            {/* Dedicated 4-level Camera Shake Setting */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300">Camera Shake</span>
                <span className="text-[10px] font-mono-tabular text-slate-400">
                  {draft.cameraShakeLevel === 'off' ? '0% Displacement (Disabled)' : `${Math.round(shakeLevelToMultiplier(draft.cameraShakeLevel) * 100)}%`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Camera Shake Level">
                {SHAKE_LEVELS.map(({ level, label }) => (
                  <button
                    key={level}
                    type="button"
                    data-testid={`shake-level-${level}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        cameraShakeLevel: level,
                        cameraShake: shakeLevelToMultiplier(level),
                      })
                    }
                    className={`py-1.5 text-xs font-mono-tabular rounded-sm border cursor-pointer ${
                      draft.cameraShakeLevel === level
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-[#161b23] text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {slider('Recoil Visual Intensity', draft.recoilVisualIntensity, 0.3, 1.5, 0.1, (v) =>
              setDraft({ ...draft, recoilVisualIntensity: v })
            )}
            {slider('Camera Zoom', draft.cameraZoom, 0.75, 1.3, 0.05, (v) =>
              setDraft({ ...draft, cameraZoom: v })
            )}
            {slider('Afterimage Intensity', draft.afterimageIntensity, 0, 1, 0.05, (v) =>
              setDraft({ ...draft, afterimageIntensity: v }),
              'OFF'
            )}
            {slider('Mouse Aim Sensitivity', draft.mouseSensitivity, 0.5, 1.8, 0.05, (v) =>
              setDraft({ ...draft, mouseSensitivity: v })
            )}
            {slider('Flight Control Sensitivity', draft.flightSensitivity, 0.6, 1.5, 0.05, (v) =>
              setDraft({ ...draft, flightSensitivity: v })
            )}
            {slider('Render Resolution Scale', draft.displayScale, 0.6, 1.25, 0.05, (v) =>
              setDraft({ ...draft, displayScale: v })
            )}

            {/* Mobility & Aerial VFX Toggles */}
            <div>
              <span className="block text-xs text-slate-300 mb-1.5">Mobility & Flight VFX</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['dashVfx', 'Dash VFX'],
                    ['grappleVfx', 'Grapple VFX'],
                    ['flightVfx', 'Flight VFX'],
                    ['rocketExhaustVfx', 'Rocket Exhaust'],
                  ] as const
                ).map(([field, label]) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => setDraft({ ...draft, [field]: !draft[field] })}
                    className={`px-3 py-1.5 text-xs rounded-sm border flex items-center justify-between cursor-pointer ${
                      draft[field]
                        ? 'bg-[#16221c] border-emerald-500/70 text-emerald-300'
                        : 'bg-[#161b23] border-slate-700 text-slate-400'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="font-mono-tabular font-semibold">{draft[field] ? 'ON' : 'OFF'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs text-slate-300 mb-1.5">Graphics Quality</span>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDraft({ ...draft, graphicsQuality: q })}
                    className={`py-1.5 text-xs capitalize rounded-sm border cursor-pointer ${
                      draft.graphicsQuality === q
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-[#161b23] text-slate-300 border-slate-700'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs text-slate-300 mb-1.5">Boss Ultimate Cinematics</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['full', 'Full Framing'],
                    ['short', 'Shortened'],
                    ['off', 'Off'],
                  ] as const
                ).map(([mode, lbl]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDraft({ ...draft, bossCinematics: mode })}
                    className={`py-1.5 text-xs rounded-sm border cursor-pointer ${
                      draft.bossCinematics === mode
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-[#161b23] text-slate-300 border-slate-700'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Control Remapping */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-amber-400">Key Bindings</h3>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, keyBindings: structuredClone(DEFAULT_SETTINGS.keyBindings) })}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                Reset Defaults
              </button>
            </div>
            <div className="space-y-1.5">
              {KEYBIND_LABELS.map(([field, label]) => {
                const isListening = listeningKey === field;
                return (
                  <div
                    key={field}
                    className="flex items-center justify-between px-3 py-1.5 bg-[#151a22] border border-slate-800 rounded-sm text-xs"
                  >
                    <span className="text-slate-300">{label}</span>
                    <button
                      type="button"
                      onClick={() => setListeningKey(field)}
                      className={`px-2.5 py-1 font-mono-tabular rounded-sm border cursor-pointer ${
                        isListening
                          ? 'bg-amber-500 text-slate-950 border-amber-300 font-semibold'
                          : 'bg-[#0e1218] text-amber-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {isListening ? 'Press Key...' : formatKeyCode(draft.keyBindings[field])}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-sm cursor-pointer"
          >
            Apply & Save
          </button>
        </div>
      </div>
    </div>
  );
};
