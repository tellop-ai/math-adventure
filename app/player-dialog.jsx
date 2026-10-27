'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

import { t } from '../lib/i18n/index.js';
import { ANIMALS } from '../lib/math/animals.js';
import { MAX_NAME } from '../lib/math/limits.js';
import { sendSave } from '../lib/math/send.js';
import { LEVELS } from '../lib/math/topics.js';

/**
 * Whether an answer from the player addresses is a saved player.
 *
 * @param {any} value
 */
export function isPlayer(value) {
  return Boolean(value)
    && Number.isSafeInteger(value.id)
    && Number.isSafeInteger(value.seat)
    && typeof value.name === 'string'
    && typeof value.animal === 'string'
    && Number.isSafeInteger(value.level)
    && typeof value.soundOn === 'boolean';
}

/**
 * The form inside the window. It lives only while the window is open, so
 * closing the window forgets whatever was typed and not saved.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   player: null | { id: number, name: string, animal: string, level: number, soundOn: boolean },
 *   onSaved: (player: any) => void,
 *   onCancel: () => void,
 * }} props
 */
function PlayerForm({ locale, player, onSaved, onCancel }) {
  const [name, setName] = useState(player?.name ?? '');
  const [animal, setAnimal] = useState(player?.animal ?? ANIMALS[0].key);
  const [level, setLevel] = useState(player?.level ?? 1);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setProblem('');
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setProblem('math.player.nameMissing');
      return;
    }
    if ([...trimmed].length > MAX_NAME) {
      setProblem('math.player.nameHint');
      return;
    }
    setSaving(true);
    const answer = player === null
      ? await sendSave('/api/players/add', { name: trimmed, animal, level }, 'player')
      : await sendSave('/api/players/change', { playerId: player.id, name: trimmed, animal, level, soundOn: player.soundOn }, 'player');
    setSaving(false);
    if (answer.problem !== undefined || !isPlayer(answer.value)) {
      setProblem(answer.problem ?? 'error.saveUnconfirmed');
      return;
    }
    onSaved(answer.value);
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="player-name">{t('math.player.name', locale)}</Label>
          <Input
            id="player-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('math.player.namePlaceholder', locale)}
            autoComplete="off"
            className="h-10 text-base"
          />
          <p className="text-xs text-muted-foreground">{t('math.player.nameHint', locale)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" id="player-animal">{t('math.player.animal', locale)}</span>
          <div className="math-animal-grid" role="group" aria-labelledby="player-animal">
            {ANIMALS.map((choice) => (
              <Button
                key={choice.key}
                type="button"
                variant={choice.key === animal ? 'default' : 'outline'}
                aria-pressed={choice.key === animal}
                aria-label={t(`math.animal.${choice.key}`, locale)}
                title={t(`math.animal.${choice.key}`, locale)}
                className="math-animal-choice"
                onClick={() => setAnimal(choice.key)}
              >
                <span aria-hidden="true">{choice.picture}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="player-level">{t('math.player.level', locale)}</Label>
          <NativeSelect
            id="player-level"
            className="w-full"
            value={String(level)}
            aria-describedby="player-level-hint"
            onChange={(event) => setLevel(Number(event.target.value))}
          >
            {LEVELS.map((entry) => (
              <NativeSelectOption key={entry.level} value={String(entry.level)}>
                {`${t('math.level.name', locale, { level: entry.level })} · ${t(`math.level.hint${entry.level}`, locale)}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p id="player-level-hint" className="text-sm text-muted-foreground">{t('math.player.levelHint', locale)}</p>
        </div>
        {problem !== '' ? <p className="math-problem" role="alert">{t(problem, locale)}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t('math.player.cancel', locale)}</Button>
        <Button type="submit" disabled={saving}>
          {saving ? t('math.player.saving', locale) : t('math.player.save', locale)}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The window that adds a player (`player` is `null`) or changes one. It closes
 * with Cancel or Escape; it has no corner close button, whose words the kit
 * fixes in English. `finalFocus` says where the focus goes when it closes.
 *
 * @param {{
 *   locale: 'en' | 'tr',
 *   open: boolean,
 *   player: null | { id: number, name: string, animal: string, level: number, soundOn: boolean },
 *   onClose: () => void,
 *   onSaved: (player: any) => void,
 *   finalFocus?: boolean | (() => HTMLElement | boolean | null),
 * }} props
 */
export function PlayerDialog({ locale, open, player, onClose, onSaved, finalFocus = true }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md" showCloseButton={false} finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle className="text-lg">
            {player === null ? t('math.player.addTitle', locale) : t('math.home.change', locale, { name: player.name })}
          </DialogTitle>
        </DialogHeader>
        {open ? (
          <PlayerForm
            key={player === null ? 'new' : `player-${player.id}`}
            locale={locale}
            player={player}
            onSaved={onSaved}
            onCancel={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
