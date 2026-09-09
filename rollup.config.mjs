import { readFileSync } from 'fs';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const isDev = process.env.BUILD === 'development';

const packCopyTargets = JSON.parse(readFileSync('module.json', 'utf8')).packs.map(({ name }) => ({
  src: [`packs/${name}/**`, `!packs/${name}/LOCK`, `!packs/${name}/LOG*`],
  dest: `dist/packs/${name}`
}));

export default {
  /**
   * Suppress circular dependency warnings.
   * @param {object} warning - The rollup warning
   * @param {Function} warn - Default warning handler
   */
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
  input: 'tylers-premade-kit.mjs',
  output: {
    file: 'dist/tylers-premade-kit.mjs',
    format: 'es',
    sourcemap: true,
    inlineDynamicImports: true
  },
  plugins: [
    postcss({
      extract: 'styles/tylers-premade-kit.css',
      minimize: false
    }),
    !isDev &&
      terser({
        format: { comments: false }
      }),
    copy({
      copyOnce: false,
      targets: [
        { src: 'templates', dest: 'dist' },
        { src: 'lang', dest: 'dist' },
        { src: 'module.json', dest: 'dist' },
        { src: 'release_notes.txt', dest: 'dist' },
        { src: 'LICENSE', dest: 'dist' },
        { src: 'README.md', dest: 'dist' },
        ...(process.env.SKIP_PACKS ? [] : packCopyTargets)
      ]
    })
  ]
};
