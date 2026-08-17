/**
 * Macro-registry helpers. `TPK.macros` is owned by module.js (a nested
 * `{category: {name: fn}}` object). These helpers expose CPR-style read
 * access so a future swap to `chrisPremades.utils.macroUtils` is a re-export.
 */

/**
 * Resolve a registered macro.
 * @param {string} category - Macro bucket (e.g. "spells").
 * @param {string} name     - camelCase identifier.
 * @returns {Function|null}  Macro function, or null.
 */
export function get(category, name) {
  return globalThis.TPK?.macros?.[category]?.[name] ?? null;
}

/**
 * Flat list of every registered macro.
 * @returns {string[]} `category.name` strings.
 */
export function list() {
  const out = [];
  for (const [cat, entries] of Object.entries(globalThis.TPK?.macros ?? {})) {
    for (const name of Object.keys(entries)) out.push(`${cat}.${name}`);
  }
  return out;
}
