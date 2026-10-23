/**
 * The animals a player can be. Each is a picture the game shows (content, not
 * an icon) and a word key, `math.animal.<key>`, for its name.
 *
 * Pure: nothing here touches stored information or the page.
 */

export const ANIMALS = Object.freeze([
  Object.freeze({ key: 'fox', picture: '🦊' }),
  Object.freeze({ key: 'owl', picture: '🦉' }),
  Object.freeze({ key: 'cat', picture: '🐱' }),
  Object.freeze({ key: 'dog', picture: '🐶' }),
  Object.freeze({ key: 'panda', picture: '🐼' }),
  Object.freeze({ key: 'lion', picture: '🦁' }),
  Object.freeze({ key: 'frog', picture: '🐸' }),
  Object.freeze({ key: 'rabbit', picture: '🐰' }),
  Object.freeze({ key: 'bear', picture: '🐻' }),
  Object.freeze({ key: 'penguin', picture: '🐧' }),
  Object.freeze({ key: 'tiger', picture: '🐯' }),
  Object.freeze({ key: 'koala', picture: '🐨' }),
]);

/** Every animal key. */
export const ANIMAL_KEYS = Object.freeze(ANIMALS.map((animal) => animal.key));

/**
 * The picture for an animal key, or the first animal's for a key the game does
 * not know.
 *
 * @param {string} key
 */
export function animalPicture(key) {
  return (ANIMALS.find((animal) => animal.key === key) ?? ANIMALS[0]).picture;
}
