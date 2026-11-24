import type { AudioAssetId } from './audioAssets';

export type RadioSpeakerRole =
  | 'commander'
  | 'squad_leader'
  | 'operator'
  | 'pilot_bravo'
  | 'pilot_alpha'
  | 'recon_sniper'
  | 'revenant';

export type RadioEventCategory =
  | 'deploy'
  | 'order_combat'
  | 'order_squad_follow'
  | 'order_squad_hold'
  | 'order_squad_attack'
  | 'order_squad_regroup'
  | 'order_squad_spread'
  | 'order_squad_retreat'
  | 'objective_change'
  | 'reinforcements'
  | 'combat_contact'
  | 'combat_kill'
  | 'combat_flank'
  | 'combat_suppression'
  | 'player_surrounded'
  | 'player_assisted'
  | 'player_threat_alert'
  | 'squad_assault_report'
  | 'squad_support_report'
  | 'squad_recon_report'
  | 'missile_warning'
  | 'armor_critical'
  | 'artillery_warning'
  | 'contacts_multiple'
  | 'mayday'
  | 'boss_detected'
  | 'boss_aggressive'
  | 'boss_special'
  | 'boss_damaged'
  | 'boss_destroyed'
  | 'ally_critical'
  | 'ally_near_death'
  | 'ally_final'
  | 'ally_destroyed'
  | 'squad_reaction'
  | 'victory'
  | 'defeat'
  | 'boot_online'
  | 'revenant_intro'
  | 'revenant_taunt'
  | 'revenant_damaged'
  | 'revenant_defeated';

/**
 * 5 = Immediate danger to player / Revenant horror intrusion / Final distress
 * 4 = Allied unit imminent destruction / Boss special / Player assistance urgent
 * 3 = Critical mission orders, deployment, victory/defeat
 * 2 = Major battlefield events, boss alerts, confirmed ally loss, squad reports
 * 1 = General squad chatter & combat callouts
 */
export type RadioPriority = 1 | 2 | 3 | 4 | 5;

export type RadioSignalProfile = 'clean' | 'field' | 'degraded' | 'distress' | 'corrupted';

export interface VoiceLineEntry {
  id: string;
  url: string;
  speakerRole: RadioSpeakerRole;
  defaultCallsign: string;
  category: RadioEventCategory;
  priority: RadioPriority;
  text: string;
  durationSec: number;
  signalProfile: RadioSignalProfile;
  voiceModel: string;
  sfxOverlay?: AudioAssetId;
}

export const SPEAKER_CALLSIGNS: Record<RadioSpeakerRole, string> = {
  commander: 'OVERLORD',
  squad_leader: 'WARDOG-1',
  operator: 'OVERWATCH',
  pilot_bravo: 'VANGUARD-2',
  pilot_alpha: 'AEGIS-3',
  recon_sniper: 'SPECTRE-4',
  revenant: 'REVENANT',
};

const VOICE_MODELS: Record<RadioSpeakerRole, string> = {
  commander: 'rhasspy/piper-voices en_US-ryan-medium (MIT/CC0)',
  squad_leader: 'rhasspy/piper-voices en_US-joe-medium (MIT/CC0)',
  operator: 'rhasspy/piper-voices en_US-lessac-medium (MIT/CC0)',
  pilot_bravo: 'rhasspy/piper-voices en_GB-alan-medium (MIT/CC0)',
  pilot_alpha: 'rhasspy/piper-voices en_US-amy-medium (MIT/CC0)',
  recon_sniper: 'rhasspy/piper-voices en_GB-northern_english_male-medium (MIT/CC0)',
  revenant: 'rhasspy/piper-voices en_US-ryan-medium + radio horror DSP (MIT/CC0)',
};

function makeLine(
  id: string,
  speakerRole: RadioSpeakerRole,
  category: RadioEventCategory,
  priority: RadioPriority,
  text: string,
  durationSec: number,
  signalProfile: RadioSignalProfile,
  sfxOverlay?: AudioAssetId
): VoiceLineEntry {
  return {
    id,
    url: `/assets/audio/voices/${id}.mp3`,
    speakerRole,
    defaultCallsign: SPEAKER_CALLSIGNS[speakerRole],
    category,
    priority,
    text,
    durationSec,
    signalProfile,
    voiceModel: VOICE_MODELS[speakerRole],
    ...(sfxOverlay ? { sfxOverlay } : {}),
  };
}

export const ALL_VOICE_LINES: VoiceLineEntry[] = [
  // =========================================================================
  // ORIGINAL 52 CORE MILITARY VOICE LINES
  // =========================================================================
  makeLine('cmd_deploy_01', 'commander', 'deploy', 3, 'All units, prepare for deployment. Weapons hot.', 3.0, 'clean'),
  makeLine('cmd_deploy_02', 'commander', 'deploy', 3, 'Command to all units. Begin advancing to the designated objective.', 3.8, 'clean'),
  makeLine('cmd_deploy_03', 'commander', 'deploy', 3, 'Maintain formation. Do not lose contact.', 2.8, 'clean'),
  makeLine('cmd_deploy_04', 'commander', 'deploy', 3, 'All units, engage hostile targets. You are cleared to engage.', 3.6, 'clean'),
  makeLine('cmd_order_priority', 'commander', 'order_combat', 3, 'Priority target identified. Take it down.', 2.8, 'clean'),
  makeLine('cmd_order_hold', 'commander', 'order_combat', 3, 'Hold your position. Do not yield the sector.', 3.0, 'clean'),
  makeLine('cmd_order_push', 'commander', 'order_combat', 3, 'Push forward. We need that position secured.', 3.0, 'clean'),
  makeLine('cmd_order_reinforce', 'operator', 'reinforcements', 2, 'Warning. Enemy reinforcements approaching the perimeter.', 3.4, 'field'),
  makeLine('cmd_order_fallback', 'commander', 'order_combat', 3, 'Fall back! Repeat, fall back and regroup!', 3.0, 'field'),
  makeLine('cmd_order_objective', 'operator', 'objective_change', 3, 'Your current objective has changed. Redirect to the marked position.', 3.8, 'clean'),
  makeLine('cmd_order_artillery', 'commander', 'order_combat', 3, 'Artillery support requested on hostile coordinates.', 3.2, 'clean'),
  makeLine('cmd_order_victory', 'commander', 'victory', 3, 'Sector cleared. Outstanding work, all units. Return to base.', 3.8, 'clean'),
  makeLine('cmd_order_defeat', 'commander', 'defeat', 3, 'All friendly signals lost. Mission aborted. Fall back.', 3.6, 'degraded'),

  makeLine('sq_order_follow', 'squad_leader', 'order_squad_follow', 3, 'Copy, moving on your lead. Maintaining tight formation.', 3.2, 'field'),
  makeLine('sq_order_hold', 'squad_leader', 'order_squad_hold', 3, 'Roger, locking down this position.', 2.4, 'field'),
  makeLine('sq_order_attack', 'squad_leader', 'order_squad_attack', 3, 'Acknowledged! Engaging primary target now.', 2.7, 'field'),
  makeLine('sq_order_regroup', 'squad_leader', 'order_squad_regroup', 3, 'Pulling back to regroup on your chassis.', 2.6, 'field'),

  makeLine('emg_missile_01', 'operator', 'missile_warning', 5, 'Missile inbound! Evasive maneuvers!', 2.4, 'clean'),
  makeLine('emg_missile_02', 'squad_leader', 'missile_warning', 5, 'Watch out! Incoming missile lock on your vector!', 2.9, 'field'),
  makeLine('emg_armor_01', 'operator', 'armor_critical', 5, 'Warning! Your armor is critically damaged!', 2.6, 'clean'),
  makeLine('emg_armor_02', 'operator', 'armor_critical', 5, 'Hull integrity critical! Take cover immediately!', 2.9, 'clean'),
  makeLine('emg_artillery_01', 'operator', 'artillery_warning', 5, 'Incoming artillery! Take cover!', 2.2, 'clean'),
  makeLine('emg_artillery_02', 'squad_leader', 'artillery_warning', 5, 'Shells incoming! Clear the impact zone!', 2.5, 'field'),
  makeLine('emg_contacts_01', 'operator', 'contacts_multiple', 2, 'Warning! Multiple hostile contacts detected.', 2.8, 'clean'),
  makeLine('emg_contacts_02', 'pilot_bravo', 'contacts_multiple', 2, 'Enemy units closing in fast! Requesting immediate assistance!', 3.5, 'field'),
  makeLine('emg_mayday_01', 'pilot_alpha', 'mayday', 5, "Mayday! Mayday! We're taking heavy fire!", 2.8, 'distress', 'radio_scream_female_01'),
  makeLine('emg_boss_01', 'operator', 'boss_detected', 2, 'Seismic alert! Super-heavy Thunderhead walker detected on radar!', 4.0, 'clean'),
  makeLine('emg_boss_02', 'commander', 'boss_detected', 2, 'Thunderhead class confirmed. Concentrate all heavy fire on weak points!', 4.2, 'field'),
  makeLine('emg_boss_kill', 'commander', 'boss_destroyed', 2, 'Thunderhead destroyed! Colossal kill confirmed!', 3.0, 'clean'),

  makeLine('ally_crit_01', 'pilot_bravo', 'ally_critical', 4, "I'm hit! Systems are failing!", 2.3, 'degraded', 'radio_dying_pain_01'),
  makeLine('ally_crit_02', 'pilot_alpha', 'ally_critical', 4, "My armor is gone! I can't hold!", 2.4, 'degraded'),
  makeLine('ally_crit_03', 'squad_leader', 'ally_critical', 4, "Emergency! My reactor is overheating! I'm taking critical damage!", 3.7, 'degraded'),
  makeLine('ally_crit_04', 'pilot_bravo', 'ally_critical', 4, "I'm losing control! I can't keep this up!", 2.7, 'degraded'),
  makeLine('ally_near_01', 'pilot_alpha', 'ally_near_death', 4, "I'm not going to make it! Someone, get me out of here!", 3.3, 'distress', 'radio_scream_female_01'),
  makeLine('ally_near_02', 'pilot_bravo', 'ally_near_death', 4, "My systems are shutting down! I can't move, I'm completely exposed!", 3.8, 'distress', 'radio_scream_male_01'),
  makeLine('ally_near_03', 'squad_leader', 'ally_near_death', 4, "Tell command we need reinforcements! I'm losing power!", 3.3, 'distress', 'radio_scream_male_02'),
  makeLine('ally_final_01', 'pilot_alpha', 'ally_final', 4, "This is Aegis-3... I'm going dark. Tell the others... keep moving.", 4.2, 'distress', 'radio_scream_female_01'),
  makeLine('ally_final_02', 'pilot_bravo', 'ally_final', 4, "I'm sorry. I couldn't hold them. Vanguard-2... signing off.", 3.9, 'distress', 'radio_scream_male_01'),
  makeLine('ally_final_03', 'squad_leader', 'ally_final', 4, 'Mayday... Mayday... communications failing... going down.', 4.0, 'distress', 'radio_scream_male_02'),

  makeLine('ally_lost_01', 'operator', 'ally_destroyed', 2, 'Friendly unit destroyed! No response from that chassis.', 3.3, 'field'),
  makeLine('ally_lost_02', 'squad_leader', 'ally_destroyed', 2, "We've lost a squad member! They're gone, keep moving!", 3.3, 'degraded'),
  makeLine('ally_lost_03', 'commander', 'ally_destroyed', 2, 'Command confirms friendly unit down. Stay focused and hold the line.', 3.8, 'clean'),
  makeLine('ally_lost_04', 'pilot_alpha', 'ally_destroyed', 2, "Command, we've lost another unit! Watch your fire!", 3.1, 'degraded'),

  makeLine('sq_react_01', 'squad_leader', 'squad_reaction', 1, "I've got your left side covered.", 2.2, 'field'),
  makeLine('sq_react_02', 'pilot_bravo', 'squad_reaction', 1, 'Enemy contact, moving in!', 2.1, 'field'),
  makeLine('sq_react_03', 'pilot_alpha', 'squad_reaction', 1, 'Nice shot! Target neutralized!', 2.2, 'field'),
  makeLine('sq_react_04', 'pilot_bravo', 'squad_reaction', 1, "I'm repositioning for a better firing angle.", 2.7, 'field'),
  makeLine('sq_react_05', 'pilot_alpha', 'squad_reaction', 1, 'Watch your back! Hostile flanking!', 2.3, 'field'),
  makeLine('sq_react_06', 'squad_leader', 'squad_reaction', 1, 'I see another hostile on sensors!', 2.4, 'field'),
  makeLine('sq_react_07', 'pilot_bravo', 'squad_reaction', 1, "I'm running low on ammunition. Reloading.", 2.6, 'field'),
  makeLine('sq_react_08', 'pilot_alpha', 'squad_reaction', 1, "You're not alone out there. Pushing up with you.", 2.8, 'field'),

  makeLine('boot_online_01', 'operator', 'boot_online', 3, 'Reactor online. Sensors online. Weapons online. All systems nominal.', 4.4, 'clean'),

  // =========================================================================
  // 130 NEW EXPANDED MILITARY RADIO MESSAGES (CATEGORIES A–H + REVENANT)
  // =========================================================================

  // --- A. MISSION ORDERS (16 new lines) ---
  makeLine('ord_dep_05', 'commander', 'deploy', 3, 'Four-unit lance is green across the board. Move into the combat zone.', 4.0, 'clean'),
  makeLine('ord_dep_06', 'commander', 'deploy', 3, 'Overlord actual to strike squad. Sweep the grid and eliminate all hostiles.', 4.2, 'clean'),
  makeLine('ord_dep_07', 'operator', 'deploy', 3, 'Tactical datalink synced across all four mechs. Cleared for engagement.', 4.0, 'clean'),
  makeLine('ord_dep_08', 'squad_leader', 'deploy', 3, 'All wingmen check in. Weapons free, stay sharp out there.', 3.4, 'field'),
  makeLine('ord_obj_02', 'commander', 'objective_change', 3, 'New coordinates uploaded to your HUD. Move to intercept immediately.', 3.8, 'clean'),
  makeLine('ord_obj_03', 'operator', 'objective_change', 3, 'Primary objective updated. Hostile armor detected at the next waypoint.', 4.0, 'clean'),
  makeLine('ord_atk_01', 'commander', 'order_combat', 3, 'Break their front line! Focus all cannons on the lead walker.', 3.6, 'clean'),
  makeLine('ord_atk_02', 'commander', 'order_combat', 3, 'Press the advantage! Do not let them regroup!', 3.0, 'clean'),
  makeLine('ord_def_01', 'commander', 'order_combat', 3, 'Dig in and establish a defensive perimeter. Hold until further notice.', 3.9, 'clean'),
  makeLine('ord_def_02', 'operator', 'order_combat', 3, 'Defensive posture advised. Heavy incoming traffic on long-range radar.', 3.9, 'field'),
  makeLine('ord_ret_01', 'commander', 'order_squad_retreat', 3, 'Tactical withdrawal ordered. Pull back behind cover and reform.', 3.7, 'field'),
  makeLine('ord_ret_02', 'squad_leader', 'order_squad_retreat', 3, 'Falling back! Laying down smoke and covering fire!', 3.2, 'field'),
  makeLine('ord_spr_01', 'squad_leader', 'order_squad_spread', 3, 'Spreading formation! Expanding firing arcs across the lane.', 3.5, 'field'),
  makeLine('ord_spr_02', 'pilot_bravo', 'order_squad_spread', 3, 'Copy, breaking out to the flank. Giving you room to maneuver.', 3.4, 'field'),
  makeLine('ord_rnf_02', 'operator', 'reinforcements', 2, 'Hostile drop pods detected! Multiple fresh mechs entering the sector!', 4.0, 'field'),
  makeLine('ord_rnf_03', 'recon_sniper', 'reinforcements', 2, 'Visual on enemy reinforcements advancing from the far ridge.', 3.6, 'field'),

  // --- B. COMBAT COMMUNICATIONS (20 new lines) ---
  makeLine('cmb_cnt_01', 'pilot_bravo', 'combat_contact', 1, 'Contact front! Hostile walkers dead ahead!', 2.8, 'field'),
  makeLine('cmb_cnt_02', 'recon_sniper', 'combat_contact', 1, 'Eyes on enemy armor. Range five hundred meters and closing.', 3.6, 'field'),
  makeLine('cmb_cnt_03', 'pilot_alpha', 'combat_contact', 1, 'Hostile signatures spiking on radar! Weapons hot!', 3.1, 'field'),
  makeLine('cmb_cnt_04', 'squad_leader', 'combat_contact', 1, 'Tango spotted! Light them up!', 2.3, 'field'),
  makeLine('cmb_kil_01', 'pilot_bravo', 'combat_kill', 1, 'Scratch one hostile! Chassis down!', 2.5, 'field'),
  makeLine('cmb_kil_02', 'recon_sniper', 'combat_kill', 1, 'Clean headshot on the turret. Target eliminated.', 3.1, 'field'),
  makeLine('cmb_kil_03', 'pilot_alpha', 'combat_kill', 1, 'Hostile walker neutralized. Moving to next target.', 3.1, 'field'),
  makeLine('cmb_kil_04', 'squad_leader', 'combat_kill', 1, 'Direct hit! That mech is scrap metal!', 2.7, 'field'),
  makeLine('cmb_kil_05', 'commander', 'combat_kill', 1, 'Good kill, squad. Keep up the pressure.', 2.6, 'clean'),
  makeLine('cmb_kil_06', 'recon_sniper', 'combat_kill', 1, 'Long-range target down. One less gun pointed at us.', 3.3, 'field'),
  makeLine('cmb_flk_01', 'pilot_bravo', 'combat_flank', 1, 'Pushing wide right to flank their armor!', 2.7, 'field'),
  makeLine('cmb_flk_02', 'pilot_bravo', 'combat_flank', 1, 'I have a clear angle on their rear engine block. Moving in!', 3.5, 'field'),
  makeLine('cmb_flk_03', 'squad_leader', 'combat_flank', 1, 'Flanking maneuver underway. Keep their attention forward!', 3.3, 'field'),
  makeLine('cmb_sup_01', 'pilot_bravo', 'combat_suppression', 1, 'Opening up with heavy cannons! Suppressing hostile line!', 3.3, 'field'),
  makeLine('cmb_sup_02', 'pilot_alpha', 'combat_suppression', 1, 'Laying down covering fire! Advance when ready!', 2.9, 'field'),
  makeLine('cmb_sup_03', 'recon_sniper', 'combat_suppression', 1, 'Pinning down enemy artillery from overwatch.', 2.9, 'field'),
  makeLine('cmb_msl_03', 'operator', 'missile_warning', 5, 'Multiple missile launches detected! Activate countermeasures!', 3.5, 'clean'),
  makeLine('cmb_msl_04', 'recon_sniper', 'missile_warning', 5, 'High-velocity missiles airborne! Break hard left or right!', 3.4, 'field'),
  makeLine('cmb_art_03', 'operator', 'artillery_warning', 5, 'Ballistic mortar trajectory locked on your grid! Move now!', 3.5, 'clean'),
  makeLine('cmb_art_04', 'recon_sniper', 'artillery_warning', 5, 'Enemy battery just fired! Incoming shells in three seconds!', 3.5, 'field'),

  // --- C. PLAYER ASSISTANCE (16 new lines) ---
  makeLine('ast_sur_01', 'operator', 'player_surrounded', 4, 'Alert! Multiple hostile mechs converging on your position!', 3.5, 'clean'),
  makeLine('ast_sur_02', 'pilot_bravo', 'player_surrounded', 4, 'Lead is getting swarmed! Pushing in to draw their fire!', 3.4, 'field'),
  makeLine('ast_sur_03', 'pilot_alpha', 'player_surrounded', 4, 'Hold on Commander, I am moving to cover your flank!', 3.2, 'field'),
  makeLine('ast_sur_04', 'recon_sniper', 'player_surrounded', 4, 'You are surrounded! Picking off the closest hostiles now!', 3.4, 'field'),
  makeLine('ast_dmg_01', 'pilot_alpha', 'armor_critical', 5, 'Commander, your hull is redlining! Fall back to me for field repairs!', 3.9, 'field'),
  makeLine('ast_dmg_02', 'squad_leader', 'armor_critical', 5, 'Lead is smoking badly! Cover them while they disengage!', 3.3, 'field'),
  makeLine('ast_dmg_03', 'commander', 'armor_critical', 5, 'Critical chassis breach detected! Evade and let support stabilize you!', 3.9, 'clean'),
  makeLine('ast_cov_01', 'pilot_bravo', 'player_assisted', 2, 'Got that one off your back! Keep pushing, Commander!', 3.0, 'field'),
  makeLine('ast_cov_02', 'pilot_alpha', 'player_assisted', 2, 'Hostile targeting you is down. My repair beam is standing by.', 3.5, 'field'),
  makeLine('ast_cov_03', 'recon_sniper', 'player_assisted', 2, 'Eliminated the sniper aiming at your cockpit. You are clear.', 3.5, 'field'),
  makeLine('ast_cov_04', 'squad_leader', 'player_assisted', 2, 'Threat on Lead neutralized! We have your six!', 2.9, 'field'),
  makeLine('ast_thr_01', 'recon_sniper', 'player_threat_alert', 4, 'Heavy hunter locked onto your chassis! Watch your flank!', 3.3, 'field'),
  makeLine('ast_thr_02', 'operator', 'player_threat_alert', 4, 'High-threat hostile pursuing your vector! Evasive action recommended!', 3.8, 'clean'),
  makeLine('ast_thr_03', 'pilot_bravo', 'player_threat_alert', 4, 'Big hostile charging straight at you! Intercepting now!', 3.2, 'field'),
  makeLine('ast_thr_04', 'pilot_alpha', 'player_threat_alert', 4, 'Incoming fire on Lead! Moving in to shield your hull!', 3.2, 'field'),
  makeLine('ast_cov_05', 'pilot_alpha', 'player_assisted', 2, 'Patching your armor plating now. Hold steady for two seconds.', 3.4, 'field'),

  // --- D. SQUADMATE ROLE COMMUNICATIONS (18 new lines) ---
  makeLine('sq_asl_01', 'pilot_bravo', 'squad_assault_report', 2, 'Vanguard-2 engaging hostile vanguard at close range!', 3.2, 'field'),
  makeLine('sq_asl_02', 'pilot_bravo', 'squad_assault_report', 2, 'Closing distance! Taking the point and drawing enemy fire!', 3.4, 'field'),
  makeLine('sq_asl_03', 'pilot_bravo', 'squad_assault_report', 2, 'Breaching their formation! Follow my push!', 2.8, 'field'),
  makeLine('sq_asl_04', 'pilot_bravo', 'squad_assault_report', 1, 'Autocannon hot! Shredding hostile armor plating!', 3.1, 'field'),
  makeLine('sq_asl_05', 'pilot_bravo', 'squad_assault_report', 1, 'Reloading main battery! Cover me for a second!', 2.9, 'field'),
  makeLine('sq_asl_06', 'pilot_bravo', 'squad_assault_report', 1, 'My hull is holding strong. Ready for the next wave.', 3.1, 'field'),
  makeLine('sq_sup_01', 'pilot_alpha', 'squad_support_report', 2, 'Aegis-3 online. Repair emitters charged and tracking squad.', 3.5, 'field'),
  makeLine('sq_sup_02', 'pilot_alpha', 'squad_support_report', 2, 'Routing repair beam to damaged squadmate. Keep fighting!', 3.4, 'field'),
  makeLine('sq_sup_03', 'pilot_alpha', 'squad_support_report', 2, 'Deploying defensive field! Stay close to my chassis!', 3.2, 'field'),
  makeLine('sq_sup_04', 'pilot_alpha', 'squad_support_report', 1, 'Point-defense guns active. Watching the skies for missiles.', 3.4, 'field'),
  makeLine('sq_sup_05', 'pilot_alpha', 'squad_support_report', 1, 'Squad integrity stabilized. Moving with the formation.', 3.2, 'field'),
  makeLine('sq_sup_06', 'pilot_alpha', 'squad_support_report', 2, 'I am taking heat on the support line! Need a screen!', 3.1, 'degraded'),
  makeLine('sq_rcn_01', 'recon_sniper', 'squad_recon_report', 2, 'Spectre-4 in overwatch position. Scanning long-range sectors.', 3.6, 'field'),
  makeLine('sq_rcn_02', 'recon_sniper', 'squad_recon_report', 2, 'Hostile missile launcher marked on grid! Lining up the shot.', 3.5, 'field'),
  makeLine('sq_rcn_03', 'recon_sniper', 'squad_recon_report', 2, 'Enemy sniper sighted on the perimeter. Counter-sniping now.', 3.5, 'field'),
  makeLine('sq_rcn_04', 'recon_sniper', 'squad_recon_report', 1, 'Relocating to high ground for a cleaner firing lane.', 3.2, 'field'),
  makeLine('sq_rcn_05', 'recon_sniper', 'squad_recon_report', 1, 'Railgun capacitor at full charge. Firing!', 2.9, 'field'),
  makeLine('sq_rcn_06', 'recon_sniper', 'squad_recon_report', 2, 'Hostiles pushing my perch! Disengaging to secondary cover!', 3.5, 'field'),

  // --- E. BOSS COMMUNICATIONS (16 new lines) ---
  makeLine('bss_det_03', 'recon_sniper', 'boss_detected', 2, 'Massive thermal signature! A Thunderhead dreadnought just entered the zone!', 4.2, 'field'),
  makeLine('bss_det_04', 'pilot_bravo', 'boss_detected', 2, 'Look at the speed on that thing! All units, brace for heavy combat!', 3.8, 'field'),
  makeLine('bss_agg_01', 'operator', 'boss_aggressive', 4, 'Warning! Boss reactor output spiking! It is accelerating toward the squad!', 4.1, 'clean'),
  makeLine('bss_agg_02', 'pilot_bravo', 'boss_aggressive', 4, 'It is charging straight at us! Scatter! Scatter!', 3.1, 'field'),
  makeLine('bss_agg_03', 'recon_sniper', 'boss_aggressive', 4, 'Boss shifted into overdrive! Do not stand in its path!', 3.4, 'field'),
  makeLine('bss_agg_04', 'commander', 'boss_aggressive', 4, 'Boss is flanking at extreme speed! Keep mobile and use your thrusters!', 4.0, 'clean'),
  makeLine('bss_spc_01', 'operator', 'boss_special', 5, 'Critical alert! Boss ultimate weapon charging! Evade the blast radius!', 4.1, 'clean'),
  makeLine('bss_spc_02', 'commander', 'boss_special', 5, 'Strategic warhead launch imminent! Dash out of the impact zone now!', 4.0, 'field'),
  makeLine('bss_spc_03', 'pilot_alpha', 'boss_special', 5, 'Thermal spike off the charts! Get behind solid cover!', 3.3, 'degraded'),
  makeLine('bss_spc_04', 'recon_sniper', 'boss_special', 5, 'Dorsal bays are open! Massive ordnance incoming!', 3.2, 'field'),
  makeLine('bss_dmg_01', 'commander', 'boss_damaged', 2, 'Boss armor is buckling! Keep pouring fire into its core!', 3.4, 'clean'),
  makeLine('bss_dmg_02', 'pilot_bravo', 'boss_damaged', 2, 'We blew its leg hydraulics apart! Finish that monster!', 3.3, 'field'),
  makeLine('bss_dmg_03', 'recon_sniper', 'boss_damaged', 2, 'Boss hull below fifty percent! Its systems are venting smoke!', 3.6, 'field'),
  makeLine('bss_dmg_04', 'pilot_alpha', 'boss_damaged', 2, 'Keep the pressure on! One more salvo will bring it down!', 3.3, 'field'),
  makeLine('bss_kil_02', 'pilot_bravo', 'boss_destroyed', 3, 'Target is down! The dreadnought is burning! Hell yeah!', 3.5, 'field'),
  makeLine('bss_kil_03', 'recon_sniper', 'boss_destroyed', 3, 'Seismic readings flatlined. Super-heavy hostile confirmed destroyed.', 3.9, 'field'),

  // --- F. CRITICAL DAMAGE & DISTRESS (14 new lines, layered with CC0 pain/breathing/scream SFX) ---
  makeLine('dst_crt_05', 'pilot_bravo', 'ally_critical', 4, "I'm hit! I'm hit! Somebody help me!", 2.7, 'distress', 'radio_scream_male_01'),
  makeLine('dst_crt_06', 'pilot_alpha', 'ally_critical', 4, "My left actuator is shredded! I can't turn!", 2.9, 'degraded', 'radio_dying_pain_01'),
  makeLine('dst_crt_07', 'recon_sniper', 'ally_critical', 4, 'Cockpit breached! Taking heavy damage on the ridge!', 3.2, 'degraded', 'radio_dying_pain_01'),
  makeLine('dst_crt_08', 'pilot_bravo', 'ally_critical', 4, 'Main gun is jammed and my hull is on fire! Need support!', 3.5, 'distress', 'radio_heavy_breathing'),
  makeLine('dst_crt_09', 'pilot_alpha', 'ally_critical', 4, 'Reactor coolant leak! Temperature critical! Help!', 3.2, 'distress', 'radio_scream_female_01'),
  makeLine('dst_crt_10', 'recon_sniper', 'ally_critical', 4, 'Sensors offline! I am flying blind and taking hits!', 3.3, 'degraded'),
  makeLine('dst_nr_04', 'pilot_bravo', 'ally_near_death', 5, "I can't get out! My systems are failing! Hatch is jammed!", 3.5, 'distress', 'radio_scream_male_02'),
  makeLine('dst_nr_05', 'pilot_alpha', 'ally_near_death', 5, 'Get me out of here! The cockpit is filling with smoke!', 3.4, 'distress', 'radio_scream_female_01'),
  makeLine('dst_nr_06', 'recon_sniper', 'ally_near_death', 5, 'Mayday! Mayday! Core containment failing! I am going down!', 3.6, 'distress', 'radio_scream_male_01'),
  makeLine('dst_nr_07', 'pilot_bravo', 'ally_near_death', 5, 'My reactor... it is going to blow! Stay back!', 3.2, 'distress', 'radio_scream_male_02'),
  makeLine('dst_nr_08', 'pilot_alpha', 'ally_near_death', 5, 'Power failing... cannot eject... someone please!', 3.3, 'distress', 'radio_scream_female_01'),
  makeLine('dst_nr_09', 'recon_sniper', 'ally_near_death', 5, 'Legs are gone! I am pinned down and burning!', 3.0, 'distress', 'radio_dying_pain_01'),
  makeLine('dst_may_02', 'pilot_bravo', 'mayday', 5, 'Mayday! Mayday! Squad under overwhelming fire! Requesting extraction!', 3.9, 'distress', 'radio_scream_male_02'),
  makeLine('dst_may_03', 'recon_sniper', 'mayday', 5, 'Emergency beacon active! We are getting torn apart out here!', 3.5, 'distress', 'radio_heavy_breathing'),

  // --- G. DEATH & FINAL TRANSMISSIONS (12 new lines with CC0 screams & static cutoffs) ---
  makeLine('dth_fin_04', 'pilot_bravo', 'ally_final', 5, 'No! Not like this— my core is—', 2.6, 'distress', 'radio_scream_male_01'),
  makeLine('dth_fin_05', 'pilot_alpha', 'ally_final', 5, 'Commander... tell them we held the—', 2.8, 'distress', 'radio_scream_female_01'),
  makeLine('dth_fin_06', 'recon_sniper', 'ally_final', 5, 'Spectre-4 going down! Impact in—', 2.6, 'distress', 'radio_scream_male_02'),
  makeLine('dth_fin_07', 'pilot_bravo', 'ally_final', 5, 'Hull breach! Ejection failed! Argh—', 2.7, 'distress', 'radio_scream_male_01'),
  makeLine('dth_fin_08', 'pilot_alpha', 'ally_final', 5, 'Aegis-3... losing signal... goodbye...', 3.2, 'distress', 'radio_heavy_breathing'),
  makeLine('dth_fin_09', 'recon_sniper', 'ally_final', 5, 'They got my reactor... finish the mission...', 3.1, 'distress', 'radio_dying_pain_01'),
  makeLine('dth_lst_05', 'pilot_bravo', 'ally_destroyed', 2, 'Damn it! We just lost a wingman! Make them pay!', 3.3, 'degraded'),
  makeLine('dth_lst_06', 'recon_sniper', 'ally_destroyed', 2, 'Beacon flatlined. Another pilot gone. Stay sharp.', 3.3, 'field'),
  makeLine('dth_lst_07', 'commander', 'ally_destroyed', 2, 'Overlord confirms loss of allied mech. Do not let their sacrifice be in vain.', 4.3, 'clean'),
  makeLine('dth_lst_08', 'operator', 'ally_destroyed', 2, 'Telemetry lost. Friendly chassis destroyed in sector.', 3.3, 'clean'),
  makeLine('dth_lst_09', 'pilot_alpha', 'ally_destroyed', 2, 'No! Their vitals just dropped to zero! Hold together!', 3.4, 'degraded'),
  makeLine('dth_lst_10', 'squad_leader', 'ally_destroyed', 2, 'We are down a mech! Tighten up and watch each other!', 3.3, 'degraded'),

  // --- H. VICTORY & DEFEAT (10 new lines) ---
  makeLine('vic_02', 'commander', 'victory', 3, 'All hostile forces eliminated. Phenomenal work, strike squad.', 3.7, 'clean'),
  makeLine('vic_03', 'pilot_bravo', 'victory', 3, 'Area is quiet. Every last hostile is smoking wreckage!', 3.4, 'field'),
  makeLine('vic_04', 'pilot_alpha', 'victory', 3, 'Mission accomplished. Squad telemetry green. Heading for extraction.', 3.8, 'field'),
  makeLine('vic_05', 'recon_sniper', 'victory', 3, 'All sectors clear from overwatch. Clean operation, Commander.', 3.6, 'field'),
  makeLine('vic_06', 'operator', 'victory', 3, 'Victory confirmed. Compiling after-action combat telemetry now.', 3.8, 'clean'),
  makeLine('def_02', 'operator', 'defeat', 3, 'Allied signal terminated. Sector overrun. Emergency withdrawal in effect.', 4.2, 'degraded'),
  makeLine('def_03', 'commander', 'defeat', 3, 'Strike squad neutralized. Recovering black-box telemetry from the wreckage.', 4.3, 'degraded'),
  makeLine('def_04', 'pilot_bravo', 'defeat', 3, 'Too many of them... we could not hold the sector...', 3.4, 'distress', 'radio_heavy_breathing'),
  makeLine('def_05', 'recon_sniper', 'defeat', 3, 'Mission failed. Pulling remaining survivors out of the kill zone.', 3.8, 'degraded'),
  makeLine('def_06', 'commander', 'defeat', 3, 'Regroup at base. We will remember what happened here.', 3.5, 'clean'),

  // --- I. REVENANT CORRUPTED RADIO HORROR (14 new lines with CC0 horror screams/drones) ---
  makeLine('rev_int_01', 'revenant', 'revenant_intro', 5, 'Signal detected... unit... identified.', 3.2, 'corrupted', 'radio_revenant_drone'),
  makeLine('rev_int_02', 'revenant', 'revenant_intro', 5, 'You left me behind. Do you remember me?', 3.4, 'corrupted', 'radio_revenant_drone'),
  makeLine('rev_int_03', 'revenant', 'revenant_intro', 5, 'I am still operational. Target reacquired.', 3.3, 'corrupted', 'radio_revenant_scream'),
  makeLine('rev_int_04', 'revenant', 'revenant_intro', 5, 'Why did you leave? We are not finished.', 3.3, 'corrupted', 'radio_revenant_drone'),
  makeLine('rev_tnt_01', 'revenant', 'revenant_taunt', 4, 'I can still see you. You cannot escape.', 3.2, 'corrupted', 'radio_heavy_breathing'),
  makeLine('rev_tnt_02', 'revenant', 'revenant_taunt', 4, 'Your old armor remembers every mistake.', 3.1, 'corrupted', 'radio_revenant_drone'),
  makeLine('rev_tnt_03', 'revenant', 'revenant_taunt', 4, 'Running again? It will not save you.', 3.0, 'corrupted', 'radio_revenant_scream'),
  makeLine('rev_tnt_04', 'revenant', 'revenant_taunt', 4, 'Systems corrupted... weapons unlocked... coming for you.', 3.8, 'corrupted', 'radio_revenant_drone'),
  makeLine('rev_tnt_05', 'revenant', 'revenant_taunt', 4, 'Did you think I stayed in the wreckage?', 3.0, 'corrupted', 'radio_heavy_breathing'),
  makeLine('rev_dmg_01', 'revenant', 'revenant_damaged', 4, 'Pain... static... it only makes me faster!', 3.4, 'corrupted', 'radio_revenant_scream'),
  makeLine('rev_dmg_02', 'revenant', 'revenant_damaged', 4, 'Break the shell! I will not shut down!', 3.1, 'corrupted', 'radio_scream_male_02'),
  makeLine('rev_dmg_03', 'revenant', 'revenant_damaged', 4, 'Reactor unstable... taking you with me!', 3.1, 'corrupted', 'radio_revenant_scream'),
  makeLine('rev_def_01', 'revenant', 'revenant_defeated', 4, 'Signal... fading... finally... quiet...', 3.5, 'corrupted', 'radio_heavy_breathing'),
  makeLine('rev_def_02', 'operator', 'revenant_defeated', 3, 'Corrupted signature terminated! Revenant chassis destroyed!', 3.6, 'clean'),
];

const BY_ID = new Map<string, VoiceLineEntry>(ALL_VOICE_LINES.map((l) => [l.id, l]));

export function getVoiceLineById(id: string): VoiceLineEntry | undefined {
  return BY_ID.get(id);
}

export function getVoiceLinesByCategory(category: RadioEventCategory): VoiceLineEntry[] {
  return ALL_VOICE_LINES.filter((l) => l.category === category);
}
