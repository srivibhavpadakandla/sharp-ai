/**
 * What changed between the DECODE (2025-26) manual and the BIOBUZZ (2026-27) V0
 * manual, compiled by the team.
 *
 * This is a team-compiled comparison, not a FIRST publication, and the page
 * says so. Rule numbers and page numbers are kept exactly as given so anyone
 * can open the manual and check a line rather than take this on trust — which
 * matters more here than anywhere else on the site, because a rule summary that
 * is subtly wrong is worse than no summary.
 */
export type ChangeGroup = 'major' | 'robot' | 'minor';

export interface Change {
  title: string;
  ref: string;
  points: string[];
}

export const MANUAL_CHANGES: Record<ChangeGroup, Change[]> = {
  major: [
    { title: 'New Competition Integrity Contract (CIC)', ref: 'Section 1.5, p14–16', points: [
      'Teams certify a Sporting Ethics Code (4 items) and Behavior Guidelines (8 items).',
      'Defines an escalation path: Lead Robot Inspector / Head Referee / FTA, up to the Event Director or FIRST Headquarters for serious violations.',
      'References "Escalation Guidelines" for specific rule violations; marked as coming soon.' ] },
    { title: 'Manual interpretation philosophy rewritten', ref: 'Section 1.6 / 1.7.1, p16', points: [
      'The manual is now the "source of truth" rather than something read literally: "some inconsistencies may exist. In cases of discrepancy, the Competition Manual takes precedence."',
      'Replaces the DECODE standard: "the text means exactly, and only, what it says… There are no hidden requirements or restrictions."',
      'A new Note from the FIRST Staff (1.4.1, p10) frames this as a deliberate shift toward judging by the spirit of the rule.' ] },
    { title: 'Check-in rule moved into Team Eligibility', ref: 'Rule I102, p22', points: [
      'Previously E105 in DECODE. Same 45-minutes-before-Qualification-MATCHES requirement, now in Section 3 rather than Section 5.' ] },
    { title: 'New advancement tier: Pilot Events', ref: 'Section 4, p27–28', points: [
      'Teams in a few specific geographical regions may advance from a Pilot event to FIRST Championship and/or a FIRST Premier Event.' ] },
    { title: 'Two new pit rules on gaining an unfair edge', ref: 'Rules E510–E511, p39–40', points: [
      'E510: heating or cooling ROBOT components for competitive advantage is prohibited.',
      'E511: batteries may not be charged on a charger exceeding a 3-amp average channel current; alligator clips are prohibited.' ] },
    { title: 'Team judged awards restructured', ref: 'Section 6.1, p43–46', points: [
      'Three categories instead of two: Machine/Creativity/Innovation, Team Attributes, and a new Documentation category. Think moves under Documentation.',
      '"Structured Interview" renamed "Initial Interview" (6.1.2, p46); may be scheduled in person, unscheduled in person, or fully remote.',
      'Event Volunteer Feedback removed as an allowed judging input (Figure 6-2).',
      'New exclusion: judges may not factor in ROBOT penalties during gameplay.' ] },
    { title: 'PORTFOLIO privacy requirement now mandatory', ref: 'Rule A201, p48', points: [
      'Teams "must strictly minimize" PII and "full names must not be disclosed" — previously framed as encouraged best practice.' ] },
    { title: 'Inspire Award eligibility updated', ref: 'Rules A213–A215, p52', points: [
      'The "own region" restriction now uses the defined term HOME REGION.',
      'New exception: at FIRST Championship and FIRST Premier Events, all teams may be considered for the Inspire Award.' ] },
    { title: 'Design Award requirement loosened', ref: 'Table 6-9, p57', points: [
      'Robot must be elegant, efficient, "and/or" practical to maintain — previously "and".' ] },
    { title: "Dean's List renamed FIRST Leadership Award", ref: 'Section 6.5.1, p58', points: [
      'The 10th/11th grade eligibility restriction stated in DECODE is not present in this section.' ] },
  ],
  robot: [
    { title: 'No unscheduled practice MATCHES before inspection', ref: 'Section 3.3, p23', points: [
      'Robots may not enter unscheduled or "filler line" practice MATCHES before passing inspection.' ] },
    { title: 'Inspection requirements softened', ref: 'Rules I301 & I303, p24–25', points: [
      'Previously I304 and I305. "Must" changed to "should"; lettered sub-items dropped.',
      'The explicit RED CARD consequence for failing re-inspection is no longer stated.',
      'New callout: "Inspection is not comprehensive… Teams that strategically circumvent ROBOT construction rules to gain a competitive advantage are not adhering to the CIC."' ] },
    { title: 'New rule: "It is your team\'s ROBOT"', ref: 'Rule R101, p66', points: [
      'Formally defines MAJOR MECHANISM; gearbox assemblies, sub-components and COTS items are excluded from the definition.' ] },
    { title: 'Expansion limits placeholder', ref: 'Rule R105, p68', points: [
      'Sizing constraints not yet published: "Sizing Constraints and more details will be released at Kickoff."' ] },
    { title: 'Named traction-device examples removed', ref: 'Rule R201, p68', points: [
      'AndyMark am-2256 and Roughtop am-3309 are no longer named; only generic examples given.' ] },
    { title: 'Flashing-light threshold changed', ref: 'Rule R202, p68–69', points: [
      'Previously an informal 2Hz callout. Now a formal rule item at 5Hz.' ] },
    { title: 'Work-outside-pit-hours rule removed', ref: 'Section 12.3, p69–71', points: [
      'Previously R307 in DECODE. No equivalent rule appears in this section.' ] },
    { title: 'ROBOT SIGN sizing loosened', ref: 'Rules R402–R403, p72–73', points: [
      'Team number height now "approximately 2.25 in." instead of a fixed ±0.5 in. tolerance.',
      'The small FIRST logo allowance is removed from the permitted markings.',
      'New: substitute ROBOT SIGNS may be handwritten on plain paper if materials are limited.' ] },
    { title: 'New motor added: WATTOS Stingray 12V DC', ref: 'Rule R501, p75', points: ['Part number WDM12.'] },
    { title: 'Servo limit reduced from 10 to 8', ref: 'Rule R503, p77', points: [
      'The motor limit of 8 is unchanged.' ] },
    { title: 'Six battery/wiring rules removed from Power Distribution', ref: 'Section 12.6, p78–80', points: [
      'Previously R603–R608: safe connectors, safe charge rate, no ballast, secure mounting, robust/insulated connections, limit on non-battery stored energy.',
      'Safe charge rate reappears separately as new Event Rule E511.' ] },
    { title: 'Fuse rating rule simplified', ref: 'Rule R604, p79', points: [
      'Previously R610. The cascading rating requirement is replaced by a general intent statement against modifying fuses.' ] },
    { title: 'Wire colour-coding requirement narrowed', ref: 'Rule R610, p82', points: [
      'Previously R616. Now applies only to the 12V main power bus and +5V auxiliary bus; motor wiring, signal-level wiring and servo cables/extensions are exempt.' ] },
    { title: 'Legal Android smartphone list removed', ref: 'Rule R701, p83', points: [
      'Previously R704. The REV Control Hub is now "the only officially supported ROBOT CONTROLLER device"; other devices are used at the team\'s own risk. Same change for the Driver Station device (R901).' ] },
    { title: 'FTC Dashboard and FTControl panels now prohibited', ref: 'Rule R704, p84', points: [
      '"Additional logging/streaming services, such as those hosted by third party plugins and tools such as FTC Dashboard, FTControl Panels, and others are prohibited."' ] },
    { title: 'Pneumatics rule now allows gas springs and dampers', ref: 'Rule R801, p87', points: [
      'Previously banned under R207. Now allowed if sealed, pre-charged by the manufacturer, and not user-adjustable or solenoid-actuated.' ] },
    { title: 'Gamepad allow-list removed', ref: 'Section 12.9, p87–88', points: [
      'Previously R903 (2-gamepad cap, named model list). No equivalent rule in this section.' ] },
    { title: 'OPERATOR CONSOLE depth increased', ref: 'Rule R903, p88', points: [
      'Previously R904. Max depth now 1 ft 6 in. (45.7 cm), up from 1 ft 2 in. (35.5 cm).' ] },
  ],
  minor: [
    { title: 'AI chatbot marked "coming soon"', ref: 'Section 1.7.2, p18', points: [] },
    { title: 'Team Updates posting time dropped', ref: 'Section 1.7.3, p19', points: [
      '"Generally posted by 1pm Eastern" no longer stated. Updates published after a driver\'s meeting do not apply to that event.' ] },
    { title: 'Safety glasses grace period simplified', ref: 'Rule E101.A, p33', points: [
      'Two 10-minute exceptions merged into one "10-minute grace period when the venue opens." Banned-footwear examples removed.' ] },
    { title: '"Be Nice" renamed "Be Respectful"', ref: 'Rule E102, p34', points: [
      'Cross-references Section 1.4 instead of the old standalone gracious-and-professional wording.' ] },
    { title: 'Interference rule broadened', ref: 'Rule E102.D, p34', points: [
      'Specific remote-sensing/AprilTag language replaced with "anything that interferes with a ROBOT or the ARENA operations."' ] },
    { title: 'General rules renumbered E105–E116', ref: 'Section 5.1, p34–36', points: [
      'Previously E106–E117. "Make FIRST loud, but with restrictions" retitled "No Loud Music" (E111).' ] },
    { title: '"Things that don\'t belong at events" list updated', ref: 'Rule E108, p35', points: [
      'Walkie-talkies removed. New item banning lights that flash faster than approximately 5 times per second.' ] },
    { title: 'Pit rules retitled and consolidated', ref: 'Rules E502–E601, p38–40', points: [
      '"Stay in your pit" retitled around self-contained setup. "Keep aisles clear" now covers exit pathways. "Secure team identification assets" removed.',
      'ROBOT Carts consolidated from 5 rules (E601–E605) into 1 (E601).' ] },
    { title: 'Interview timer start condition adjusted', ref: 'Rule A206, p50', points: [
      'Starts once judges introduce themselves and the team begins presenting, or the Q&A begins.' ] },
    { title: 'New warning against "build-to-print" vendors', ref: 'Rule R301, p69', points: [] },
    { title: 'Servo modification example changed', ref: 'Rule R504, p77', points: [
      '"Re-programming" example changed to "setting soft limits."' ] },
    { title: 'Main power switch accessibility reworded', ref: 'Rule R603, p79', points: [
      'Previously R609. Now "accessible to the team, away from high-speed moving parts and pinch hazards." May be mounted behind removable panels.' ] },
  ],
};

export const CHANGE_COUNT = Object.values(MANUAL_CHANGES).reduce((n, g) => n + g.length, 0);
