/**
 * What each person may do in the game, by the role Tellop names for them
 * (`await currentPerson()`, `lib/data/person.js`, kit rule 1). One place for
 * the rule, so every page draws the same controls:
 *
 * - **Owner and Helper**: everything. They add, change and remove players,
 *   and the game keeps their rounds and their Sound choice.
 * - **Member**: adds a player, and nothing else that saves. Online a Member
 *   may change only what they added, and the game cannot tell who added a
 *   player or a player's results, so it draws no Change or Remove and keeps
 *   none of a Member's rounds: a round changes the player's saved results.
 * - **Viewer**: adds, changes and removes nothing. Playing stays: every open
 *   round, the hints, Sound for this visit.
 *
 * A role this file does not know may do nothing that saves. On the Mac and
 * outside Tellop the one person is the owner, so nothing changes there.
 *
 * Pure: no import, so the page, the checks and anything else can read it.
 */

/** The roles Tellop names, as `currentPerson()` answers them. */
export const ROLES = Object.freeze(['owner', 'helper', 'member', 'viewer']);

/**
 * Whether this role may add something new: a player, or a recording kept
 * for a moment to be written down.
 *
 * @param {unknown} role
 */
export function canAdd(role) {
  return role === 'owner' || role === 'helper' || role === 'member';
}

/**
 * Whether this role may change or remove what is saved: a player's name,
 * animal, starting level and Sound, a player, and a player's results (so the
 * game keeps this role's rounds).
 *
 * @param {unknown} role
 */
export function canChange(role) {
  return role === 'owner' || role === 'helper';
}

/**
 * What a page hands its pieces for the person using the game, or for nobody
 * known (`null`: Tellop could not say who it is, so nothing saves).
 *
 * `note` is the word key of the line that tells a person who cannot keep
 * rounds why, or `''`.
 *
 * @param {null | { role: unknown, preview?: unknown }} person
 * @returns {{ canAdd: boolean, canChange: boolean, preview: boolean, note: string }}
 */
export function controlsFor(person) {
  const role = person === null || typeof person !== 'object' ? undefined : person.role;
  const change = canChange(role);
  return {
    canAdd: canAdd(role),
    canChange: change,
    preview: person !== null && typeof person === 'object' && person.preview === true,
    note: person === null || typeof person !== 'object' ? 'math.role.unknown' : change ? '' : 'math.role.notKept',
  };
}
