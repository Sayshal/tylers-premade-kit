import { MODULE_ID } from '../constants.mjs';

/**
 * TPK identifier on a document.
 * @param {Document|object} entity - Foundry document (Item, ActiveEffect, etc.).
 * @returns {string|null} The `flags.tyler-premade-kit.info.identifier`, or null.
 */
export function getIdentifier(entity) {
  return entity?.flags?.[MODULE_ID]?.info?.identifier ?? null;
}

/**
 * UI notification convenience.
 * @param {string} message - Body text.
 * @param {"info"|"warn"|"error"} [type] - Notification severity.
 */
export function notify(message, type = 'info') {
  ui.notifications?.[type]?.(message);
}

/**
 * Dev-gated log. Toggle via `CONFIG.debug["tyler-premade-kit"] = true`.
 * @param {"info"|"warn"|"error"} level - Console method to use.
 * @param {string} message              - Log line.
 * @param {...any} args                 - Extra args passed through to console.
 */
export function log(level, message, ...args) {
  if (!CONFIG?.debug?.[MODULE_ID]) return;
  console[level === 'error' ? 'error' : 'log'](`${MODULE_ID} | ${message}`, ...args);
}
