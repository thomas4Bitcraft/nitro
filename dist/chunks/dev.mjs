import { defineCommand } from 'citty';
import { resolve } from 'pathe';
import { consola } from 'consola';
import { a as createNitro, p as prepare, b as build } from '../shared/nitro.de933615.mjs';
import { c as createDevServer } from '../shared/nitro.9c0245b5.mjs';
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
import 'node:worker_threads';
import 'h3';
import 'http-proxy';
import 'listhen';
import 'serve-placeholder';
import 'serve-static';

const hmrKeyRe = /^runtimeConfig\.|routeRules\./;
const dev = defineCommand({
  meta: {
    name: "dev",
    description: "Start the development server"
  },
  args: {
    ...commonArgs
  },
  async run({ args }) {
    const rootDir = resolve(args.dir || args._dir || ".");
    let nitro;
    const reload = async () => {
      if (nitro) {
        consola.info("Restarting dev server...");
        if ("unwatch" in nitro.options._c12) {
          await nitro.options._c12.unwatch();
        }
        await nitro.close();
      }
      nitro = await createNitro(
        {
          rootDir,
          dev: true,
          preset: "nitro-dev"
        },
        {
          watch: true,
          c12: {
            async onUpdate({ getDiff, newConfig }) {
              const diff = getDiff();
              if (diff.length === 0) {
                return;
              }
              consola.info(
                "Nitro config updated:\n" + diff.map((entry) => `  ${entry.toString()}`).join("\n")
              );
              await (!diff.every((e) => hmrKeyRe.test(e.key)) ? reload() : nitro.updateConfig(newConfig.config));
            }
          }
        }
      );
      nitro.hooks.hookOnce("restart", reload);
      const server = createDevServer(nitro);
      await server.listen({});
      await prepare(nitro);
      await build(nitro);
    };
    await reload();
  }
});

export { dev as default };
