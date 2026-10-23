/**
 * The order of a player's quick saves from the topics screen: the level
 * buttons and Sound, which a child can press several times in a row.
 *
 * The screen shows each press at once. Saves go out one after another; a
 * press made while an earlier save is still on its way replaces any save not
 * sent yet, and the newest one sends every field as the screen shows it. When
 * the newest save is refused, the screen goes back to what was last confirmed
 * saved, never to a value nobody saved.
 *
 * Pure: the caller hands in how a save is sent and how the screen is shown.
 */

/**
 * @template {object} P
 * @param {P} saved the player as saved
 * @param {(wanted: P) => Promise<{ value: P, problem?: undefined } | { value?: undefined, problem: string }>} send
 * @param {(shown: P, problemKey: string) => void} show
 */
export function playerSaves(saved, send, show) {
  let confirmed = saved;
  let latest = saved;
  let newest = 0;
  let chain = Promise.resolve();

  /**
   * Shows the change and queues its save. Answers a promise that settles when
   * this save, or the newer one that replaced it, has its answer.
   *
   * @param {Partial<P>} fields
   * @param {string} failureKey the words when this save is refused
   */
  function change(fields, failureKey) {
    latest = { ...latest, ...fields };
    const mine = ++newest;
    show(latest, '');
    chain = chain.then(async () => {
      if (mine !== newest) return;
      const answer = await send(latest);
      if (answer.problem === undefined) {
        confirmed = answer.value;
        return;
      }
      if (mine !== newest) return;
      latest = confirmed;
      show(latest, answer.problem === 'math.problem.noPlayer' ? answer.problem : failureKey);
    });
    return chain;
  }

  return { change };
}
