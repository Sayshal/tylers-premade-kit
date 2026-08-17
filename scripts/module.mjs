import { MODULE_ID } from './constants.mjs';
import { macros } from './macros/index.mjs';
import * as utils from './utils/index.mjs';

Hooks.once('init', () => {
  globalThis.TPK = { id: MODULE_ID, utils, macros };
  utils.genericUtils.log('info', `init — ${utils.macroUtils.list().length} macros registered`);
});
