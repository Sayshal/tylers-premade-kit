import './styles/tylers-premade-kit.css';
import { MODULE_ID } from './scripts/constants.mjs';
import { macros } from './scripts/macros/index.mjs';
import * as utils from './scripts/utils/index.mjs';

Hooks.once('init', () => {
  globalThis.TPK = { id: MODULE_ID, utils, macros };
  utils.genericUtils.log('info', `init — ${utils.macroUtils.list().length} macros registered`);
});
