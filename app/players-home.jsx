'use client';

import { useRef, useState } from 'react';
import { Crown, Medal, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { t } from '../lib/i18n/index.js';
import { cn } from '../lib/utils.js';
import { animalPicture } from '../lib/math/animals.js';
import { MAX_PLAYERS } from '../lib/math/limits.js';
import { LANDS, progressOf } from '../lib/math/path.js';
import { sendSave } from '../lib/math/send.js';

import { levelName } from './math-pieces.jsx';
import { PlayerDialog } from './player-dialog.jsx';

/**
 * Where a player stands on the path, from their starting level and the best
 * stars of each round they played (`listPlayersFor`'s `best`).
 *
 * @param {{ level: number, best: Record<string, number> }} player
 */
function placeOf(player) {
  return progressOf(player.level, Object.fromEntries(Object.entries(player.best).map(([id, stars]) => [id, { bestStars: stars }])));
}

/**
 * The first screen: who is playing. One card per player, an "Add a player"
 * card while there is room, and a welcome card when nobody is here yet. A
 * card shows where the player stands on the path: their current level and its
 * land, how many of its six points are done, their stars and badges, and a
 * crown once the adventure is finished.
 *
 * Saving happens only on a press: Save in the player window, or Remove in the
 * question that asks first. The list on screen follows each confirmed save.
 *
 * When the button that opened a window is gone after its save, the focus goes
 * to a heading rather than to the top of the page: the page heading after a
 * remove, and the new player's name after the add that made the first card or
 * filled the last place.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   players: Array<{ id: number, seat: number, name: string, animal: string, level: number, soundOn: boolean, stars: number, best: Record<string, number> }>,
 *   noticeKey: string,
 * }} props
 */
export function PlayersHome({ locale, players: savedPlayers, noticeKey }) {
  const [players, setPlayers] = useState(savedPlayers);
  const [editing, setEditing] = useState(/** @type {null | 'new' | number} */ (null));
  const [removing, setRemoving] = useState(/** @type {null | number} */ (null));
  const [removeProblem, setRemoveProblem] = useState('');
  const [removingNow, setRemovingNow] = useState(false);
  const [line, setLine] = useState('');
  const heading = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const names = useRef(/** @type {Map<number, HTMLElement>} */ (new Map()));
  const focusAfterClose = useRef(/** @type {null | (() => HTMLElement | null | undefined)} */ (null));

  const editedPlayer = typeof editing === 'number' ? players.find((player) => player.id === editing) ?? null : null;
  const removedPlayer = removing === null ? null : players.find((player) => player.id === removing) ?? null;
  const room = players.length < MAX_PLAYERS;

  /** Where the focus goes when a window closes: a chosen place once, or where it came from. */
  function closingFocus() {
    const chosen = focusAfterClose.current;
    focusAfterClose.current = null;
    return chosen === null ? true : (chosen() ?? true);
  }

  function saved(player) {
    const isNew = !players.some((entry) => entry.id === player.id);
    if (isNew && (players.length === 0 || players.length + 1 >= MAX_PLAYERS)) {
      focusAfterClose.current = () => names.current.get(player.id) ?? heading.current;
    }
    setLine('');
    setPlayers((list) => {
      const found = list.find((entry) => entry.id === player.id);
      const next = found
        ? list.map((entry) => (entry.id === player.id ? { ...entry, ...player } : entry))
        : [...list, { ...player, stars: 0, best: {} }];
      return next.sort((a, b) => a.seat - b.seat);
    });
    setEditing(null);
  }

  async function remove() {
    if (removedPlayer === null || removingNow) return;
    setRemoveProblem('');
    setRemovingNow(true);
    const answer = await sendSave('/api/players/remove', { playerId: removedPlayer.id }, 'removed');
    setRemovingNow(false);
    if (answer.problem !== undefined && answer.problem !== 'math.problem.noPlayer') {
      setRemoveProblem(answer.problem);
      return;
    }
    setPlayers((list) => list.filter((entry) => entry.id !== removedPlayer.id));
    setLine(t('math.home.removed', locale, { name: removedPlayer.name }));
    focusAfterClose.current = () => heading.current;
    setRemoving(null);
  }

  return (
    <div className="math-shell">
      <header className="math-head">
        <h1 className="math-title" ref={heading} tabIndex={-1}>{t('app.title', locale)}</h1>
        <p className="math-lead">{t('math.home.lead', locale)}</p>
      </header>

      {noticeKey !== '' ? <p className="math-problem" role="alert">{t(noticeKey, locale)}</p> : null}
      {/* Always in place, so the words are said when they change. */}
      <p className={line !== '' ? 'math-note' : 'sr-only'} role="status">{line}</p>

      {players.length === 0 ? (
        <Card className="math-welcome">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <span className="math-avatar math-avatar-big rounded-full" aria-hidden="true">🦉</span>
            <h2 className="text-2xl">{t('math.home.welcome', locale)}</h2>
            <p className="text-muted-foreground">{t('math.home.welcomeBody', locale)}</p>
            <Button size="lg" className="math-big-button" onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              {t('math.home.addFirst', locale)}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="math-player-grid">
          {players.map((player) => {
            const place = placeOf(player);
            const current = place.levels[place.current - 1];
            const done = current.points.filter((point) => point.state === 'done').length;
            return (
              <li key={player.id}>
                <Card className="math-player-card">
                  <CardContent className="flex flex-col items-center gap-2 text-center">
                    <span className="math-avatar rounded-full" aria-hidden="true">{animalPicture(player.animal)}</span>
                    <h2
                      className="math-player-name"
                      tabIndex={-1}
                      ref={(node) => {
                        if (node) names.current.set(player.id, node);
                        else names.current.delete(player.id);
                      }}
                    >
                      {player.name}
                    </h2>
                    <p className="math-player-level">
                      <span aria-hidden="true">{LANDS[place.current - 1].picture}</span>
                      {levelName(place.current, locale)}
                    </p>
                    <p className="text-sm text-muted-foreground">{t(`math.level.hint${place.current}`, locale)}</p>
                    {place.finished ? (
                      <p className="math-star-count">
                        <Crown aria-hidden="true" className="math-crown" />
                        {t('math.home.finished', locale)}
                      </p>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <span className="math-dots" aria-hidden="true">
                          {current.points.map((point) => <span key={point.id} className="math-dot rounded-full" data-done={point.state === 'done' ? 'yes' : 'no'} />)}
                        </span>
                        <span className="text-sm">{t('math.home.done', locale, { done, total: current.points.length })}</span>
                      </div>
                    )}
                    <p className="math-card-counts">
                      <span className="math-star-count">
                        <Star aria-hidden="true" className="math-star math-star-on" />
                        {t('math.home.stars', locale, { count: player.stars })}
                      </span>
                      <span className="math-star-count">
                        <Medal aria-hidden="true" className="math-medal" />
                        {t('math.home.badges', locale, { count: place.badges })}
                      </span>
                    </p>
                    <a
                      href={`/?player=${player.id}`}
                      className={cn(buttonVariants({ size: 'lg' }), 'math-big-button w-full')}
                      aria-label={t('math.home.playAs', locale, { name: player.name })}
                    >
                      {t('math.home.play', locale)}
                    </a>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('math.home.change', locale, { name: player.name })}
                        title={t('math.home.change', locale, { name: player.name })}
                        onClick={() => setEditing(player.id)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('math.home.remove', locale, { name: player.name })}
                        title={t('math.home.remove', locale, { name: player.name })}
                        onClick={() => { setRemoveProblem(''); setRemoving(player.id); }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
          {room ? (
            <li>
              <Button variant="outline" className="math-add-card" onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" className="size-8" />
                {t('math.home.add', locale)}
              </Button>
            </li>
          ) : null}
        </ul>
      )}

      {players.length > 0 && !room ? <p className="math-note">{t('math.home.full', locale)}</p> : null}
      <p className="math-note">{t('math.home.private', locale)}</p>

      <PlayerDialog
        locale={locale}
        open={editing !== null}
        player={editedPlayer}
        onClose={() => setEditing(null)}
        onSaved={saved}
        finalFocus={closingFocus}
      />

      <AlertDialog open={removedPlayer !== null} onOpenChange={(next) => { if (!next) setRemoving(null); }}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" finalFocus={closingFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>{removedPlayer ? t('math.player.removeTitle', locale, { name: removedPlayer.name }) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{t('math.player.removeBody', locale)}</AlertDialogDescription>
          </AlertDialogHeader>
          {removeProblem !== '' ? <p className="math-problem" role="alert">{t(removeProblem, locale)}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('math.player.cancel', locale)}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={removingNow} onClick={remove}>
              {t('math.player.removeAction', locale)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
