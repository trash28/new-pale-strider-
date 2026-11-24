import { CameraShakeLevel, MechClassId, SaveData, SettingsData } from './types';

const STORAGE_KEY = 'pale_strider_save_v1';

export const DEFAULT_SETTINGS: SettingsData = {
  masterVolume: 0.72,
  musicVolume: 0.36,
  sfxVolume: 0.85,
  weaponsVolume: 0.92,
  explosionsVolume: 0.94,
  mechanicalVolume: 0.84,
  enginesVolume: 0.76,
  ambienceVolume: 0.55,
  radioVolume: 0.75,
  uiVolume: 0.65,
  dynamicAudioMix: true,
  cameraShake: 1.0,
  cameraShakeLevel: 'medium',
  recoilVisualIntensity: 1.0,
  displayScale: 1.0,
  graphicsQuality: 'high',
  mouseSensitivity: 1.0,
  flightSensitivity: 1.0,
  cameraZoom: 1.0,
  bossCinematics: 'full',
  dashVfx: true,
  afterimageIntensity: 0.9,
  grappleVfx: true,
  flightVfx: true,
  rocketExhaustVfx: true,
  keyBindings: {
    moveForward: 'KeyW',
    moveBackward: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ShiftLeft',
    dash: 'Space',
    grapple: 'KeyE',
    descend: 'ControlLeft',
    special: 'KeyV',
    stealth: 'KeyC',
    reload: 'KeyR',
    interact: 'KeyT',
    squadMenu: 'KeyQ',
    tacticalMap: 'Tab',
    weapon1: 'Digit1',
    weapon2: 'Digit2',
    weapon3: 'Digit3',
    toggleMinimap: 'KeyM',
    pause: 'Escape',
  },
};

export function shakeLevelToMultiplier(level: CameraShakeLevel): number {
  switch (level) {
    case 'off':
      return 0;
    case 'low':
      return 0.35;
    case 'high':
      return 1.45;
    case 'medium':
    default:
      return 1.0;
  }
}

export function getCameraShakeScale(settings: SettingsData): number {
  if (settings.cameraShakeLevel === 'off') return 0;
  return shakeLevelToMultiplier(settings.cameraShakeLevel);
}

export const DEFAULT_SAVE: SaveData = {
  credits: 350,
  unlockedUnits: ['recon', 'standard', 'sniper', 'colossus', 'engineer', 'valkyrie', 'phantom', 'assassin', 'proteus'],
  selectedUnit: 'standard',
  completedMissions: [],
  highestSurvivalWave: 0,
  customLoadouts: {},
  failedModeUnits: {},
  settings: DEFAULT_SETTINGS,
};

export function loadSaveData(): SaveData {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return structuredClone(DEFAULT_SAVE);
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const mergedUnlocked: MechClassId[] = Array.from(
      new Set<MechClassId>([
        ...(parsed.unlockedUnits ?? DEFAULT_SAVE.unlockedUnits),
        'colossus',
        'engineer',
        'valkyrie',
        'phantom',
        'assassin',
        'proteus',
      ])
    );
    const parsedKb = parsed.settings?.keyBindings;
    const migratedSpecial =
      parsedKb && parsedKb.special === 'Space' && !parsedKb.dash ? 'KeyV' : parsedKb?.special;
    const migratedInteract =
      parsedKb && parsedKb.interact === 'KeyE' && !parsedKb.grapple ? 'KeyT' : parsedKb?.interact;

    const rawLevel = parsed.settings?.cameraShakeLevel;
    const inferredLevel: CameraShakeLevel =
      rawLevel ??
      (parsed.settings?.cameraShake === 0
        ? 'off'
        : parsed.settings?.cameraShake !== undefined && parsed.settings.cameraShake <= 0.5
        ? 'low'
        : parsed.settings?.cameraShake !== undefined && parsed.settings.cameraShake >= 1.3
        ? 'high'
        : 'medium');

    return {
      ...structuredClone(DEFAULT_SAVE),
      ...parsed,
      unlockedUnits: mergedUnlocked,
      failedModeUnits: { ...(parsed.failedModeUnits ?? {}) },
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
        cameraShakeLevel: inferredLevel,
        cameraShake: shakeLevelToMultiplier(inferredLevel),
        keyBindings: {
          ...DEFAULT_SETTINGS.keyBindings,
          ...(parsedKb ?? {}),
          ...(migratedSpecial ? { special: migratedSpecial } : {}),
          ...(migratedInteract ? { interact: migratedInteract } : {}),
        },
      },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function persistSaveData(data: SaveData): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  return code;
}
