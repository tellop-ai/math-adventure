/**
 * Whose game this is. The app has one family on one computer and no sign-in, so
 * the owner is one fixed name chosen here on the server. A request never chooses
 * an owner.
 *
 * @returns {string}
 */
export function currentOwner() {
  return 'local-owner';
}
