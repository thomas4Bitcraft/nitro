import { defineCommand } from 'citty';
import { resolve } from 'pathe';
import { a as createNitro, p as prepare, c as copyPublicAssets, b as build$1 } from '../shared/nitro.de933615.mjs';
import { p as prerender } from '../shared/nitro.bb7996ad.mjs';
import { c as commonArgs } from '../shared/nitro.1d09f0ca.mjs';
import 'node:fs';
import 'pathe/utils';
import 'rollup';
import 'fs-extra';
import 'defu';
import 'chokidar';
import 'knitwork';
import 'perfect-debounce';
import 'globby';
import 'pretty-bytes';
import 'gzip-size';
import 'chalk';
import 'std-env';
import 'node:url';
import 'node:module';
import '@rollup/plugin-commonjs';
import '@rollup/plugin-node-resolve';
import '@rollup/plugin-alias';
import '@rollup/plugin-json';
import '@rollup/plugin-wasm';
import '@rollup/plugin-inject';
import 'rollup-plugin-visualizer';
import 'unenv';
import 'mlly';
import 'unimport/unplugin';
import 'ohash';
import '@rollup/plugin-replace';
import 'node:os';
import '@vercel/nft';
import 'semver';
import 'consola';
import 'etag';
import 'mime';
import 'unstorage';
import 'esbuild';
import '@rollup/pluginutils';
import 'node:zlib';
import 'node:fs/promises';
import 'hookable';
import 'unimport';
import 'c12';
import 'klona/full';
import 'scule';
import 'escape-string-regexp';
import 'ufo';
import 'pkg-types';
import 'jiti';
import 'dot-prop';
import 'archiver';
import 'radix3';

const build = defineCommand({
  meta: {
    name: "build",
    description: "Build nitro project for production"
  },
  args: {
    ...commonArgs
  },
  async run({ args }) {
    const rootDir = resolve(args.dir || args._dir || ".");
    const nitro = await createNitro({
      rootDir,
      dev: false
    });
    await prepare(nitro);
    await copyPublicAssets(nitro);
    await prerender(nitro);
    await build$1(nitro);
    await nitro.close();
  }
});

export { build as default };
