import { listPlayersFor, readPlayerFor } from '../lib/data/players.js';
import { getLocale } from '../lib/i18n/index.js';
import { COUNT_CAP } from '../lib/math/limits.js';
import { currentOwner } from '../lib/math/owner.js';

import { PlayerMap } from './player-map.jsx';
import { PlayersHome } from './players-home.jsx';

/**
 * The game's one page: who is playing, or one player's topics (`/?player=3`).
 *
 * `data-tellop-app-marker` is what Tellop's health probe looks for: a page that
 * renders it has really mounted. It stays on the outermost element of the page.
 *
 * The page only reads: the owner's players and their stars, or one player and
 * their results. Nothing is saved while it opens. If the saved players cannot
 * be read, the page still opens and says so.
 */
export const dynamic = 'force-dynamic';

/**
 * The player number in the address, or `null` when there is none or it is
 * not a whole number the store could hold.
 *
 * @param {unknown} value
 */
function chosenPlayer(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(value)) return null;
  const id = Number(value);
  return id <= COUNT_CAP ? id : null;
}

export default async function Page({ searchParams }) {
  const locale = getLocale();
  const owner = currentOwner();
  const playerId = chosenPlayer((await searchParams)?.player);
  let noticeKey = '';

  if (playerId !== null) {
    try {
      const found = await readPlayerFor(owner, playerId);
      if (found !== null) {
        return (
          <main className="math-page" data-tellop-app-marker="ok">
            <PlayerMap locale={locale} player={found.player} scores={found.scores} />
          </main>
        );
      }
      noticeKey = 'math.problem.noPlayer';
    } catch {
      noticeKey = 'math.home.notReadable';
    }
  }

  let players = [];
  try {
    players = await listPlayersFor(owner);
  } catch {
    noticeKey = 'math.home.notReadable';
  }

  return (
    <main className="math-page" data-tellop-app-marker="ok">
      <PlayersHome locale={locale} players={players} noticeKey={noticeKey} />
    </main>
  );
}
