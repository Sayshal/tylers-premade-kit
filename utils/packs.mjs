import fs from 'fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import logger from 'fancy-log';
import YAML from 'js-yaml';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { compilePack, extractPack } from '@foundryvtt/foundryvtt-cli';

/**
 * Folder where compiled compendium packs live.
 * @type {string}
 */
const PACK_DEST = 'packs';

/**
 * Folder where source YAML files live.
 * @type {string}
 */
const PACK_SRC = 'packs/_source';

// eslint-disable-next-line
const argv = yargs(hideBin(process.argv)).command(packageCommand()).help().alias('help', 'h').argv;

/** Yargs command spec. */
function packageCommand() {
  return {
    command: 'package [action] [pack] [entry]',
    describe: 'Manage packages',
    builder: (yargs) => {
      yargs.positional('action', {
        describe: 'The action to perform.',
        type: 'string',
        choices: ['unpack', 'pack', 'clean']
      });
      yargs.positional('pack', {
        describe: 'Name of the pack upon which to work.',
        type: 'string'
      });
      yargs.positional('entry', {
        describe: 'Name of a single entry within a pack (clean/extract only).',
        type: 'string'
      });
    },
    handler: async (argv) => {
      const { action, pack, entry } = argv;
      switch (action) {
        case 'clean':
          return cleanPacks(pack, entry);
        case 'pack':
          return compilePacks(pack);
        case 'unpack':
          return extractPacks(pack, entry);
      }
    }
  };
}

/* ----------------------------------------- */
/*  Clean Packs                              */
/* ----------------------------------------- */

/**
 * Strip unwanted flags, permissions, defaults from an entry before extract/compile.
 * @param {object} data                           Single entry to clean.
 * @param {object} [options]
 * @param {boolean} [options.clearSourceId]  Delete core sourceId.
 * @param {number} [options.ownership]          Reset default ownership.
 */
function cleanPackEntry(data, { clearSourceId = true, ownership = 0 } = {}) {
  if (data.ownership) data.ownership = { default: ownership };
  if (clearSourceId) {
    delete data._stats?.compendiumSource;
    delete data.flags?.core?.sourceId;
  }
  delete data.flags?.importSource;
  delete data.flags?.exportSource;
  if (data._stats?.lastModifiedBy) data._stats.lastModifiedBy = 'tpkbuilder0000000';

  if (!data.flags) data.flags = {};
  Object.entries(data.flags).forEach(([key, contents]) => {
    if (Object.keys(contents).length === 0) delete data.flags[key];
  });

  if (data.system?.activation?.cost === 0) data.system.activation.cost = null;
  if (data.system?.duration?.value === '0') data.system.duration.value = '';
  if (data.system?.target?.value === 0) data.system.target.value = null;
  if (data.system?.target?.width === 0) data.system.target.width = null;
  if (data.system?.range?.value === 0) data.system.range.value = null;
  if (data.system?.range?.long === 0) data.system.range.long = null;
  if (data.system?.uses?.value === 0) data.system.uses.value = null;
  if (data.system?.uses?.max === '0') data.system.uses.max = '';
  if (data.system?.save?.dc === 0) data.system.save.dc = null;
  if (data.system?.capacity?.value === 0) data.system.capacity.value = null;
  if (data.system?.strength === 0) data.system.strength = null;

  if (['character', 'npc'].includes(data.type) && data.img === 'icons/svg/mystery-man.svg') {
    data.img = '';
    if (data.prototypeToken?.texture) data.prototypeToken.texture.src = '';
  }

  if (data.effects) data.effects.forEach((i) => cleanPackEntry(i, { clearSourceId: false }));
  if (data.items) data.items.forEach((i) => cleanPackEntry(i, { clearSourceId: false }));
  if (data.pages) data.pages.forEach((i) => cleanPackEntry(i, { ownership: -1 }));
  if (data.system?.description?.value) data.system.description.value = cleanString(data.system.description.value);
  if (data.label) data.label = cleanString(data.label);
  if (data.name) data.name = cleanString(data.name);
}

/**
 * Strip invisible whitespace, normalize quotes.
 * @param str
 */
function cleanString(str) {
  return str.replace(/⁠/gu, '').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"');
}

/**
 * Clean source YAML files in-place.
 * @param {string} [packName]
 * @param {string} [entryName]
 */
async function cleanPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter((file) => file.isDirectory() && (!packName || packName === file.name));

  async function* _walkDir(directoryPath) {
    const directory = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of directory) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) yield* _walkDir(entryPath);
      else if (path.extname(entry.name) === '.yml') yield entryPath;
    }
  }

  for (const folder of folders) {
    logger.info(`Cleaning pack ${folder.name}`);
    for await (const src of _walkDir(path.join(PACK_SRC, folder.name))) {
      const data = YAML.load(await readFile(src, { encoding: 'utf8' }));
      if (entryName && entryName !== data.name.toLowerCase()) continue;
      if (!data._id || !data._key) {
        console.log(`Failed to clean \x1b[31m${src}\x1b[0m, must have _id and _key.`);
        continue;
      }
      cleanPackEntry(data);
      fs.rmSync(src, { force: true });
      writeFile(src, `${YAML.dump(data)}\n`, { mode: 0o664 });
    }
  }
}

/* ----------------------------------------- */
/*  Compile Packs                            */
/* ----------------------------------------- */

/**
 * Compile source files into LevelDB packs.
 * @param {string} [packName]
 */
async function compilePacks(packName) {
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter((file) => file.isDirectory() && (!packName || packName === file.name));

  for (const folder of folders) {
    const src = path.join(PACK_SRC, folder.name);
    const dest = path.join(PACK_DEST, folder.name);
    // Skip empty source dirs — abstract-level iterator races on close when there's nothing to write.
    const hasYaml = fs.readdirSync(src).some((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    if (!hasYaml) {
      logger.info(`Skipping empty pack ${folder.name}`);
      continue;
    }
    logger.info(`Compiling pack ${folder.name}`);
    try {
      await compilePack(src, dest, { recursive: true, log: true, transformEntry: cleanPackEntry, yaml: true });
    } catch (err) {
      // foundryvtt-cli classic-level cleanup races on iterator close after successful writes.
      // The pack data is already written; swallow the post-write LEVEL_ITERATOR_NOT_OPEN error.
      if (err?.code !== 'LEVEL_ITERATOR_NOT_OPEN') throw err;
      logger.info(`(ignoring cli iterator-close race for ${folder.name})`);
    }
  }
  // Give LevelDB a tick to flush any pending close handlers before Node exits.
  await new Promise((resolve) => setImmediate(resolve));
}

/* ----------------------------------------- */
/*  Extract Packs                            */
/* ----------------------------------------- */

/**
 * Extract LevelDB packs into source YAML.
 * @param {string} [packName]
 * @param {string} [entryName]
 */
async function extractPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();
  const moduleJson = JSON.parse(fs.readFileSync('./module.json', { encoding: 'utf8' }));
  const packs = moduleJson.packs.filter((p) => !packName || p.name === packName);

  for (const packInfo of packs) {
    const dest = path.join(PACK_SRC, packInfo.name);
    logger.info(`Extracting pack ${packInfo.name}`);

    const folders = {};
    const containers = {};
    await extractPack(packInfo.path, dest, {
      log: false,
      transformEntry: (e) => {
        if (e._key.startsWith('!folders')) folders[e._id] = { name: slugify(e.name), folder: e.folder };
        else if (e.type === 'container')
          containers[e._id] = {
            name: slugify(e.name),
            container: e.system?.container,
            folder: e.folder
          };
        return false;
      }
    });
    const buildPath = (collection, entry, parentKey) => {
      let parent = collection[entry[parentKey]];
      entry.path = entry.name;
      while (parent) {
        entry.path = path.join(parent.name, entry.path);
        parent = collection[parent[parentKey]];
      }
    };
    Object.values(folders).forEach((f) => buildPath(folders, f, 'folder'));
    Object.values(containers).forEach((c) => {
      buildPath(containers, c, 'container');
      const folder = folders[c.folder];
      if (folder) c.path = path.join(folder.path, c.path);
    });

    await extractPack(packInfo.path, dest, {
      log: true,
      transformEntry: (entry) => {
        if (entryName && entryName !== entry.name.toLowerCase()) return false;
        cleanPackEntry(entry);
      },
      transformName: (entry) => {
        if (entry._id in folders) return path.join(folders[entry._id].path, '_folder.yml');
        if (entry._id in containers) return path.join(containers[entry._id].path, '_container.yml');
        const outputName = slugify(entry.name);
        const parent = containers[entry.system?.container] ?? folders[entry.folder];
        return path.join(parent?.path ?? '', `${outputName}.yml`);
      },
      yaml: true
    });
  }
}

/**
 * Standardize a name to a filename slug.
 * @param name
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace("'", '')
    .replace(/[^\da-z]+/gi, ' ')
    .trim()
    .replace(/\s+|-{2,}/g, '-');
}
