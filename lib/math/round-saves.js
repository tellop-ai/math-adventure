/**
 * Where the answer to a round's save is shown.
 *
 * A round is saved once, when its tenth question is answered, and the answer
 * can come back after the player has moved on: after Stop (the round screen
 * is gone) or after Play again (a newer round is on the screen). A confirmed
 * save always reaches the player's scores. A refusal is shown on its own
 * round while that round is still on the screen; otherwise it goes to the
 * topics screen's problem line, so a refused round is never shown nowhere,
 * and a newer round never shows an older round's answer as its own.
 *
 * Pure: the caller hands in how a save is sent and where each answer is shown.
 */

/**
 * @template S
 * @param {{
 *   scores: (score: S) => void,
 *   round: (problemKey: string) => void,
 *   late: (problemKey: string) => void,
 * }} show `scores` takes a confirmed score; `round` takes the answer for the
 *   round on the screen (`''` when it was saved); `late` takes a refusal whose
 *   round is no longer on the screen.
 */
export function roundSaves(show) {
  let made = 0;
  let onScreen = 0;

  return {
    /** A new round is on the screen. */
    begin() {
      made += 1;
      onScreen = made;
    },

    /** The round screen is gone. */
    leave() {
      onScreen = 0;
    },

    /**
     * Sends the save of the round on the screen and shows its answer where the
     * player will see it. Never retried here.
     *
     * @param {() => Promise<{ value: S, problem?: undefined } | { value?: undefined, problem: string }>} send
     */
    async save(send) {
      const mine = onScreen;
      const answer = await send();
      const stillHere = mine !== 0 && mine === onScreen;
      if (answer.problem === undefined) {
        show.scores(answer.value);
        if (stillHere) show.round('');
        return;
      }
      if (stillHere) show.round(answer.problem);
      else show.late(answer.problem);
    },
  };
}
