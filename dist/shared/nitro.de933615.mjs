import { promises, existsSync, createWriteStream } from 'node:fs';
import { resolve, dirname, relative, normalize, isAbsolute, join, extname } from 'pathe';
import { resolveAlias } from 'pathe/utils';
import * as rollup from 'rollup';
import fse from 'fs-extra';
import { defu } from 'defu';
import { watch } from 'chokidar';
import { genSafeVariableName, genImport, genTypeImport } from 'knitwork';
import { debounce } from 'perfect-debounce';
import { globby } from 'globby';
import prettyBytes from 'pretty-bytes';
import { gzipSize } from 'gzip-size';
import chalk from 'chalk';
import { isTest, provider, isWindows, isDebug } from 'std-env';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, builtinModules } from 'node:module';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import wasmPlugin from '@rollup/plugin-wasm';
import inject from '@rollup/plugin-inject';
import { visualizer } from 'rollup-plugin-visualizer';
import * as unenv from 'unenv';
import { isValidNodeImport, normalizeid, resolvePath as resolvePath$1, sanitizeFilePath, resolveModuleExportNames } from 'mlly';
import unimportPlugin from 'unimport/unplugin';
import { hash } from 'ohash';
import _replace from '@rollup/plugin-replace';
import { platform } from 'node:os';
import { nodeFileTrace } from '@vercel/nft';
import semver from 'semver';
import { consola } from 'consola';
import createEtag from 'etag';
import mime from 'mime';
import { normalizeKey, builtinDrivers, createStorage as createStorage$1 } from 'unstorage';
import { transform } from 'esbuild';
import { createFilter } from '@rollup/pluginutils';
import zlib from 'node:zlib';
import fsp, { readFile } from 'node:fs/promises';
import { createHooks, createDebugger } from 'hookable';
import { createUnimport } from 'unimport';
import { watchConfig, loadConfig } from 'c12';
import { klona } from 'klona/full';
import { camelCase } from 'scule';
import escapeRE from 'escape-string-regexp';
import { withLeadingSlash, withoutTrailingSlash, withBase, joinURL, withoutLeadingSlash, withTrailingSlash } from 'ufo';
import { readPackageJSON, findWorkspaceDir } from 'pkg-types';
import 'jiti';
import { getProperty } from 'dot-prop';
import archiver from 'archiver';

async function generateFSTree(dir) {
  if (isTest) {
    return;
  }
  const files = await globby("**/*.*", { cwd: dir, ignore: ["*.map"] });
  const items = (await Promise.all(
    files.map(async (file) => {
      const path = resolve(dir, file);
      const src = await promises.readFile(path);
      const size = src.byteLength;
      const gzip = await gzipSize(src);
      return { file, path, size, gzip };
    })
  )).sort((a, b) => a.path.localeCompare(b.path));
  let totalSize = 0;
  let totalGzip = 0;
  let totalNodeModulesSize = 0;
  let totalNodeModulesGzip = 0;
  let treeText = "";
  for (const [index, item] of items.entries()) {
    dirname(item.file);
    const rpath = relative(process.cwd(), item.path);
    const treeChar = index === items.length - 1 ? "\u2514\u2500" : "\u251C\u2500";
    const isNodeModules = item.file.includes("node_modules");
    if (isNodeModules) {
      totalNodeModulesSize += item.size;
      totalNodeModulesGzip += item.gzip;
      continue;
    }
    treeText += chalk.gray(
      `  ${treeChar} ${rpath} (${prettyBytes(item.size)}) (${prettyBytes(
        item.gzip
      )} gzip)
`
    );
    totalSize += item.size;
    totalGzip += item.gzip;
  }
  treeText += `${chalk.cyan("\u03A3 Total size:")} ${prettyBytes(
    totalSize + totalNodeModulesSize
  )} (${prettyBytes(totalGzip + totalNodeModulesGzip)} gzip)
`;
  return treeText;
}

function hl(str) {
  return chalk.cyan(str);
}
function prettyPath(p, highlight = true) {
  p = relative(process.cwd(), p);
  return highlight ? hl(p) : p;
}
function compileTemplate(contents) {
  return (params) => contents.replace(/{{ ?([\w.]+) ?}}/g, (_, match) => {
    const val = getProperty(params, match);
    if (!val) {
      consola.warn(
        `cannot resolve template param '${match}' in ${contents.slice(0, 20)}`
      );
    }
    return val || `${match}`;
  });
}
async function writeFile$1(file, contents, log = false) {
  await fsp.mkdir(dirname(file), { recursive: true });
  await fsp.writeFile(
    file,
    contents,
    typeof contents === "string" ? "utf8" : void 0
  );
  if (log) {
    consola.info("Generated", prettyPath(file));
  }
}
function resolvePath(path, nitroOptions, base) {
  if (typeof path !== "string") {
    throw new TypeError("Invalid path: " + path);
  }
  path = compileTemplate(path)(nitroOptions);
  for (const base2 in nitroOptions.alias) {
    if (path.startsWith(base2)) {
      path = nitroOptions.alias[base2] + path.slice(base2.length);
    }
  }
  return resolve(base || nitroOptions.srcDir, path);
}
function resolveFile(path, base = ".", extensions = [".js", ".ts", ".mjs", ".cjs", ".json"]) {
  path = resolve(base, path);
  if (existsSync(path)) {
    return path;
  }
  for (const ext of extensions) {
    const p = path + ext;
    if (existsSync(p)) {
      return p;
    }
  }
}
const autodetectableProviders = {
  azure_static: "azure",
  cloudflare_pages: "cloudflare-pages",
  netlify: "netlify",
  stormkit: "stormkit",
  vercel: "vercel",
  cleavr: "cleavr"
};
const autodetectableStaticProviders = {
  netlify: "netlify-static",
  vercel: "vercel-static"
};
function detectTarget(options = {}) {
  return options?.static ? autodetectableStaticProviders[provider] : autodetectableProviders[provider];
}
async function isDirectory(path) {
  try {
    return (await fsp.stat(path)).isDirectory();
  } catch {
    return false;
  }
}
createRequire(import.meta.url);
function resolveAliases(_aliases) {
  const aliases = Object.fromEntries(
    Object.entries(_aliases).sort(
      ([a], [b]) => b.split("/").length - a.split("/").length || b.length - a.length
    )
  );
  for (const key in aliases) {
    for (const alias in aliases) {
      if (!["~", "@", "#"].includes(alias[0])) {
        continue;
      }
      if (alias === "@" && !aliases[key].startsWith("@/")) {
        continue;
      }
      if (aliases[key].startsWith(alias)) {
        aliases[key] = aliases[alias] + aliases[key].slice(alias.length);
      }
    }
  }
  return aliases;
}
async function retry(fn, retries) {
  let retry2 = 0;
  let error;
  while (retry2++ < retries) {
    try {
      return await fn();
    } catch (err) {
      error = err;
      await new Promise((resolve2) => setTimeout(resolve2, 2));
    }
  }
  throw error;
}
function provideFallbackValues(obj) {
  for (const key in obj) {
    if (typeof obj[key] === "undefined" || obj[key] === null) {
      obj[key] = "";
    } else if (typeof obj[key] === "object") {
      provideFallbackValues(obj[key]);
    }
  }
}

let distDir = dirname(fileURLToPath(import.meta.url));
if (/(chunks|shared)$/.test(distDir)) {
  distDir = dirname(distDir);
}
const pkgDir = resolve(distDir, "..");
const runtimeDir = resolve(distDir, "runtime");

const NO_REPLACE_RE = /ROLLUP_NO_REPLACE/;
function replace(options) {
  const _plugin = _replace(options);
  return {
    ..._plugin,
    // https://github.com/rollup/plugins/blob/master/packages/replace/src/index.js#L94
    renderChunk(code, chunk, options2) {
      if (!NO_REPLACE_RE.test(code)) {
        return _plugin.renderChunk.call(
          this,
          code,
          chunk,
          options2
        );
      }
    }
  };
}

const PREFIX = "\0virtual:";
function virtual(modules, cache = {}) {
  const _modules = /* @__PURE__ */ new Map();
  for (const [id, mod] of Object.entries(modules)) {
    cache[id] = mod;
    _modules.set(id, mod);
    _modules.set(resolve(id), mod);
  }
  return {
    name: "virtual",
    resolveId(id, importer) {
      if (id in modules) {
        return PREFIX + id;
      }
      if (importer) {
        const importerNoPrefix = importer.startsWith(PREFIX) ? importer.slice(PREFIX.length) : importer;
        const resolved = resolve(dirname(importerNoPrefix), id);
        if (_modules.has(resolved)) {
          return PREFIX + resolved;
        }
      }
      return null;
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) {
        return null;
      }
      const idNoPrefix = id.slice(PREFIX.length);
      if (!_modules.has(idNoPrefix)) {
        return null;
      }
      let m = _modules.get(idNoPrefix);
      if (typeof m === "function") {
        m = await m();
      }
      cache[id.replace(PREFIX, "")] = m;
      return {
        code: m,
        map: null
      };
    }
  };
}

const PLUGIN_NAME = "dynamic-require";
const HELPER_DYNAMIC = `\0${PLUGIN_NAME}.mjs`;
const DYNAMIC_REQUIRE_RE = /import\("\.\/" ?\+(.*)\).then/g;
function dynamicRequire({ dir, ignore, inline }) {
  return {
    name: PLUGIN_NAME,
    transform(code, _id) {
      return {
        code: code.replace(
          DYNAMIC_REQUIRE_RE,
          `import('${HELPER_DYNAMIC}').then(r => r.default || r).then(dynamicRequire => dynamicRequire($1)).then`
        ),
        map: null
      };
    },
    resolveId(id) {
      return id === HELPER_DYNAMIC ? id : null;
    },
    // TODO: Async chunk loading over network!
    // renderDynamicImport () {
    //   return {
    //     left: 'fetch(', right: ')'
    //   }
    // },
    async load(_id) {
      if (_id !== HELPER_DYNAMIC) {
        return null;
      }
      let files = [];
      try {
        const wpManifest = resolve(dir, "./server.manifest.json");
        files = await import(pathToFileURL(wpManifest).href).then(
          (r) => Object.keys(r.files).filter((file) => !ignore.includes(file))
        );
      } catch {
        files = await globby("**/*.{cjs,mjs,js}", {
          cwd: dir,
          absolute: false,
          ignore
        });
      }
      const chunks = (await Promise.all(
        files.map(async (id) => ({
          id,
          src: resolve(dir, id).replace(/\\/g, "/"),
          name: genSafeVariableName(id),
          meta: await getWebpackChunkMeta(resolve(dir, id))
        }))
      )).filter((chunk) => chunk.meta);
      return inline ? TMPL_INLINE({ chunks }) : TMPL_LAZY({ chunks });
    }
  };
}
async function getWebpackChunkMeta(src) {
  const chunk = await import(pathToFileURL(src).href).then(
    (r) => r.default || r || {}
  );
  const { id, ids, modules } = chunk;
  if (!id && !ids) {
    return null;
  }
  return {
    id,
    ids,
    moduleIds: Object.keys(modules || {})
  };
}
function TMPL_INLINE({ chunks }) {
  return `${chunks.map((i) => `import * as ${i.name} from '${i.src}'`).join("\n")}
const dynamicChunks = {
  ${chunks.map((i) => ` ['${i.id}']: ${i.name}`).join(",\n")}
};

export default function dynamicRequire(id) {
  return Promise.resolve(dynamicChunks[id]);
};`;
}
function TMPL_LAZY({ chunks }) {
  return `
const dynamicChunks = {
${chunks.map((i) => ` ['${i.id}']: () => import('${i.src}')`).join(",\n")}
};

export default function dynamicRequire(id) {
  return dynamicChunks[id]();
};`;
}

function externals$1(opts) {
  const trackedExternals = /* @__PURE__ */ new Set();
  const _resolveCache = /* @__PURE__ */ new Map();
  const _resolve = async (id) => {
    let resolved = _resolveCache.get(id);
    if (resolved) {
      return resolved;
    }
    resolved = await resolvePath$1(id, {
      conditions: opts.exportConditions,
      url: opts.moduleDirectories
    });
    _resolveCache.set(id, resolved);
    return resolved;
  };
  opts.inline = (opts.inline || []).map((p) => normalize(p));
  opts.external = (opts.external || []).map((p) => normalize(p));
  return {
    name: "node-externals",
    async resolveId(originalId, importer, options) {
      if (!originalId || originalId.startsWith("\0") || originalId.includes("?") || originalId.startsWith("#")) {
        return null;
      }
      if (originalId.startsWith(".")) {
        return null;
      }
      const id = normalize(originalId);
      const idWithoutNodeModules = id.split("node_modules/").pop();
      if (opts.inline.some(
        (i) => id.startsWith(i) || idWithoutNodeModules.startsWith(i)
      )) {
        return null;
      }
      if (opts.external.some(
        (i) => id.startsWith(i) || idWithoutNodeModules.startsWith(i)
      )) {
        return { id, external: true };
      }
      const resolved = await this.resolve(originalId, importer, {
        ...options,
        skipSelf: true
      }) || { id };
      if (!isAbsolute(resolved.id) || !existsSync(resolved.id) || await isDirectory(resolved.id)) {
        resolved.id = await _resolve(resolved.id).catch(() => resolved.id);
      }
      if (!await isValidNodeImport(resolved.id).catch(() => false)) {
        return null;
      }
      if (opts.trace === false) {
        return {
          ...resolved,
          id: isAbsolute(resolved.id) ? normalizeid(resolved.id) : resolved.id,
          external: true
        };
      }
      const { pkgName, subpath } = parseNodeModulePath$1(resolved.id);
      if (!pkgName) {
        return null;
      }
      if (pkgName !== originalId) {
        if (!isAbsolute(originalId)) {
          const fullPath = await _resolve(originalId);
          trackedExternals.add(fullPath);
          return {
            id: originalId,
            external: true
          };
        }
        const packageEntry = await _resolve(pkgName).catch(() => null);
        if (packageEntry !== originalId) {
          const guessedSubpath = pkgName + subpath.replace(/\.[a-z]+$/, "");
          const resolvedGuess = await _resolve(guessedSubpath).catch(
            () => null
          );
          if (resolvedGuess === originalId) {
            trackedExternals.add(resolvedGuess);
            return {
              id: guessedSubpath,
              external: true
            };
          }
          return null;
        }
      }
      trackedExternals.add(resolved.id);
      return {
        id: pkgName,
        external: true
      };
    },
    async buildEnd() {
      if (opts.trace === false) {
        return;
      }
      for (const pkgName of opts.traceInclude || []) {
        const path = await this.resolve(pkgName);
        if (path?.id) {
          trackedExternals.add(path.id.replace(/\?.+/, ""));
        }
      }
      const _fileTrace = await nodeFileTrace(
        [...trackedExternals],
        opts.traceOptions
      );
      const packageJSONCache = /* @__PURE__ */ new Map();
      const getPackageJson = async (pkgDir) => {
        if (packageJSONCache.has(pkgDir)) {
          return packageJSONCache.get(pkgDir);
        }
        const pkgJSON = JSON.parse(
          await promises.readFile(resolve(pkgDir, "package.json"), "utf8")
        );
        packageJSONCache.set(pkgDir, pkgJSON);
        return pkgJSON;
      };
      const _resolveTracedPath = (p) => promises.realpath(resolve(opts.traceOptions.base, p));
      const tracedFiles = Object.fromEntries(
        await Promise.all(
          [..._fileTrace.reasons.entries()].map(async ([_path, reasons]) => {
            if (reasons.ignored) {
              return;
            }
            const path = await _resolveTracedPath(_path);
            if (!path.includes("node_modules")) {
              return;
            }
            if (!await isFile$1(path)) {
              return;
            }
            const { baseDir, pkgName, subpath } = parseNodeModulePath$1(path);
            const pkgPath = join(baseDir, pkgName);
            const parents = await Promise.all(
              [...reasons.parents].map((p) => _resolveTracedPath(p))
            );
            const tracedFile = {
              path,
              parents,
              subpath,
              pkgName,
              pkgPath
            };
            return [path, tracedFile];
          })
        ).then((r) => r.filter(Boolean))
      );
      const tracedPackages = {};
      for (const tracedFile of Object.values(tracedFiles)) {
        const pkgName = tracedFile.pkgName;
        let tracedPackage = tracedPackages[pkgName];
        let pkgJSON = await getPackageJson(tracedFile.pkgPath).catch(
          () => {
          }
          // TODO: Only catch ENOENT
        );
        if (!pkgJSON) {
          pkgJSON = { name: pkgName, version: "0.0.0" };
        }
        if (!tracedPackage) {
          tracedPackage = {
            name: pkgName,
            versions: {}
          };
          tracedPackages[pkgName] = tracedPackage;
        }
        let tracedPackageVersion = tracedPackage.versions[pkgJSON.version];
        if (!tracedPackageVersion) {
          tracedPackageVersion = {
            path: tracedFile.pkgPath,
            files: [],
            pkgJSON
          };
          tracedPackage.versions[pkgJSON.version] = tracedPackageVersion;
        }
        tracedPackageVersion.files.push(tracedFile.path);
        tracedFile.pkgName = pkgName;
        tracedFile.pkgVersion = pkgJSON.version;
      }
      const writePackage = async (name, version, outputName) => {
        const pkg = tracedPackages[name];
        for (const src of pkg.versions[version].files) {
          const { subpath } = parseNodeModulePath$1(src);
          const dst = join(
            opts.outDir,
            "node_modules",
            outputName || pkg.name,
            subpath
          );
          await promises.mkdir(dirname(dst), { recursive: true });
          await promises.copyFile(src, dst);
        }
        const pkgJSON = pkg.versions[version].pkgJSON;
        applyProductionCondition(pkgJSON.exports);
        const pkgJSONPath = join(
          opts.outDir,
          "node_modules",
          outputName || pkg.name,
          "package.json"
        );
        await promises.mkdir(dirname(pkgJSONPath), { recursive: true });
        await promises.writeFile(
          pkgJSONPath,
          JSON.stringify(pkgJSON, null, 2),
          "utf8"
        );
      };
      const isWindows = platform() === "win32";
      const linkPackage = async (from, to) => {
        const src = join(opts.outDir, "node_modules", from);
        const dst = join(opts.outDir, "node_modules", to);
        const dstStat = await promises.lstat(dst).catch(() => null);
        const exists = dstStat && dstStat.isSymbolicLink();
        if (exists) {
          return;
        }
        await promises.mkdir(dirname(dst), { recursive: true });
        await promises.symlink(
          relative(dirname(dst), src),
          dst,
          isWindows ? "junction" : "dir"
        ).catch((err) => {
          console.error("Cannot link", from, "to", to, err);
        });
      };
      const findPackageParents = (pkg, version) => {
        const versionFiles = pkg.versions[version].files.map(
          (path) => tracedFiles[path]
        );
        const parentPkgs = [
          ...new Set(
            versionFiles.flatMap(
              (file) => file.parents.map((parentPath) => {
                const parentFile = tracedFiles[parentPath];
                if (parentFile.pkgName === pkg.name) {
                  return null;
                }
                return `${parentFile.pkgName}@${parentFile.pkgVersion}`;
              }).filter(Boolean)
            )
          )
        ];
        return parentPkgs;
      };
      const multiVersionPkgs = {};
      const singleVersionPackages = [];
      for (const tracedPackage of Object.values(tracedPackages)) {
        const versions = Object.keys(tracedPackage.versions);
        if (versions.length === 1) {
          singleVersionPackages.push(tracedPackage.name);
          continue;
        }
        multiVersionPkgs[tracedPackage.name] = {};
        for (const version of versions) {
          multiVersionPkgs[tracedPackage.name][version] = findPackageParents(
            tracedPackage,
            version
          );
        }
      }
      await Promise.all(
        singleVersionPackages.map((pkgName) => {
          const pkg = tracedPackages[pkgName];
          const version = Object.keys(pkg.versions)[0];
          return writePackage(pkgName, version);
        })
      );
      for (const [pkgName, pkgVersions] of Object.entries(multiVersionPkgs)) {
        const versionEntires = Object.entries(pkgVersions).sort(
          ([v1, p1], [v2, p2]) => {
            if (p1.length === 0) {
              return -1;
            }
            if (p2.length === 0) {
              return 1;
            }
            return compareVersions(v1, v2);
          }
        );
        for (const [version, parentPkgs] of versionEntires) {
          await writePackage(pkgName, version, `.nitro/${pkgName}@${version}`);
          await linkPackage(`.nitro/${pkgName}@${version}`, `${pkgName}`);
          for (const parentPkg of parentPkgs) {
            const parentPkgName = parentPkg.replace(/@[^@]+$/, "");
            await (multiVersionPkgs[parentPkgName] ? linkPackage(
              `.nitro/${pkgName}@${version}`,
              `.nitro/${parentPkg}/node_modules/${pkgName}`
            ) : linkPackage(
              `.nitro/${pkgName}@${version}`,
              `${parentPkgName}/node_modules/${pkgName}`
            ));
          }
        }
      }
      const bundledDependencies = Object.fromEntries(
        Object.values(tracedPackages).sort((a, b) => a.name.localeCompare(b.name)).map((pkg) => [pkg.name, Object.keys(pkg.versions).join(" || ")])
      );
      await promises.writeFile(
        resolve(opts.outDir, "package.json"),
        JSON.stringify(
          {
            name: "nitro-output",
            version: "0.0.0",
            private: true,
            bundledDependencies
          },
          null,
          2
        ),
        "utf8"
      );
    }
  };
}
function compareVersions(v1 = "0.0.0", v2 = "0.0.0") {
  try {
    return semver.lt(v1, v2, { loose: true }) ? 1 : -1;
  } catch {
    return v1.localeCompare(v2);
  }
}
function parseNodeModulePath$1(path) {
  if (!path) {
    return {};
  }
  const match = /^(.+\/node_modules\/)([^/@]+|@[^/]+\/[^/]+)(\/?.*?)?$/.exec(
    normalize(path)
  );
  if (!match) {
    return {};
  }
  const [, baseDir, pkgName, subpath] = match;
  return {
    baseDir,
    pkgName,
    subpath
  };
}
function applyProductionCondition(exports) {
  if (!exports || typeof exports === "string") {
    return;
  }
  if (exports.production) {
    if (typeof exports.production === "string") {
      exports.default = exports.production;
    } else {
      Object.assign(exports, exports.production);
    }
  }
  for (const key in exports) {
    applyProductionCondition(exports[key]);
  }
}
async function isFile$1(file) {
  try {
    const stat = await promises.stat(file);
    return stat.isFile();
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

function externals(opts) {
  const trackedExternals = /* @__PURE__ */ new Set();
  const _resolveCache = /* @__PURE__ */ new Map();
  const _resolve = async (id) => {
    let resolved = _resolveCache.get(id);
    if (resolved) {
      return resolved;
    }
    resolved = await resolvePath$1(id, {
      conditions: opts.exportConditions,
      url: opts.moduleDirectories
    });
    _resolveCache.set(id, resolved);
    return resolved;
  };
  opts.inline = (opts.inline || []).map((p) => normalize(p));
  opts.external = (opts.external || []).map((p) => normalize(p));
  return {
    name: "node-externals",
    async resolveId(originalId, importer, options) {
      if (!originalId || originalId.startsWith("\0") || originalId.includes("?") || originalId.startsWith("#")) {
        return null;
      }
      if (originalId.startsWith(".")) {
        return null;
      }
      const id = normalize(originalId);
      const idWithoutNodeModules = id.split("node_modules/").pop();
      if (opts.inline.some(
        (i) => id.startsWith(i) || idWithoutNodeModules.startsWith(i)
      )) {
        return null;
      }
      if (opts.external.some(
        (i) => id.startsWith(i) || idWithoutNodeModules.startsWith(i)
      )) {
        return { id, external: true };
      }
      const resolved = await this.resolve(originalId, importer, {
        ...options,
        skipSelf: true
      }) || { id };
      if (!isAbsolute(resolved.id) || !existsSync(resolved.id) || await isDirectory(resolved.id)) {
        resolved.id = await _resolve(resolved.id).catch(() => resolved.id);
      }
      if (!await isValidNodeImport(resolved.id).catch(() => false)) {
        return null;
      }
      if (opts.trace === false) {
        return {
          ...resolved,
          id: isAbsolute(resolved.id) ? normalizeid(resolved.id) : resolved.id,
          external: true
        };
      }
      const { pkgName, subpath } = parseNodeModulePath(resolved.id);
      if (!pkgName) {
        return null;
      }
      if (pkgName !== originalId) {
        if (!isAbsolute(originalId)) {
          const fullPath = await _resolve(originalId);
          trackedExternals.add(fullPath);
          return {
            id: originalId,
            external: true
          };
        }
        const packageEntry = await _resolve(pkgName).catch(() => null);
        if (packageEntry !== originalId) {
          const guessedSubpath = pkgName + subpath.replace(/\.[a-z]+$/, "");
          const resolvedGuess = await _resolve(guessedSubpath).catch(
            () => null
          );
          if (resolvedGuess === originalId) {
            trackedExternals.add(resolvedGuess);
            return {
              id: guessedSubpath,
              external: true
            };
          }
          return null;
        }
      }
      trackedExternals.add(resolved.id);
      return {
        id: pkgName,
        external: true
      };
    },
    async buildEnd() {
      if (opts.trace === false) {
        return;
      }
      for (const pkgName of opts.traceInclude || []) {
        const path = await this.resolve(pkgName);
        if (path?.id) {
          trackedExternals.add(path.id.replace(/\?.+/, ""));
        }
      }
      let tracedFiles = await nodeFileTrace(
        [...trackedExternals],
        opts.traceOptions
      ).then(
        (r) => [...r.fileList].map((f) => resolve(opts.traceOptions.base, f))
      ).then((r) => r.filter((file) => file.includes("node_modules")));
      tracedFiles = await Promise.all(
        tracedFiles.map((file) => promises.realpath(file))
      );
      const packageJSONCache = /* @__PURE__ */ new Map();
      const getPackageJson = async (pkgDir) => {
        if (packageJSONCache.has(pkgDir)) {
          return packageJSONCache.get(pkgDir);
        }
        const pkgJSON = JSON.parse(
          await promises.readFile(resolve(pkgDir, "package.json"), "utf8")
        );
        packageJSONCache.set(pkgDir, pkgJSON);
        return pkgJSON;
      };
      const tracedPackages = /* @__PURE__ */ new Map();
      const ignoreDirs = [];
      const ignoreWarns = /* @__PURE__ */ new Set();
      for (const file of tracedFiles) {
        const { baseDir, pkgName } = parseNodeModulePath(file);
        if (!pkgName) {
          continue;
        }
        let pkgDir = resolve(baseDir, pkgName);
        const existingPkgDir = tracedPackages.get(pkgName);
        if (existingPkgDir && existingPkgDir !== pkgDir) {
          const v1 = await getPackageJson(existingPkgDir).then(
            (r) => r.version
          );
          const v2 = await getPackageJson(pkgDir).then((r) => r.version);
          const isNewer = semver.gt(v2, v1);
          const getMajor = (v) => v.split(".").find((s) => s !== "0");
          if (getMajor(v1) !== getMajor(v2)) {
            const warn = `Multiple major versions of package \`${pkgName}\` are being externalized. Picking latest version:

` + [
              `  ${isNewer ? "-" : "+"} ` + existingPkgDir + "@" + v1,
              `  ${isNewer ? "+" : "-"} ` + pkgDir + "@" + v2
            ].join("\n");
            if (!ignoreWarns.has(warn)) {
              consola.warn(warn);
              ignoreWarns.add(warn);
            }
          }
          const [newerDir, olderDir] = isNewer ? [pkgDir, existingPkgDir] : [existingPkgDir, pkgDir];
          if (getMajor(v1) === getMajor(v2)) {
            tracedFiles = tracedFiles.map(
              (f) => f.startsWith(olderDir + "/") ? f.replace(olderDir, newerDir) : f
            );
          }
          ignoreDirs.push(olderDir + "/");
          pkgDir = newerDir;
        }
        tracedPackages.set(pkgName, pkgDir);
      }
      tracedFiles = tracedFiles.filter(
        (f) => !ignoreDirs.some((d) => f.startsWith(d))
      );
      tracedFiles = [...new Set(tracedFiles)];
      for (const pkgDir of tracedPackages.values()) {
        const pkgJSON = join(pkgDir, "package.json");
        if (!tracedFiles.includes(pkgJSON)) {
          tracedFiles.push(pkgJSON);
        }
      }
      const writeFile = async (file) => {
        if (!await isFile(file)) {
          return;
        }
        const src = resolve(opts.traceOptions.base, file);
        const { pkgName, subpath } = parseNodeModulePath(file);
        const dst = resolve(opts.outDir, `node_modules/${pkgName + subpath}`);
        await promises.mkdir(dirname(dst), { recursive: true });
        try {
          await promises.copyFile(src, dst);
        } catch {
          consola.warn(`Could not resolve \`${src}\`. Skipping.`);
        }
      };
      await Promise.all(
        tracedFiles.map((file) => retry(() => writeFile(file), 3))
      );
      await promises.writeFile(
        resolve(opts.outDir, "package.json"),
        JSON.stringify(
          {
            name: "nitro-output",
            version: "0.0.0",
            private: true,
            bundledDependencies: [...tracedPackages.keys()].sort()
          },
          null,
          2
        ),
        "utf8"
      );
    }
  };
}
function parseNodeModulePath(path) {
  if (!path) {
    return {};
  }
  const match = /^(.+\/node_modules\/)([^/@]+|@[^/]+\/[^/]+)(\/?.*?)?$/.exec(
    normalize(path)
  );
  if (!match) {
    return {};
  }
  const [, baseDir, pkgName, subpath] = match;
  return {
    baseDir,
    pkgName,
    subpath
  };
}
async function isFile(file) {
  try {
    const stat = await promises.stat(file);
    return stat.isFile();
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

const TIMING = "globalThis.__timing__";
const iife = (code) => `(function() { ${code.trim()} })();`.replace(/\n/g, "");
const HELPER = iife(`
const start = () => Date.now();
const end = s => Date.now() - s;
const _s = {};
const metrics = [];
const logStart = id => { _s[id] = Date.now(); };
const logEnd = id => { const t = end(_s[id]); delete _s[id]; metrics.push([id, t]); console.debug('>', id + ' (' + t + 'ms)'); };
${TIMING} = { start, end, metrics, logStart, logEnd };
`);
const HELPERIMPORT = "import './timing.js';";
function timing(_opts = {}) {
  return {
    name: "timing",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "timing.js",
        source: HELPER
      });
    },
    renderChunk(code, chunk) {
      let name = chunk.fileName || "";
      name = name.replace(extname(name), "");
      const logName = name === "index" ? "Nitro Start" : "Load " + name;
      return {
        code: (chunk.isEntry ? HELPERIMPORT : "") + `${TIMING}.logStart('${logName}');` + code + `;${TIMING}.logEnd('${logName}');`,
        map: null
      };
    }
  };
}

function publicAssets(nitro) {
  return virtual(
    {
      // #internal/nitro/virtual/public-assets-data
      "#internal/nitro/virtual/public-assets-data": async () => {
        const assets = {};
        const files = await globby("**", {
          cwd: nitro.options.output.publicDir,
          absolute: false,
          dot: true
        });
        for (const id of files) {
          let mimeType = mime.getType(id.replace(/\.(gz|br)$/, "")) || "text/plain";
          if (mimeType.startsWith("text")) {
            mimeType += "; charset=utf-8";
          }
          const fullPath = resolve(nitro.options.output.publicDir, id);
          const assetData = await promises.readFile(fullPath);
          const etag = createEtag(assetData);
          const stat = await promises.stat(fullPath);
          const assetId = "/" + decodeURIComponent(id);
          let encoding;
          if (id.endsWith(".gz")) {
            encoding = "gzip";
          } else if (id.endsWith(".br")) {
            encoding = "br";
          }
          assets[assetId] = {
            type: mimeType,
            encoding,
            etag,
            mtime: stat.mtime.toJSON(),
            size: stat.size,
            path: relative(nitro.options.output.serverDir, fullPath)
          };
        }
        return `export default ${JSON.stringify(assets, null, 2)};`;
      },
      // #internal/nitro/virtual/public-assets-node
      "#internal/nitro/virtual/public-assets-node": () => {
        return `
import { promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'pathe'
import assets from '#internal/nitro/virtual/public-assets-data'
export function readAsset (id) {
  const serverDir = dirname(fileURLToPath(import.meta.url))
  return fsp.readFile(resolve(serverDir, assets[id].path))
}`;
      },
      // #internal/nitro/virtual/public-assets-deno
      "#internal/nitro/virtual/public-assets-deno": () => {
        return `
import assets from '#internal/nitro/virtual/public-assets-data'
export function readAsset (id) {
  // https://deno.com/deploy/docs/serve-static-assets
  const path = '.' + new URL(\`../public\${id}\`, 'file://').pathname
  return Deno.readFile(path);
}`;
      },
      // #internal/nitro/virtual/public-assets
      "#internal/nitro/virtual/public-assets": () => {
        const publicAssetBases = Object.fromEntries(
          nitro.options.publicAssets.filter((dir) => !dir.fallthrough && dir.baseURL !== "/").map((dir) => [dir.baseURL, { maxAge: dir.maxAge }])
        );
        return `
import assets from '#internal/nitro/virtual/public-assets-data'
${nitro.options.serveStatic ? `export * from "#internal/nitro/virtual/public-assets-${nitro.options.serveStatic === "deno" ? "deno" : "node"}"` : "export const readAsset = () => Promise.resolve(null)"}

export const publicAssetBases = ${JSON.stringify(publicAssetBases)}

export function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

export function getPublicAssetMeta(id = '') {
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) { return publicAssetBases[base] }
  }
  return {}
}

export function getAsset (id) {
  return assets[id]
}
`;
      }
    },
    nitro.vfs
  );
}

function serverAssets(nitro) {
  if (nitro.options.dev || nitro.options.preset === "nitro-prerender") {
    return virtual(
      { "#internal/nitro/virtual/server-assets": getAssetsDev(nitro) },
      nitro.vfs
    );
  }
  return virtual(
    {
      "#internal/nitro/virtual/server-assets": async () => {
        const assets = {};
        for (const asset of nitro.options.serverAssets) {
          const files = await globby("**/*.*", {
            cwd: asset.dir,
            absolute: false
          });
          for (const _id of files) {
            const fsPath = resolve(asset.dir, _id);
            const id = asset.baseName + "/" + _id;
            assets[id] = { fsPath, meta: {} };
            let type = mime.getType(id) || "text/plain";
            if (type.startsWith("text")) {
              type += "; charset=utf-8";
            }
            const etag = createEtag(await promises.readFile(fsPath));
            const mtime = await promises.stat(fsPath).then((s) => s.mtime.toJSON());
            assets[id].meta = { type, etag, mtime };
          }
        }
        return getAssetProd(assets);
      }
    },
    nitro.vfs
  );
}
function getAssetsDev(nitro) {
  return `
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

const serverAssets = ${JSON.stringify(nitro.options.serverAssets)}

export const assets = createStorage()

for (const asset of serverAssets) {
  assets.mount(asset.baseName, fsDriver({ base: asset.dir }))
}`;
}
function getAssetProd(assets) {
  return `
const _assets = {
${Object.entries(assets).map(
    ([id, asset]) => `  [${JSON.stringify(
      normalizeKey(id)
    )}]: {
    import: () => import(${JSON.stringify(
      "raw:" + asset.fsPath
    )}).then(r => r.default || r),
    meta: ${JSON.stringify(
      asset.meta
    )}
  }`
  ).join(",\n")}
}

${normalizeKey.toString()}

export const assets = {
  getKeys() {
    return Promise.resolve(Object.keys(_assets))
  },
  hasItem (id) {
    id = normalizeKey(id)
    return Promise.resolve(id in _assets)
  },
  getItem (id) {
    id = normalizeKey(id)
    return Promise.resolve(_assets[id] ? _assets[id].import() : null)
  },
  getMeta (id) {
    id = normalizeKey(id)
    return Promise.resolve(_assets[id] ? _assets[id].meta : {})
  }
}
`;
}

function handlers(nitro) {
  const getHandlers = () => [
    ...nitro.scannedHandlers,
    ...nitro.options.handlers
  ];
  return virtual(
    {
      "#internal/nitro/virtual/server-handlers": () => {
        const handlers2 = getHandlers();
        if (nitro.options.serveStatic) {
          handlers2.unshift({
            middleware: true,
            handler: "#internal/nitro/static"
          });
        }
        if (nitro.options.renderer) {
          handlers2.push({
            route: "/**",
            lazy: true,
            handler: nitro.options.renderer
          });
        }
        extendMiddlewareWithRuleOverlaps(handlers2, nitro.options.routeRules);
        const imports = unique(
          handlers2.filter((h) => !h.lazy).map((h) => h.handler)
        );
        const lazyImports = unique(
          handlers2.filter((h) => h.lazy).map((h) => h.handler)
        );
        const handlersMeta = getHandlers().filter((h) => h.route).map((h) => {
          return {
            route: h.route,
            method: h.method
          };
        });
        const code = `
${imports.map((handler) => `import ${getImportId(handler)} from '${handler}';`).join("\n")}

${lazyImports.map(
          (handler) => `const ${getImportId(handler, true)} = () => import('${handler}');`
        ).join("\n")}

export const handlers = [
${handlers2.map(
          (h) => `  { route: '${h.route || ""}', handler: ${getImportId(
            h.handler,
            h.lazy
          )}, lazy: ${!!h.lazy}, middleware: ${!!h.middleware}, method: ${JSON.stringify(
            h.method
          )} }`
        ).join(",\n")}
];

export const handlersMeta = ${JSON.stringify(handlersMeta, null, 2)}
  `.trim();
        return code;
      }
    },
    nitro.vfs
  );
}
function unique(arr) {
  return [...new Set(arr)];
}
function getImportId(p, lazy) {
  return (lazy ? "_lazy_" : "_") + hash(p).slice(0, 6);
}
const WILDCARD_PATH_RE = /\/\*\*.*$/;
function extendMiddlewareWithRuleOverlaps(handlers2, routeRules) {
  const rules = Object.entries(routeRules);
  for (const [path, rule] of rules) {
    if (!rule.cache) {
      const isNested = rules.some(
        ([p, r]) => r.cache && WILDCARD_PATH_RE.test(p) && path.startsWith(p.replace(WILDCARD_PATH_RE, ""))
      );
      if (!isNested) {
        continue;
      }
    }
    for (const [index, handler] of handlers2.entries()) {
      if (!handler.route || handler.middleware) {
        continue;
      }
      if (handler.route === path) {
        break;
      }
      if (!WILDCARD_PATH_RE.test(handler.route)) {
        continue;
      }
      if (!path.startsWith(handler.route.replace(WILDCARD_PATH_RE, ""))) {
        continue;
      }
      handlers2.splice(index, 0, {
        ...handler,
        route: path
      });
      break;
    }
  }
}

const defaultLoaders = {
  ".ts": "ts",
  ".js": "js"
};
function esbuild(options) {
  const loaders = {
    ...defaultLoaders
  };
  if (options.loaders) {
    for (const key of Object.keys(options.loaders)) {
      const value = options.loaders[key];
      if (typeof value === "string") {
        loaders[key] = value;
      } else if (value === false) {
        delete loaders[key];
      }
    }
  }
  const extensions = Object.keys(loaders);
  const INCLUDE_REGEXP = new RegExp(
    `\\.(${extensions.map((ext) => ext.slice(1)).join("|")})$`
  );
  const EXCLUDE_REGEXP = /node_modules/;
  const filter = createFilter(
    options.include || INCLUDE_REGEXP,
    options.exclude || EXCLUDE_REGEXP
  );
  return {
    name: "esbuild",
    async transform(code, id) {
      if (!filter(id)) {
        return null;
      }
      const ext = extname(id);
      const loader = loaders[ext];
      if (!loader) {
        return null;
      }
      const result = await transform(code, {
        loader,
        target: options.target,
        define: options.define,
        sourcemap: options.sourceMap === "hidden" ? "external" : options.sourceMap,
        sourcefile: id
      });
      printWarnings(id, result, this);
      return result.code && {
        code: result.code,
        map: result.map || null
      };
    },
    async renderChunk(code) {
      if (options.minify) {
        const result = await transform(code, {
          loader: "js",
          minify: true,
          target: options.target
        });
        if (result.code) {
          return {
            code: result.code,
            map: result.map || null
          };
        }
      }
      return null;
    }
  };
}
function printWarnings(id, result, plugin) {
  if (result.warnings) {
    for (const warning of result.warnings) {
      let message = "[esbuild]";
      if (warning.location) {
        message += ` (${relative(process.cwd(), id)}:${warning.location.line}:${warning.location.column})`;
      }
      message += ` ${warning.text}`;
      plugin.warn(message);
    }
  }
}

function raw(opts = {}) {
  const extensions = /* @__PURE__ */ new Set([
    ".md",
    ".mdx",
    ".yml",
    ".txt",
    ".css",
    ".htm",
    ".html",
    ...opts.extensions || []
  ]);
  return {
    name: "raw",
    resolveId(id) {
      if (id[0] === "\0") {
        return;
      }
      let isRawId = id.startsWith("raw:");
      if (isRawId) {
        id = id.slice(4);
      } else if (extensions.has(extname(id))) {
        isRawId = true;
      }
      if (isRawId) {
        return { id: "\0raw:" + id };
      }
    },
    load(id) {
      if (id.startsWith("\0raw:")) {
        return promises.readFile(id.slice(5), "utf8");
      }
    },
    transform(code, id) {
      if (id.startsWith("\0raw:")) {
        return {
          code: `// ROLLUP_NO_REPLACE 
 export default ${JSON.stringify(
            code
          )}`,
          map: null
        };
      }
    }
  };
}

function storage(nitro) {
  const mounts = [];
  const isDevOrPrerender = nitro.options.dev || nitro.options.preset === "nitro-prerender";
  const storageMounts = isDevOrPrerender ? { ...nitro.options.storage, ...nitro.options.devStorage } : nitro.options.storage;
  for (const path in storageMounts) {
    const mount = storageMounts[path];
    mounts.push({
      path,
      driver: builtinDrivers[mount.driver] || mount.driver,
      opts: mount
    });
  }
  const driverImports = [...new Set(mounts.map((m) => m.driver))];
  const bundledStorageCode = `
import { prefixStorage } from 'unstorage'
import overlay from 'unstorage/drivers/overlay'
import memory from 'unstorage/drivers/memory'

const bundledStorage = ${JSON.stringify(nitro.options.bundledStorage)}
for (const base of bundledStorage) {
  storage.mount(base, overlay({
    layers: [
      memory(),
      // TODO
      // prefixStorage(storage, base),
      prefixStorage(storage, 'assets:nitro:bundled:' + base)
    ]
  }))
}`;
  return virtual(
    {
      "#internal/nitro/virtual/storage": `
import { createStorage } from 'unstorage'
import { assets } from '#internal/nitro/virtual/server-assets'

${driverImports.map((i) => genImport(i, genSafeVariableName(i))).join("\n")}

export const storage = createStorage({})

storage.mount('/assets', assets)

${mounts.map(
        (m) => `storage.mount('${m.path}', ${genSafeVariableName(
          m.driver
        )}(${JSON.stringify(m.opts)}))`
      ).join("\n")}

${!isDevOrPrerender && nitro.options.bundledStorage.length > 0 ? bundledStorageCode : ""}
`
    },
    nitro.vfs
  );
}

function importMeta(nitro) {
  const ImportMetaRe = /import\.meta|globalThis._importMeta_/;
  return {
    name: "import-meta",
    renderChunk(code, chunk) {
      const isEntry = chunk.isEntry;
      if (!isEntry && (!ImportMetaRe.test(code) || code.includes("ROLLUP_NO_REPLACE"))) {
        return;
      }
      const url = nitro.options.node && isEntry ? "_import_meta_url_" : '"file:///_entry.js"';
      const env = nitro.options.node ? "process.env" : "{}";
      const ref = "globalThis._importMeta_";
      const stub = `{url:${url},env:${env}}`;
      const stubInit = isEntry ? `${ref}=${stub};` : `${ref}=${ref}||${stub};`;
      return {
        code: stubInit + code,
        map: null
      };
    }
  };
}

function appConfig(nitro) {
  return virtual(
    {
      "#internal/nitro/virtual/app-config": () => `
import { defuFn } from 'defu';

const inlineAppConfig = ${JSON.stringify(nitro.options.appConfig, null, 2)};

${nitro.options.appConfigFiles.map((file, i) => genImport(file, "appConfig" + i) + ";").join("\n")}

export const appConfig = defuFn(${[
        ...nitro.options.appConfigFiles.map((_, i) => "appConfig" + i),
        "inlineAppConfig"
      ].join(", ")});
      `
    },
    nitro.vfs
  );
}

const getRollupConfig = (nitro) => {
  const extensions = [".ts", ".mjs", ".js", ".json", ".node"];
  const nodePreset = nitro.options.node === false ? unenv.nodeless : unenv.node;
  const builtinPreset = {
    alias: {
      // General
      consola: "unenv/runtime/npm/consola",
      // only mock debug in production
      ...nitro.options.dev ? {} : { debug: "unenv/runtime/npm/debug" },
      ...nitro.options.alias
    }
  };
  const env = unenv.env(nodePreset, builtinPreset, nitro.options.unenv);
  if (nitro.options.sourceMap) {
    env.polyfill.push("source-map-support/register.js");
  }
  const buildServerDir = join(nitro.options.buildDir, "dist/server");
  const runtimeAppDir = join(runtimeDir, "app");
  const rollupConfig = defu(nitro.options.rollupConfig, {
    input: nitro.options.entry,
    output: {
      dir: nitro.options.output.serverDir,
      entryFileNames: "index.mjs",
      chunkFileNames(chunkInfo) {
        let prefix = "";
        const lastModule = normalize(
          chunkInfo.moduleIds[chunkInfo.moduleIds.length - 1]
        );
        if (lastModule.startsWith(buildServerDir)) {
          prefix = join("app", relative(buildServerDir, dirname(lastModule)));
        } else if (lastModule.startsWith(runtimeAppDir)) {
          prefix = "app";
        } else if (lastModule.startsWith(nitro.options.buildDir)) {
          prefix = "build";
        } else if (lastModule.startsWith(runtimeDir)) {
          prefix = "nitro";
        } else if (nitro.options.handlers.some(
          (m) => lastModule.startsWith(m.handler)
        )) {
          prefix = "handlers";
        } else if (lastModule.includes("assets") || lastModule.startsWith("\0raw:")) {
          prefix = "raw";
        } else if (lastModule.startsWith("\0")) {
          prefix = "rollup";
        }
        return join("chunks", prefix, "[name].mjs");
      },
      inlineDynamicImports: nitro.options.inlineDynamicImports,
      format: "esm",
      exports: "auto",
      intro: "",
      outro: "",
      generatedCode: {
        constBindings: true
      },
      sanitizeFileName: sanitizeFilePath,
      sourcemap: nitro.options.sourceMap,
      sourcemapExcludeSources: true,
      sourcemapPathTransform(relativePath, sourcemapPath) {
        return resolve(dirname(sourcemapPath), relativePath);
      }
    },
    external: env.external,
    // https://github.com/rollup/rollup/pull/4021#issuecomment-809985618
    makeAbsoluteExternalsRelative: false,
    plugins: [],
    onwarn(warning, rollupWarn) {
      if (!["CIRCULAR_DEPENDENCY", "EVAL"].includes(warning.code) && !warning.message.includes("Unsupported source map comment")) {
        rollupWarn(warning);
      }
    },
    treeshake: {
      moduleSideEffects(id) {
        const normalizedId = normalize(id);
        const idWithoutNodeModules = normalizedId.split("node_modules/").pop();
        return nitro.options.moduleSideEffects.some(
          (m) => normalizedId.startsWith(m) || idWithoutNodeModules.startsWith(m)
        );
      }
    }
  });
  if (nitro.options.timing) {
    rollupConfig.plugins.push(timing());
  }
  if (nitro.options.imports) {
    rollupConfig.plugins.push(
      unimportPlugin.rollup(nitro.options.imports)
    );
  }
  rollupConfig.plugins.push(raw());
  if (nitro.options.experimental.wasm) {
    const options = {
      ...nitro.options.experimental.wasm
    };
    rollupConfig.plugins.push(wasmPlugin(options));
  }
  let NODE_ENV = nitro.options.dev ? "development" : "production";
  if (nitro.options.preset === "nitro-prerender") {
    NODE_ENV = "prerender";
  }
  const buildEnvVars = {
    NODE_ENV,
    prerender: nitro.options.preset === "nitro-prerender",
    server: true,
    client: false,
    dev: String(nitro.options.dev),
    DEBUG: nitro.options.dev
  };
  rollupConfig.plugins.push(importMeta(nitro));
  rollupConfig.plugins.push(
    replace({
      preventAssignment: true,
      values: {
        "typeof window": '"undefined"',
        _import_meta_url_: "import.meta.url",
        "process.env.RUNTIME_CONFIG": () => JSON.stringify(nitro.options.runtimeConfig, null, 2),
        ...Object.fromEntries(
          [".", ";", ")", "[", "]", "}", " "].map((d) => [
            `import.meta${d}`,
            `globalThis._importMeta_${d}`
          ])
        ),
        ...Object.fromEntries(
          [";", "(", "{", "}", " ", "	", "\n"].map((d) => [
            `${d}global.`,
            `${d}globalThis.`
          ])
        ),
        ...Object.fromEntries(
          Object.entries(buildEnvVars).map(([key, val]) => [
            `process.env.${key}`,
            JSON.stringify(val)
          ])
        ),
        ...Object.fromEntries(
          Object.entries(buildEnvVars).map(([key, val]) => [
            `import.meta.env.${key}`,
            JSON.stringify(val)
          ])
        ),
        ...nitro.options.replace
      }
    })
  );
  rollupConfig.plugins.push(
    esbuild({
      target: "es2019",
      sourceMap: nitro.options.sourceMap,
      ...nitro.options.esbuild?.options
    })
  );
  rollupConfig.plugins.push(
    dynamicRequire({
      dir: resolve(nitro.options.buildDir, "dist/server"),
      inline: nitro.options.node === false || nitro.options.inlineDynamicImports,
      ignore: [
        "client.manifest.mjs",
        "server.js",
        "server.cjs",
        "server.mjs",
        "server.manifest.mjs"
      ]
    })
  );
  rollupConfig.plugins.push(serverAssets(nitro));
  rollupConfig.plugins.push(publicAssets(nitro));
  rollupConfig.plugins.push(storage(nitro));
  rollupConfig.plugins.push(appConfig(nitro));
  rollupConfig.plugins.push(handlers(nitro));
  rollupConfig.plugins.push(
    virtual(
      {
        "#internal/nitro/virtual/polyfill": env.polyfill.map((p) => `import '${p}';`).join("\n")
      },
      nitro.vfs
    )
  );
  rollupConfig.plugins.push(virtual(nitro.options.virtual, nitro.vfs));
  rollupConfig.plugins.push(
    virtual(
      {
        "#internal/nitro/virtual/plugins": `
${nitro.options.plugins.map((plugin) => `import _${hash(plugin)} from '${plugin}';`).join("\n")}

export const plugins = [
  ${nitro.options.plugins.map((plugin) => `_${hash(plugin)}`).join(",\n")}
]
    `
      },
      nitro.vfs
    )
  );
  let buildDir = nitro.options.buildDir;
  if (isWindows && nitro.options.externals?.trace === false && nitro.options.dev) {
    buildDir = pathToFileURL(buildDir).href;
  }
  rollupConfig.plugins.push(
    alias({
      entries: resolveAliases({
        "#build": buildDir,
        "#internal/nitro/virtual/error-handler": nitro.options.errorHandler,
        "~": nitro.options.srcDir,
        "@/": nitro.options.srcDir,
        "~~": nitro.options.rootDir,
        "@@/": nitro.options.rootDir,
        ...env.alias
      })
    })
  );
  if (!nitro.options.noExternals) {
    const externalsPlugin = nitro.options.experimental.legacyExternals ? externals : externals$1;
    rollupConfig.plugins.push(
      externalsPlugin(
        defu(nitro.options.externals, {
          outDir: nitro.options.output.serverDir,
          moduleDirectories: nitro.options.nodeModulesDirs,
          external: [...nitro.options.dev ? [nitro.options.buildDir] : []],
          inline: [
            "#",
            "~",
            "@/",
            "~~",
            "@@/",
            "virtual:",
            runtimeDir,
            nitro.options.srcDir,
            ...nitro.options.handlers.map((m) => m.handler).filter((i) => typeof i === "string")
          ],
          traceOptions: {
            base: "/",
            processCwd: nitro.options.rootDir,
            exportsOnly: true
          },
          exportConditions: [
            "default",
            nitro.options.dev ? "development" : "production",
            "module",
            "node",
            "import"
          ]
        })
      )
    );
  } else {
    rollupConfig.plugins.push({
      name: "no-externals",
      async resolveId(id, from, options) {
        if (nitro.options.node && (id.startsWith("node:") || builtinModules.includes(id))) {
          return { id, external: true };
        }
        const resolved = await this.resolve(id, from, {
          ...options,
          skipSelf: true
        });
        if (!resolved) {
          const _resolved = await resolvePath$1(id, {
            url: nitro.options.nodeModulesDirs,
            conditions: [
              "default",
              nitro.options.dev ? "development" : "production",
              "module",
              "node",
              "import"
            ]
          }).catch(() => null);
          if (_resolved) {
            return { id: _resolved, external: false };
          }
        }
        if (!resolved || resolved.external) {
          throw new Error(
            `Cannot resolve ${JSON.stringify(id)} from ${JSON.stringify(
              from
            )} and externals are not allowed!`
          );
        }
      }
    });
  }
  rollupConfig.plugins.push(
    nodeResolve({
      extensions,
      preferBuiltins: !!nitro.options.node,
      rootDir: nitro.options.rootDir,
      modulePaths: nitro.options.nodeModulesDirs,
      // 'module' is intentionally not supported because of externals
      mainFields: ["main"],
      exportConditions: [
        "default",
        nitro.options.dev ? "development" : "production",
        "module",
        "node",
        "import"
      ]
    })
  );
  rollupConfig.plugins.push(
    commonjs({
      esmExternals: (id) => !id.startsWith("unenv/"),
      requireReturnsDefault: "auto",
      ...nitro.options.commonJS
    })
  );
  rollupConfig.plugins.push(json());
  rollupConfig.plugins.push(inject(env.inject));
  if (nitro.options.minify) {
    const _terser = createRequire(import.meta.url)("@rollup/plugin-terser");
    const terser = _terser.default || _terser;
    rollupConfig.plugins.push(
      terser({
        mangle: {
          keep_fnames: true,
          keep_classnames: true
        },
        format: {
          comments: false
        }
      })
    );
  }
  if (nitro.options.analyze) {
    rollupConfig.plugins.push(
      visualizer({
        ...nitro.options.analyze,
        filename: nitro.options.analyze.filename.replace("{name}", "nitro"),
        title: "Nitro Server bundle stats"
      })
    );
  }
  return rollupConfig;
};

const GLOB_SCAN_PATTERN = "**/*.{ts,mjs,js,cjs}";
const httpMethodRegex = /\.(connect|delete|get|head|options|patch|post|put|trace)/;
async function scanHandlers(nitro) {
  const handlers = await Promise.all([
    scanMiddleware(nitro),
    scanRoutes(nitro, "api", "/api"),
    scanRoutes(nitro, "routes", "/")
  ]).then((r) => r.flat());
  nitro.scannedHandlers = handlers.flatMap((h) => h.handlers).filter((h, index, array) => {
    return h.middleware || array.findIndex(
      (h2) => h.route === h2.route && h.method === h2.method
    ) === index;
  });
  return handlers;
}
function scanMiddleware(nitro) {
  return scanServerDir(nitro, "middleware", (file) => ({
    middleware: true,
    handler: file.fullPath
  }));
}
function scanRoutes(nitro, dir, prefix = "/") {
  return scanServerDir(nitro, dir, (file) => {
    let route = file.path.replace(/\.[A-Za-z]+$/, "").replace(/\[\.{3}]/g, "**").replace(/\[\.{3}(\w+)]/g, "**:$1").replace(/\[(\w+)]/g, ":$1");
    route = withLeadingSlash(withoutTrailingSlash(withBase(route, prefix)));
    let method;
    const methodMatch = route.match(httpMethodRegex);
    if (methodMatch) {
      route = route.slice(0, Math.max(0, methodMatch.index));
      method = methodMatch[1];
    }
    route = route.replace(/\/index$/, "") || "/";
    return {
      handler: file.fullPath,
      lazy: true,
      route,
      method
    };
  });
}
async function scanServerDir(nitro, name, mapper) {
  const dirs = nitro.options.scanDirs.map((dir) => join(dir, name));
  const files = await scanDirs(dirs);
  const handlers = files.map((f) => mapper(f));
  return { dirs, files, handlers };
}
async function scanPlugins(nitro) {
  const plugins = [];
  for (const dir of nitro.options.scanDirs) {
    const pluginDir = join(dir, "plugins");
    const pluginFiles = await globby(GLOB_SCAN_PATTERN, {
      cwd: pluginDir,
      absolute: true
    });
    plugins.push(...pluginFiles.sort());
  }
  return plugins;
}
function scanDirs(dirs) {
  return Promise.all(
    dirs.map(async (dir) => {
      const fileNames = await globby(GLOB_SCAN_PATTERN, {
        cwd: dir,
        dot: true
      });
      return fileNames.map((fileName) => {
        return {
          dir,
          path: fileName,
          fullPath: resolve(dir, fileName)
        };
      }).sort((a, b) => a.path.localeCompare(b.path));
    })
  ).then((r) => r.flat());
}

async function createStorage(nitro) {
  const storage = createStorage$1();
  const mounts = {
    ...nitro.options.storage,
    ...nitro.options.devStorage
  };
  for (const [path, opts] of Object.entries(mounts)) {
    const driver = await import(builtinDrivers[opts.driver] || opts.driver).then((r) => r.default || r);
    storage.mount(path, driver(opts));
  }
  return storage;
}
async function snapshotStorage(nitro) {
  const data = {};
  const allKeys = [
    ...new Set(
      await Promise.all(
        nitro.options.bundledStorage.map((base) => nitro.storage.getKeys(base))
      ).then((r) => r.flat())
    )
  ];
  await Promise.all(
    allKeys.map(async (key) => {
      data[key] = await nitro.storage.getItem(key);
    })
  );
  return data;
}

async function compressPublicAssets(nitro) {
  const publicFiles = await globby("**", {
    cwd: nitro.options.output.publicDir,
    absolute: false,
    dot: true,
    ignore: ["**/*.gz", "**/*.br"]
  });
  for (const fileName of publicFiles) {
    const filePath = resolve(nitro.options.output.publicDir, fileName);
    const fileContents = await fsp.readFile(filePath);
    if (existsSync(filePath + ".gz") || existsSync(filePath + ".br")) {
      continue;
    }
    const mimeType = mime.getType(fileName) || "text/plain";
    if (fileContents.length < 1024 || fileName.endsWith(".map") || !isCompressableMime(mimeType)) {
      continue;
    }
    const { gzip, brotli } = nitro.options.compressPublicAssets || {};
    const encodings = [
      gzip !== false && "gzip",
      brotli !== false && "br"
    ].filter(Boolean);
    for (const encoding of encodings) {
      const suffix = "." + (encoding === "gzip" ? "gz" : "br");
      const compressedPath = filePath + suffix;
      if (existsSync(compressedPath)) {
        continue;
      }
      const gzipOptions = { level: zlib.constants.Z_BEST_COMPRESSION };
      const brotliOptions = {
        [zlib.constants.BROTLI_PARAM_MODE]: isTextMime(mimeType) ? zlib.constants.BROTLI_MODE_TEXT : zlib.constants.BROTLI_MODE_GENERIC,
        [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: fileContents.length
      };
      const compressedBuff = await new Promise((resolve2, reject) => {
        const cb = (error, result) => error ? reject(error) : resolve2(result);
        if (encoding === "gzip") {
          zlib.gzip(fileContents, gzipOptions, cb);
        } else {
          zlib.brotliCompress(fileContents, brotliOptions, cb);
        }
      });
      await fsp.writeFile(compressedPath, compressedBuff);
    }
  }
}
function isTextMime(mimeType) {
  return /text|javascript|json|xml/.test(mimeType);
}
const COMPRESSIBLE_MIMES_RE = /* @__PURE__ */ new Set([
  "application/dash+xml",
  "application/eot",
  "application/font",
  "application/font-sfnt",
  "application/javascript",
  "application/json",
  "application/opentype",
  "application/otf",
  "application/pkcs7-mime",
  "application/protobuf",
  "application/rss+xml",
  "application/truetype",
  "application/ttf",
  "application/vnd.apple.mpegurl",
  "application/vnd.mapbox-vector-tile",
  "application/vnd.ms-fontobject",
  "application/xhtml+xml",
  "application/xml",
  "application/x-font-opentype",
  "application/x-font-truetype",
  "application/x-font-ttf",
  "application/x-httpd-cgi",
  "application/x-javascript",
  "application/x-mpegurl",
  "application/x-opentype",
  "application/x-otf",
  "application/x-perl",
  "application/x-ttf",
  "font/eot",
  "font/opentype",
  "font/otf",
  "font/ttf",
  "image/svg+xml",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/js",
  "text/plain",
  "text/richtext",
  "text/tab-separated-values",
  "text/xml",
  "text/x-component",
  "text/x-java-source",
  "text/x-script",
  "vnd.apple.mpegurl"
]);
function isCompressableMime(mimeType) {
  return COMPRESSIBLE_MIMES_RE.has(mimeType);
}

async function prepare(nitro) {
  await prepareDir(nitro.options.output.dir);
  if (!nitro.options.noPublicDir) {
    await prepareDir(nitro.options.output.publicDir);
  }
  if (!nitro.options.static) {
    await prepareDir(nitro.options.output.serverDir);
  }
}
async function prepareDir(dir) {
  await promises.mkdir(dir, { recursive: true });
  await fse.emptyDir(dir);
}
async function copyPublicAssets(nitro) {
  if (nitro.options.noPublicDir) {
    return;
  }
  for (const asset of nitro.options.publicAssets) {
    if (await isDirectory(asset.dir)) {
      await fse.copy(
        asset.dir,
        join(nitro.options.output.publicDir, asset.baseURL),
        { overwrite: false }
      );
    }
  }
  if (nitro.options.compressPublicAssets) {
    await compressPublicAssets(nitro);
  }
  nitro.logger.success(
    "Generated public " + prettyPath(nitro.options.output.publicDir)
  );
}
async function build(nitro) {
  const rollupConfig = getRollupConfig(nitro);
  await nitro.hooks.callHook("rollup:before", nitro, rollupConfig);
  return nitro.options.dev ? _watch(nitro, rollupConfig) : _build(nitro, rollupConfig);
}
async function writeTypes(nitro) {
  const routeTypes = {};
  const typesDir = resolve(nitro.options.buildDir, "types");
  const middleware = [...nitro.scannedHandlers, ...nitro.options.handlers];
  for (const mw of middleware) {
    if (typeof mw.handler !== "string" || !mw.route) {
      continue;
    }
    const relativePath = relative(typesDir, mw.handler).replace(
      /\.[a-z]+$/,
      ""
    );
    if (!routeTypes[mw.route]) {
      routeTypes[mw.route] = {};
    }
    const method = mw.method || "default";
    if (!routeTypes[mw.route][method]) {
      routeTypes[mw.route][method] = [];
    }
    routeTypes[mw.route][method].push(
      `Simplify<Serialize<Awaited<ReturnType<typeof import('${relativePath}').default>>>>`
    );
  }
  let autoImportedTypes = [];
  if (nitro.unimport) {
    await nitro.unimport.init();
    autoImportedTypes = [
      (await nitro.unimport.generateTypeDeclarations({
        exportHelper: false,
        resolvePath: (i) => {
          if (i.from.startsWith("#internal/nitro")) {
            return resolveAlias(i.from, nitro.options.alias);
          }
          return i.from;
        }
      })).trim()
    ];
  }
  const routes = [
    "// Generated by nitro",
    "import type { Serialize, Simplify } from 'nitropack'",
    "declare module 'nitropack' {",
    "  type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T",
    "  interface InternalApi {",
    ...Object.entries(routeTypes).map(
      ([path, methods]) => [
        `    '${path}': {`,
        ...Object.entries(methods).map(
          ([method, types]) => `      '${method}': ${types.join(" | ")}`
        ),
        "    }"
      ].join("\n")
    ),
    "  }",
    "}",
    // Makes this a module for augmentation purposes
    "export {}"
  ];
  const config = [
    "// Generated by nitro",
    `
// App Config
import type { Defu } from 'defu'

${nitro.options.appConfigFiles.map(
      (file, index) => genTypeImport(file.replace(/\.\w+$/, ""), [
        { name: "default", as: `appConfig${index}` }
      ])
    ).join("\n")}

type UserAppConfig = Defu<{}, [${nitro.options.appConfigFiles.map((_, index) => `typeof appConfig${index}`).join(", ")}]>

declare module 'nitropack' {
  interface AppConfig extends UserAppConfig {}
}
    `,
    // Makes this a module for augmentation purposes
    "export {}"
  ];
  const declarations = [
    // local nitropack augmentations
    '/// <reference path="./nitro-routes.d.ts" />',
    '/// <reference path="./nitro-config.d.ts" />',
    // global server auto-imports
    '/// <reference path="./nitro-imports.d.ts" />'
  ];
  await writeFile$1(join(typesDir, "nitro-routes.d.ts"), routes.join("\n"));
  await writeFile$1(join(typesDir, "nitro-config.d.ts"), config.join("\n"));
  await writeFile$1(
    join(typesDir, "nitro-imports.d.ts"),
    [...autoImportedTypes, "export {}"].join("\n")
  );
  await writeFile$1(join(typesDir, "nitro.d.ts"), declarations.join("\n"));
  if (nitro.options.typescript.generateTsConfig) {
    const tsConfigPath = resolve(
      nitro.options.buildDir,
      nitro.options.typescript.tsconfigPath
    );
    const tsconfigDir = dirname(tsConfigPath);
    const tsConfig = {
      compilerOptions: {
        forceConsistentCasingInFileNames: true,
        strict: nitro.options.typescript.strict,
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Node",
        allowJs: true,
        resolveJsonModule: true,
        paths: nitro.options.typescript.internalPaths ? {
          "#internal/nitro": [join(runtimeDir, "index")],
          "#internal/nitro/*": [join(runtimeDir, "*")]
        } : {}
      },
      include: [
        relative(tsconfigDir, join(typesDir, "nitro.d.ts")).replace(
          /^(?=[^.])/,
          "./"
        ),
        join(relative(tsconfigDir, nitro.options.rootDir), "**/*"),
        ...nitro.options.srcDir !== nitro.options.rootDir ? [join(relative(tsconfigDir, nitro.options.srcDir), "**/*")] : []
      ]
    };
    await writeFile$1(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  }
}
async function _snapshot(nitro) {
  if (nitro.options.bundledStorage.length === 0 || nitro.options.preset === "nitro-prerender") {
    return;
  }
  const storageDir = resolve(nitro.options.buildDir, "snapshot");
  nitro.options.serverAssets.push({
    baseName: "nitro:bundled",
    dir: storageDir
  });
  const data = await snapshotStorage(nitro);
  await Promise.all(
    Object.entries(data).map(async ([path, contents]) => {
      if (typeof contents !== "string") {
        contents = JSON.stringify(contents);
      }
      const fsPath = join(storageDir, path.replace(/:/g, "/"));
      await promises.mkdir(dirname(fsPath), { recursive: true });
      await promises.writeFile(fsPath, contents, "utf8");
    })
  );
}
async function _build(nitro, rollupConfig) {
  await scanHandlers(nitro);
  await writeTypes(nitro);
  await _snapshot(nitro);
  if (!nitro.options.static) {
    nitro.logger.info(
      `Building Nitro Server (preset: \`${nitro.options.preset}\`)`
    );
    const build2 = await rollup.rollup(rollupConfig).catch((error) => {
      nitro.logger.error(formatRollupError(error));
      throw error;
    });
    await build2.write(rollupConfig.output);
  }
  const nitroConfigPath = resolve(nitro.options.output.dir, "nitro.json");
  const buildInfo = {
    date: /* @__PURE__ */ new Date(),
    preset: nitro.options.preset,
    commands: {
      preview: nitro.options.commands.preview,
      deploy: nitro.options.commands.deploy
    }
  };
  await writeFile$1(nitroConfigPath, JSON.stringify(buildInfo, null, 2));
  if (!nitro.options.static) {
    nitro.logger.success("Nitro server built");
    if (nitro.options.logLevel > 1) {
      process.stdout.write(
        await generateFSTree(nitro.options.output.serverDir)
      );
    }
  }
  await nitro.hooks.callHook("compiled", nitro);
  const rOutput = relative(process.cwd(), nitro.options.output.dir);
  const rewriteRelativePaths = (input) => {
    return input.replace(/\s\.\/(\S*)/g, ` ${rOutput}/$1`);
  };
  if (buildInfo.commands.preview) {
    nitro.logger.success(
      `You can preview this build using \`${rewriteRelativePaths(
        buildInfo.commands.preview
      )}\``
    );
  }
  if (buildInfo.commands.deploy) {
    nitro.logger.success(
      `You can deploy this build using \`${rewriteRelativePaths(
        buildInfo.commands.deploy
      )}\``
    );
  }
}
function startRollupWatcher(nitro, rollupConfig) {
  const watcher = rollup.watch(
    defu(rollupConfig, {
      watch: {
        chokidar: nitro.options.watchOptions
      }
    })
  );
  let start;
  watcher.on("event", (event) => {
    switch (event.code) {
      case "START":
        return;
      case "BUNDLE_START":
        start = Date.now();
        return;
      case "END":
        nitro.hooks.callHook("compiled", nitro);
        nitro.logger.success(
          "Nitro built",
          start ? `in ${Date.now() - start} ms` : ""
        );
        nitro.hooks.callHook("dev:reload");
        return;
      case "ERROR":
        nitro.logger.error(formatRollupError(event.error));
    }
  });
  return watcher;
}
async function _watch(nitro, rollupConfig) {
  let rollupWatcher;
  const reload = debounce(async () => {
    if (rollupWatcher) {
      await rollupWatcher.close();
    }
    await scanHandlers(nitro);
    rollupWatcher = startRollupWatcher(nitro, rollupConfig);
    await writeTypes(nitro);
  });
  const watchPatterns = nitro.options.scanDirs.flatMap((dir) => [
    join(dir, "api"),
    join(dir, "routes"),
    join(dir, "middleware", GLOB_SCAN_PATTERN)
  ]);
  const watchReloadEvents = /* @__PURE__ */ new Set(["add", "addDir", "unlink", "unlinkDir"]);
  const reloadWacher = watch(watchPatterns, { ignoreInitial: true }).on(
    "all",
    (event) => {
      if (watchReloadEvents.has(event)) {
        reload();
      }
    }
  );
  nitro.hooks.hook("close", () => {
    rollupWatcher.close();
    reloadWacher.close();
  });
  nitro.hooks.hook("rollup:reload", () => reload());
  await reload();
}
function formatRollupError(_error) {
  try {
    const logs = [_error.toString()];
    for (const error of "errors" in _error ? _error.errors : [_error]) {
      const id = error.path || error.id || _error.id;
      let path = isAbsolute(id) ? relative(process.cwd(), id) : id;
      const location = error.loc || error.location;
      if (location) {
        path += `:${location.line}:${location.column}`;
      }
      const text = error.text || error.frame;
      logs.push(
        `Rollup error while processing \`${path}\`` + text ? "\n\n" + text : ""
      );
    }
    return logs.join("\n");
  } catch {
    return _error?.toString();
  }
}

function defineNitroPreset(preset) {
  return preset;
}

const awsLambda = defineNitroPreset({
  entry: "#internal/nitro/entries/aws-lambda"
});

const azureFunctions = defineNitroPreset({
  serveStatic: true,
  entry: "#internal/nitro/entries/azure-functions",
  commands: {
    deploy: "az functionapp deployment source config-zip -g <resource-group> -n <app-name> --src {{ output.dir }}/deploy.zip"
  },
  hooks: {
    async compiled(ctx) {
      await writeRoutes$2(ctx);
    }
  }
});
function zipDirectory(dir, outfile) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = createWriteStream(outfile);
  return new Promise((resolve2, reject) => {
    archive.directory(dir, false).on("error", (err) => reject(err)).pipe(stream);
    stream.on("close", () => resolve2(void 0));
    archive.finalize();
  });
}
async function writeRoutes$2(nitro) {
  const host = {
    version: "2.0",
    extensions: { http: { routePrefix: "" } }
  };
  const functionDefinition = {
    entryPoint: "handle",
    bindings: [
      {
        authLevel: "anonymous",
        type: "httpTrigger",
        direction: "in",
        name: "req",
        route: "{*url}",
        methods: ["delete", "get", "head", "options", "patch", "post", "put"]
      },
      {
        type: "http",
        direction: "out",
        name: "res"
      }
    ]
  };
  await writeFile$1(
    resolve(nitro.options.output.serverDir, "function.json"),
    JSON.stringify(functionDefinition)
  );
  await writeFile$1(
    resolve(nitro.options.output.dir, "host.json"),
    JSON.stringify(host)
  );
  await zipDirectory(
    nitro.options.output.dir,
    join(nitro.options.output.dir, "deploy.zip")
  );
}

const azure = defineNitroPreset({
  entry: "#internal/nitro/entries/azure",
  output: {
    serverDir: "{{ output.dir }}/server/functions",
    publicDir: "{{ output.dir }}/public/{{ baseURL }}"
  },
  commands: {
    preview: "npx @azure/static-web-apps-cli start ./public --api-location ./server"
  },
  hooks: {
    async compiled(ctx) {
      await writeRoutes$1(ctx);
    }
  }
});
async function writeRoutes$1(nitro) {
  const host = {
    version: "2.0"
  };
  let nodeVersion = "16";
  try {
    const currentNodeVersion = JSON.parse(
      await readFile(join(nitro.options.rootDir, "package.json"), "utf8")
    ).engines.node;
    if (["16", "14"].includes(currentNodeVersion)) {
      nodeVersion = currentNodeVersion;
    }
  } catch {
    const currentNodeVersion = process.versions.node.slice(0, 2);
    if (["16", "14"].includes(currentNodeVersion)) {
      nodeVersion = currentNodeVersion;
    }
  }
  const config = {
    platform: {
      apiRuntime: `node:${nodeVersion}`
    },
    routes: [],
    navigationFallback: {
      rewrite: "/api/server"
    }
  };
  const routeFiles = nitro._prerenderedRoutes || [];
  const indexFileExists = routeFiles.some(
    (route) => route.fileName === "/index.html"
  );
  if (!indexFileExists) {
    config.routes.unshift(
      {
        route: "/index.html",
        redirect: "/"
      },
      {
        route: "/",
        rewrite: "/api/server"
      }
    );
  }
  const suffix = "/index.html".length;
  for (const { fileName } of routeFiles) {
    if (!fileName.endsWith("/index.html")) {
      continue;
    }
    config.routes.unshift({
      route: fileName.slice(0, -suffix) || "/",
      rewrite: fileName
    });
  }
  for (const { fileName } of routeFiles) {
    if (!fileName.endsWith(".html") || fileName.endsWith("index.html")) {
      continue;
    }
    const route = fileName.slice(0, -".html".length);
    const existingRouteIndex = config.routes.findIndex(
      (_route) => _route.route === route
    );
    if (existingRouteIndex > -1) {
      config.routes.splice(existingRouteIndex, 1);
    }
    config.routes.unshift({
      route,
      rewrite: fileName
    });
  }
  const functionDefinition = {
    entryPoint: "handle",
    bindings: [
      {
        authLevel: "anonymous",
        type: "httpTrigger",
        direction: "in",
        name: "req",
        route: "{*url}",
        methods: ["delete", "get", "head", "options", "patch", "post", "put"]
      },
      {
        type: "http",
        direction: "out",
        name: "res"
      }
    ]
  };
  await writeFile$1(
    resolve(nitro.options.output.serverDir, "function.json"),
    JSON.stringify(functionDefinition, null, 2)
  );
  await writeFile$1(
    resolve(nitro.options.output.serverDir, "../host.json"),
    JSON.stringify(host, null, 2)
  );
  const stubPackageJson = resolve(
    nitro.options.output.serverDir,
    "../package.json"
  );
  await writeFile$1(stubPackageJson, JSON.stringify({ private: true }));
  await writeFile$1(
    resolve(nitro.options.rootDir, "staticwebapp.config.json"),
    JSON.stringify(config, null, 2)
  );
  if (!indexFileExists) {
    const baseURLSegments = nitro.options.baseURL.split("/").filter(Boolean);
    const relativePrefix = baseURLSegments.map(() => "..").join("/");
    await writeFile$1(
      resolve(
        nitro.options.output.publicDir,
        relativePrefix ? `${relativePrefix}/index.html` : "index.html"
      ),
      ""
    );
  }
}

const baseWorker = defineNitroPreset({
  entry: null,
  // Abstract
  node: false,
  minify: true,
  noExternals: true,
  rollupConfig: {
    output: {
      format: "iife",
      generatedCode: {
        symbols: true
      }
    }
  },
  inlineDynamicImports: true
  // iffe does not support code-splitting
});

const cloudflareModule = defineNitroPreset({
  extends: "base-worker",
  entry: "#internal/nitro/entries/cloudflare-module",
  commands: {
    preview: "npx wrangler dev ./server/index.mjs --site ./public --local",
    deploy: "npx wrangler publish"
  },
  rollupConfig: {
    external: "__STATIC_CONTENT_MANIFEST",
    output: {
      format: "esm",
      exports: "named"
    }
  },
  hooks: {
    async compiled(nitro) {
      await writeFile$1(
        resolve(nitro.options.output.dir, "package.json"),
        JSON.stringify({ private: true, main: "./server/index.mjs" }, null, 2)
      );
      await writeFile$1(
        resolve(nitro.options.output.dir, "package-lock.json"),
        JSON.stringify({ lockfileVersion: 1 }, null, 2)
      );
    }
  }
});

const cloudflarePages = defineNitroPreset({
  extends: "cloudflare",
  entry: "#internal/nitro/entries/cloudflare-pages",
  commands: {
    preview: "npx wrangler pages dev ./",
    deploy: "npx wrangler pages publish ./"
  },
  output: {
    dir: "{{ rootDir }}/dist",
    publicDir: "{{ output.dir }}",
    serverDir: "{{ output.dir }}"
  },
  alias: {
    // Hotfix: Cloudflare appends /index.html if mime is not found and things like ico are not in standard lite.js!
    // https://github.com/unjs/nitro/pull/933
    _mime: "mime/index.js"
  },
  rollupConfig: {
    output: {
      entryFileNames: "_worker.js",
      format: "esm"
    }
  },
  hooks: {
    async compiled(nitro) {
      await writeCFRoutes(nitro);
    }
  }
});
async function writeCFRoutes(nitro) {
  const routes = {
    version: 1,
    include: ["/*"],
    exclude: []
  };
  const explicitPublicAssets = nitro.options.publicAssets.filter(
    (i) => !i.fallthrough
  );
  routes.exclude.push(
    ...explicitPublicAssets.map((dir) => joinURL(dir.baseURL, "*")).sort(comparePaths)
  );
  const publicAssetFiles = await globby("**", {
    cwd: nitro.options.output.publicDir,
    absolute: false,
    dot: true,
    ignore: [
      "_worker.js",
      "_worker.js.map",
      "nitro.json",
      ...explicitPublicAssets.map(
        (dir) => withoutLeadingSlash(joinURL(dir.baseURL, "**"))
      )
    ]
  });
  routes.exclude.push(
    ...publicAssetFiles.map((i) => withLeadingSlash(i)).sort(comparePaths)
  );
  routes.exclude.splice(100 - routes.include.length);
  await promises.writeFile(
    resolve(nitro.options.output.publicDir, "_routes.json"),
    JSON.stringify(routes, void 0, 2)
  );
}
function comparePaths(a, b) {
  return a.split("/").length - b.split("/").length || a.localeCompare(b);
}

const cloudflare = defineNitroPreset({
  extends: "base-worker",
  entry: "#internal/nitro/entries/cloudflare",
  commands: {
    preview: "npx wrangler dev ./server/index.mjs --site ./public --local",
    deploy: "npx wrangler publish"
  },
  hooks: {
    async compiled(nitro) {
      await writeFile$1(
        resolve(nitro.options.output.dir, "package.json"),
        JSON.stringify({ private: true, main: "./server/index.mjs" }, null, 2)
      );
      await writeFile$1(
        resolve(nitro.options.output.dir, "package-lock.json"),
        JSON.stringify({ lockfileVersion: 1 }, null, 2)
      );
    }
  }
});

const deno = defineNitroPreset({
  entry: "#internal/nitro/entries/deno",
  node: false,
  noExternals: true,
  serveStatic: "deno",
  commands: {
    preview: "",
    deploy: "cd ./ && deployctl deploy --project=<project_name> server/index.ts"
  },
  rollupConfig: {
    preserveEntrySignatures: false,
    external: ["https://deno.land/std/http/server.ts"],
    output: {
      entryFileNames: "index.ts",
      manualChunks: () => "index",
      format: "esm"
    }
  }
});

const digitalOcean = defineNitroPreset({
  extends: "node-server"
});

const firebase = defineNitroPreset({
  entry: "#internal/nitro/entries/firebase",
  commands: {
    deploy: "npx firebase deploy"
  },
  hooks: {
    async compiled(ctx) {
      await writeRoutes(ctx);
    }
  }
});
async function writeRoutes(nitro) {
  if (!existsSync(join(nitro.options.rootDir, "firebase.json"))) {
    const firebase2 = {
      functions: {
        source: relative(nitro.options.rootDir, nitro.options.output.serverDir)
      },
      hosting: [
        {
          site: "<your_project_id>",
          public: relative(
            nitro.options.rootDir,
            nitro.options.output.publicDir
          ),
          cleanUrls: true,
          rewrites: [
            {
              source: "**",
              function: "server"
            }
          ]
        }
      ]
    };
    await writeFile$1(
      resolve(nitro.options.rootDir, "firebase.json"),
      JSON.stringify(firebase2)
    );
  }
  const _require = createRequire(import.meta.url);
  const jsons = await globby(
    join(nitro.options.output.serverDir, "node_modules/**/package.json")
  );
  const prefixLength = `${nitro.options.output.serverDir}/node_modules/`.length;
  const suffixLength = "/package.json".length;
  const dependencies = jsons.reduce((obj, packageJson) => {
    const dirname = packageJson.slice(prefixLength, -suffixLength);
    if (!dirname.includes("node_modules")) {
      obj[dirname] = _require(packageJson).version;
    }
    return obj;
  }, {});
  let nodeVersion = "18";
  const supportedNodeVersions = /* @__PURE__ */ new Set(["18", "16", "14", "12", "10"]);
  try {
    const currentNodeVersion = JSON.parse(
      await readFile(join(nitro.options.rootDir, "package.json"), "utf8")
    ).engines.node;
    if (supportedNodeVersions.has(currentNodeVersion)) {
      nodeVersion = currentNodeVersion;
    }
  } catch {
    const currentNodeVersion = process.versions.node.slice(0, 2);
    if (supportedNodeVersions.has(currentNodeVersion)) {
      nodeVersion = currentNodeVersion;
    }
  }
  const getPackageVersion = async (id) => {
    const pkg = await readPackageJSON(id, {
      url: nitro.options.nodeModulesDirs
    });
    return pkg.version;
  };
  await writeFile$1(
    resolve(nitro.options.output.serverDir, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        main: "./index.mjs",
        dependencies: {
          "firebase-functions-test": "latest",
          "firebase-admin": await getPackageVersion("firebase-admin"),
          "firebase-functions": await getPackageVersion("firebase-functions"),
          ...dependencies
        },
        engines: { node: nodeVersion }
      },
      null,
      2
    )
  );
}

const heroku = defineNitroPreset({
  extends: "node-server"
});

const edgio = defineNitroPreset({
  extends: "node-server",
  commands: {
    deploy: "cd ./ && npm run deploy",
    preview: "cd ./ && npm run preview"
  },
  hooks: {
    async compiled(nitro) {
      await writeFile(
        resolve(nitro.options.output.dir, "edgio.config.js"),
        `module.exports = ${JSON.stringify(
          {
            connector: "./edgio",
            routes: "./routes.js",
            backends: {},
            includeFiles: {
              "server/**": true
            }
          },
          null,
          2
        )}`
      );
      await writeFile(
        resolve(nitro.options.output.dir, "routes.js"),
        `
import { Router } from '@edgio/core/router'
import { isProductionBuild } from '@edgio/core/environment'

const router = new Router()

if (isProductionBuild()) {
  router.static('public')
}

router.fallback(({ renderWithApp }) => { renderWithApp() })

export default router
    `.trim()
      );
      await writeFile(
        resolve(nitro.options.output.dir, "edgio/prod.js"),
        `
module.exports = async function entry (port) {
  process.env.PORT = process.env.NITRO_PORT = port.toString()
  console.log('Starting Edgio server on port', port)
  await import('../server/index.mjs')
  console.log('Edgio server started')
}
      `.trim()
      );
      await writeFile(
        resolve(nitro.options.output.dir, "package.json"),
        JSON.stringify(
          {
            name: "nitropack-edgio-output",
            version: "1.0.0",
            private: true,
            scripts: {
              build: "npm i && edgio build",
              deploy: "npm i && edgio deploy",
              start: "npm i && edgio run --production",
              preview: "npm i && edgio build && edgio run --production"
            },
            devDependencies: {
              "@edgio/cli": "^6",
              "@edgio/core": "^6"
            }
          },
          null,
          2
        )
      );
      await writeFile(
        resolve(nitro.options.output.dir, "package-lock.json"),
        ""
      );
    }
  }
});
async function writeFile(path, contents) {
  await promises.mkdir(dirname(path), { recursive: true });
  await promises.writeFile(path, contents, "utf8");
}

const netlify = defineNitroPreset({
  extends: "aws-lambda",
  entry: "#internal/nitro/entries/netlify",
  output: {
    dir: "{{ rootDir }}/.netlify/functions-internal",
    publicDir: "{{ rootDir }}/dist"
  },
  rollupConfig: {
    output: {
      entryFileNames: "server.mjs"
    }
  },
  hooks: {
    "rollup:before": (nitro) => {
      if (!nitro.options.future.nativeSWR) {
        deprecateSWR$1(nitro);
      }
    },
    async compiled(nitro) {
      await writeHeaders(nitro);
      await writeRedirects(nitro);
      const functionConfig = {
        config: { nodeModuleFormat: "esm" },
        version: 1
      };
      const functionConfigPath = join(
        nitro.options.output.serverDir,
        "server.json"
      );
      await promises.writeFile(functionConfigPath, JSON.stringify(functionConfig));
    }
  }
});
const netlifyBuilder = defineNitroPreset({
  extends: "netlify",
  entry: "#internal/nitro/entries/netlify-builder",
  hooks: {
    "rollup:before": (nitro) => deprecateSWR$1(nitro)
  }
});
const netlifyEdge = defineNitroPreset({
  extends: "base-worker",
  entry: "#internal/nitro/entries/netlify-edge",
  output: {
    serverDir: "{{ rootDir }}/.netlify/edge-functions",
    publicDir: "{{ rootDir }}/dist"
  },
  rollupConfig: {
    output: {
      entryFileNames: "server.mjs",
      format: "esm"
    }
  },
  hooks: {
    "rollup:before": (nitro) => deprecateSWR$1(nitro),
    async compiled(nitro) {
      const manifest = {
        version: 1,
        functions: [
          {
            function: "server",
            pattern: "^.*$"
          }
        ]
      };
      const manifestPath = join(
        nitro.options.rootDir,
        ".netlify/edge-functions/manifest.json"
      );
      await promises.mkdir(dirname(manifestPath), { recursive: true });
      await promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }
});
const netlifyStatic = defineNitroPreset({
  extends: "static",
  output: {
    publicDir: "{{ rootDir }}/dist"
  },
  commands: {
    preview: "npx serve ./static"
  },
  hooks: {
    "rollup:before": (nitro) => deprecateSWR$1(nitro),
    async compiled(nitro) {
      await writeHeaders(nitro);
      await writeRedirects(nitro);
    }
  }
});
async function writeRedirects(nitro) {
  const redirectsPath = join(nitro.options.output.publicDir, "_redirects");
  const staticFallback = existsSync(
    join(nitro.options.output.publicDir, "404.html")
  ) ? "/* /404.html 404" : "";
  let contents = !nitro.options.static ? "/* /.netlify/functions/server 200" : staticFallback;
  const rules = Object.entries(nitro.options.routeRules).sort(
    (a, b) => a[0].split(/\/(?!\*)/).length - b[0].split(/\/(?!\*)/).length
  );
  if (!nitro.options.static) {
    for (const [key, value] of rules.filter(
      ([_, value2]) => value2.isr !== void 0
    )) {
      contents = value.isr ? `${key.replace("/**", "/*")}	/.netlify/builders/server 200
` + contents : `${key.replace("/**", "/*")}	/.netlify/functions/server 200
` + contents;
    }
  }
  for (const [key, routeRules] of rules.filter(
    ([_, routeRules2]) => routeRules2.redirect
  )) {
    let code = routeRules.redirect.statusCode;
    code = { 307: 302, 308: 301 }[code] || code;
    contents = `${key.replace("/**", "/*")}	${routeRules.redirect.to}	${code}
` + contents;
  }
  if (existsSync(redirectsPath)) {
    const currentRedirects = await promises.readFile(redirectsPath, "utf8");
    if (/^\/\* /m.test(currentRedirects)) {
      nitro.logger.info(
        "Not adding Nitro fallback to `_redirects` (as an existing fallback was found)."
      );
      return;
    }
    nitro.logger.info(
      "Adding Nitro fallback to `_redirects` to handle all unmatched routes."
    );
    contents = currentRedirects + "\n" + contents;
  }
  await promises.writeFile(redirectsPath, contents);
}
async function writeHeaders(nitro) {
  const headersPath = join(nitro.options.output.publicDir, "_headers");
  let contents = "";
  const rules = Object.entries(nitro.options.routeRules).sort(
    (a, b) => b[0].split(/\/(?!\*)/).length - a[0].split(/\/(?!\*)/).length
  );
  for (const [path, routeRules] of rules.filter(
    ([_, routeRules2]) => routeRules2.headers
  )) {
    const headers = [
      path.replace("/**", "/*"),
      ...Object.entries({ ...routeRules.headers }).map(
        ([header, value]) => `  ${header}: ${value}`
      )
    ].join("\n");
    contents += headers + "\n";
  }
  if (existsSync(headersPath)) {
    const currentHeaders = await promises.readFile(headersPath, "utf8");
    if (/^\/\* /m.test(currentHeaders)) {
      nitro.logger.info(
        "Not adding Nitro fallback to `_headers` (as an existing fallback was found)."
      );
      return;
    }
    nitro.logger.info(
      "Adding Nitro fallback to `_headers` to handle all unmatched routes."
    );
    contents = currentHeaders + "\n" + contents;
  }
  await promises.writeFile(headersPath, contents);
}
function deprecateSWR$1(nitro) {
  let hasLegacyOptions = false;
  for (const [key, value] of Object.entries(nitro.options.routeRules)) {
    if ("isr" in value) {
      continue;
    }
    if (value.cache === false) {
      value.isr = false;
    }
    if ("static" in value) {
      value.isr = !value.static;
    }
    if (value.cache && "swr" in value.cache) {
      value.isr = value.cache.swr;
    }
    hasLegacyOptions = hasLegacyOptions || "isr" in value;
  }
  if (hasLegacyOptions) {
    console.warn(
      "[nitro] Nitro now uses `isr` option to configure ISR behavior on Netlify. Backwards-compatible support for `static` and `swr` support with Builder Functions will be removed in the future versions."
    );
  }
}

const nitroDev = defineNitroPreset({
  extends: "node",
  entry: "#internal/nitro/entries/nitro-dev",
  output: {
    serverDir: "{{ buildDir }}/dev"
  },
  externals: { trace: false },
  inlineDynamicImports: true,
  // externals plugin limitation
  sourceMap: true
});

const nitroPrerender = defineNitroPreset({
  extends: "node",
  entry: "#internal/nitro/entries/nitro-prerenderer",
  output: {
    serverDir: "{{ buildDir }}/prerender"
  },
  externals: { trace: false }
});

const cli = defineNitroPreset({
  extends: "node",
  entry: "#internal/nitro/entries/cli",
  commands: {
    preview: "Run with node ./server/index.mjs [route]"
  }
});

const nodeServer = defineNitroPreset({
  extends: "node",
  entry: "#internal/nitro/entries/node-server",
  serveStatic: true,
  commands: {
    preview: "node ./server/index.mjs"
  }
});
const nodeCluster = defineNitroPreset({
  extends: "node-server",
  entry: "#internal/nitro/entries/node-cluster"
});

const node = defineNitroPreset({
  entry: "#internal/nitro/entries/node"
});

const renderCom = defineNitroPreset({
  extends: "node-server"
});

const scriptTemplate = (baseURL = "/") => `
<script>
async function register () {
  const registration = await navigator.serviceWorker.register('${joinURL(
  baseURL,
  "sw.js"
)}')
  await navigator.serviceWorker.ready
  registration.active.addEventListener('statechange', (event) => {
    if (event.target.state === 'activated') {
      window.location.reload()
    }
  })
}
if ('serviceWorker' in navigator) {
  if (location.hostname !== 'localhost' && location.protocol === 'http:') {
    location.replace(location.href.replace('http://', 'https://'))
  } else {
    register()
  }
}
<\/script>
`;
const htmlTemplate = (baseURL = "/") => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="prefetch" href="${joinURL(baseURL, "sw.js")}">
  <link rel="prefetch" href="${joinURL(baseURL, "server/index.mjs")}">
  ${scriptTemplate(baseURL)}
</head>
<body>
  Initializing nitro service worker...
</body>
</html>`;
const serviceWorker = defineNitroPreset(() => {
  return {
    extends: "base-worker",
    entry: "#internal/nitro/entries/service-worker",
    output: {
      serverDir: "{{ output.dir }}/public/server"
    },
    commands: {
      preview: "npx serve ./public"
    },
    hooks: {
      "prerender:generate"(route, nitro) {
        const script = scriptTemplate(nitro.options.baseURL);
        route.contents = route.contents.replace(
          "</head>",
          `${script}
</head>`
        );
      },
      async compiled(nitro) {
        await promises.writeFile(
          resolve(nitro.options.output.publicDir, "sw.js"),
          `self.importScripts('${joinURL(
            nitro.options.baseURL,
            "server/index.mjs"
          )}');`,
          "utf8"
        );
        const html = htmlTemplate(nitro.options.baseURL);
        if (!existsSync(resolve(nitro.options.output.publicDir, "index.html"))) {
          await promises.writeFile(
            resolve(nitro.options.output.publicDir, "index.html"),
            html,
            "utf8"
          );
        }
        if (!existsSync(resolve(nitro.options.output.publicDir, "200.html"))) {
          await promises.writeFile(
            resolve(nitro.options.output.publicDir, "200.html"),
            html,
            "utf8"
          );
        }
        if (!existsSync(resolve(nitro.options.output.publicDir, "404.html"))) {
          await promises.writeFile(
            resolve(nitro.options.output.publicDir, "404.html"),
            html,
            "utf8"
          );
        }
      }
    }
  };
});

const stormkit = defineNitroPreset({
  entry: "#internal/nitro/entries/stormkit",
  output: {
    dir: "{{ rootDir }}/.stormkit"
  }
});

const vercel = defineNitroPreset({
  extends: "node",
  entry: "#internal/nitro/entries/vercel",
  output: {
    dir: "{{ rootDir }}/.vercel/output",
    serverDir: "{{ output.dir }}/functions/__nitro.func",
    publicDir: "{{ output.dir }}/static"
  },
  commands: {
    deploy: "",
    preview: ""
  },
  hooks: {
    "rollup:before": (nitro) => {
      if (!nitro.options.future.nativeSWR) {
        deprecateSWR(nitro);
      }
    },
    async compiled(nitro) {
      const buildConfigPath = resolve(nitro.options.output.dir, "config.json");
      const buildConfig = generateBuildConfig(nitro);
      await writeFile$1(buildConfigPath, JSON.stringify(buildConfig, null, 2));
      const systemNodeVersion = process.versions.node.split(".")[0];
      const runtimeVersion = `nodejs${systemNodeVersion}.x`;
      const customMemory = nitro.options.vercel?.functions?.memory;
      const customMaxDuration = nitro.options.vercel?.functions?.maxDuration;
      const functionConfigPath = resolve(
        nitro.options.output.serverDir,
        ".vc-config.json"
      );
      const functionConfig = {
        runtime: runtimeVersion,
        handler: "index.mjs",
        launcherType: "Nodejs",
        shouldAddHelpers: false,
        memory: customMemory,
        maxDuration: customMaxDuration
      };
      await writeFile$1(
        functionConfigPath,
        JSON.stringify(functionConfig, null, 2)
      );
      for (const [key, value] of Object.entries(nitro.options.routeRules)) {
        if (!value.isr) {
          continue;
        }
        const funcPrefix = resolve(
          nitro.options.output.serverDir,
          ".." + generateEndpoint(key)
        );
        await fsp.mkdir(dirname(funcPrefix), { recursive: true });
        await fsp.symlink(
          "./" + relative(dirname(funcPrefix), nitro.options.output.serverDir),
          funcPrefix + ".func",
          "junction"
        );
        await writeFile$1(
          funcPrefix + ".prerender-config.json",
          JSON.stringify({
            expiration: value.isr === true ? false : value.isr,
            allowQuery: key.includes("/**") ? ["url"] : void 0
          })
        );
      }
    }
  }
});
const vercelEdge = defineNitroPreset({
  extends: "base-worker",
  entry: "#internal/nitro/entries/vercel-edge",
  output: {
    dir: "{{ rootDir }}/.vercel/output",
    serverDir: "{{ output.dir }}/functions/__nitro.func",
    publicDir: "{{ output.dir }}/static"
  },
  commands: {
    deploy: "",
    preview: ""
  },
  rollupConfig: {
    output: {
      format: "module"
    }
  },
  hooks: {
    "rollup:before": (nitro) => deprecateSWR(nitro),
    async compiled(nitro) {
      const buildConfigPath = resolve(nitro.options.output.dir, "config.json");
      const buildConfig = generateBuildConfig(nitro);
      await writeFile$1(buildConfigPath, JSON.stringify(buildConfig, null, 2));
      const functionConfigPath = resolve(
        nitro.options.output.serverDir,
        ".vc-config.json"
      );
      const functionConfig = {
        runtime: "edge",
        entrypoint: "index.mjs",
        regions: nitro.options.vercel?.regions
      };
      await writeFile$1(
        functionConfigPath,
        JSON.stringify(functionConfig, null, 2)
      );
    }
  }
});
const vercelStatic = defineNitroPreset({
  extends: "static",
  output: {
    dir: "{{ rootDir }}/.vercel/output",
    publicDir: "{{ output.dir }}/static"
  },
  commands: {
    preview: "npx serve ./static"
  },
  hooks: {
    "rollup:before": (nitro) => deprecateSWR(nitro),
    async compiled(nitro) {
      const buildConfigPath = resolve(nitro.options.output.dir, "config.json");
      const buildConfig = generateBuildConfig(nitro);
      await writeFile$1(buildConfigPath, JSON.stringify(buildConfig, null, 2));
    }
  }
});
function generateBuildConfig(nitro) {
  const rules = Object.entries(nitro.options.routeRules).sort(
    (a, b) => b[0].split(/\/(?!\*)/).length - a[0].split(/\/(?!\*)/).length
  );
  const config = defu(nitro.options.vercel?.config, {
    version: 3,
    overrides: {
      // Nitro static prerendered route overrides
      ...Object.fromEntries(
        (nitro._prerenderedRoutes?.filter((r) => r.fileName !== r.route) || []).map(({ route, fileName }) => [
          withoutLeadingSlash(fileName),
          { path: route.replace(/^\//, "") }
        ])
      )
    },
    routes: [
      // Redirect and header rules
      ...rules.filter(([_, routeRules]) => routeRules.redirect || routeRules.headers).map(([path, routeRules]) => {
        let route = {
          src: path.replace("/**", "/.*")
        };
        if (routeRules.redirect) {
          route = defu(route, {
            status: routeRules.redirect.statusCode,
            headers: { Location: routeRules.redirect.to }
          });
        }
        if (routeRules.headers) {
          route = defu(route, { headers: routeRules.headers });
        }
        return route;
      }),
      // Public asset rules
      ...nitro.options.publicAssets.filter((asset) => !asset.fallthrough).map((asset) => asset.baseURL).map((baseURL) => ({
        src: baseURL + "(.*)",
        headers: {
          "cache-control": "public,max-age=31536000,immutable"
        },
        continue: true
      })),
      { handle: "filesystem" }
    ]
  });
  if (nitro.options.static) {
    return config;
  }
  config.routes.push(
    ...rules.filter(
      ([key, value]) => (
        // value.isr === false || (value.isr && key.includes("/**"))
        value.isr !== void 0
      )
    ).map(([key, value]) => {
      const src = key.replace(/^(.*)\/\*\*/, "(?<url>$1/.*)");
      if (value.isr === false) {
        return {
          src,
          dest: "/__nitro"
        };
      }
      return {
        src,
        dest: nitro.options.preset === "vercel-edge" ? "/__nitro?url=$url" : generateEndpoint(key) + "?url=$url"
      };
    }),
    ...nitro.options.routeRules["/"]?.isr ? [
      {
        src: "(?<url>/)",
        dest: "/__nitro-index"
      }
    ] : [],
    ...!nitro.options.routeRules["/**"]?.isr ? [
      {
        src: "/(.*)",
        dest: "/__nitro"
      }
    ] : []
  );
  return config;
}
function generateEndpoint(url) {
  if (url === "/") {
    return "/__nitro-index";
  }
  return url.includes("/**") ? "/__nitro-" + withoutLeadingSlash(url.replace(/\/\*\*.*/, "").replace(/[^a-z]/g, "-")) : url;
}
function deprecateSWR(nitro) {
  let hasLegacyOptions = false;
  for (const [key, value] of Object.entries(nitro.options.routeRules)) {
    if ("isr" in value) {
      continue;
    }
    if (value.cache === false) {
      value.isr = false;
    }
    if ("static" in value) {
      value.isr = !value.static;
    }
    if (value.cache && "swr" in value.cache) {
      value.isr = value.cache.swr;
    }
    hasLegacyOptions = hasLegacyOptions || "isr" in value;
  }
  if (hasLegacyOptions) {
    console.warn(
      "[nitro] Nitro now uses `isr` option to configure ISR behavior on Vercel. Backwards-compatible support for `static` and `swr` options within the Vercel Build Options API will be removed in the future versions."
    );
  }
}

const cleavr = defineNitroPreset({
  extends: "node-server"
});

const lagon = defineNitroPreset({
  extends: "base-worker",
  entry: "#internal/nitro/entries/lagon",
  commands: {
    preview: "npm run dev --prefix ./",
    deploy: "npm run deploy --prefix ./"
  },
  rollupConfig: {
    output: {
      entryFileNames: "index.mjs",
      format: "esm"
    }
  },
  hooks: {
    async compiled(nitro) {
      const root = nitro.options.output.dir;
      const indexPath = relative(
        root,
        resolve(nitro.options.output.serverDir, "index.mjs")
      );
      const assetsDir = relative(root, nitro.options.output.publicDir);
      await writeFile$1(
        resolve(root, ".lagon", "config.json"),
        JSON.stringify({
          function_id: "",
          organization_id: "",
          index: indexPath,
          client: null,
          assets: assetsDir
        })
      );
      await writeFile$1(
        resolve(nitro.options.output.dir, "package.json"),
        JSON.stringify(
          {
            private: true,
            scripts: {
              dev: "npx -p esbuild -p @lagon/cli lagon dev",
              deploy: "npx -p esbuild -p @lagon/cli lagon deploy"
            }
          },
          null,
          2
        )
      );
    }
  }
});

const _static = defineNitroPreset({
  static: true,
  output: {
    dir: "{{ rootDir }}/.output",
    publicDir: "{{ output.dir }}/public"
  },
  prerender: {
    crawlLinks: true
  },
  commands: {
    preview: "npx serve ./public"
  }
});

const githubPages = defineNitroPreset({
  extends: "static",
  commands: {
    deploy: "npx gh-pages -d ./public"
  },
  prerender: {
    routes: [
      // https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site
      "/404.html"
    ]
  },
  hooks: {
    async compiled(nitro) {
      await fsp.writeFile(
        join(nitro.options.output.publicDir, ".nojekyll"),
        ""
      );
    }
  }
});

const _PRESETS = {
  __proto__: null,
  awsLambda: awsLambda,
  azure: azure,
  azureFunctions: azureFunctions,
  baseWorker: baseWorker,
  cleavr: cleavr,
  cli: cli,
  cloudflare: cloudflare,
  cloudflareModule: cloudflareModule,
  cloudflarePages: cloudflarePages,
  deno: deno,
  digitalOcean: digitalOcean,
  edgio: edgio,
  firebase: firebase,
  githubPages: githubPages,
  heroku: heroku,
  lagon: lagon,
  layer0: edgio,
  netlify: netlify,
  netlifyBuilder: netlifyBuilder,
  netlifyEdge: netlifyEdge,
  netlifyStatic: netlifyStatic,
  nitroDev: nitroDev,
  nitroPrerender: nitroPrerender,
  node: node,
  nodeCluster: nodeCluster,
  nodeServer: nodeServer,
  renderCom: renderCom,
  serviceWorker: serviceWorker,
  static: _static,
  stormkit: stormkit,
  vercel: vercel,
  vercelEdge: vercelEdge,
  vercelStatic: vercelStatic
};

const nitroImports = [
  {
    from: "#internal/nitro",
    imports: [
      "defineCachedFunction",
      "defineCachedEventHandler",
      "cachedFunction",
      "cachedEventHandler",
      "useRuntimeConfig",
      "useStorage",
      "useNitroApp",
      "defineNitroPlugin",
      "nitroPlugin",
      "defineRenderHandler",
      "getRouteRules",
      "useAppConfig"
    ]
  }
];

const NitroDefaults = {
  // General
  debug: isDebug,
  logLevel: isTest ? 1 : 3,
  runtimeConfig: { app: {}, nitro: {} },
  appConfig: {},
  appConfigFiles: [],
  // Dirs
  scanDirs: [],
  buildDir: ".nitro",
  output: {
    dir: "{{ rootDir }}/.output",
    serverDir: "{{ output.dir }}/server",
    publicDir: "{{ output.dir }}/public"
  },
  // Features
  experimental: {},
  future: {},
  storage: {},
  devStorage: {},
  bundledStorage: [],
  publicAssets: [],
  serverAssets: [],
  plugins: [],
  imports: {
    exclude: [],
    dirs: [],
    presets: nitroImports,
    virtualImports: ["#imports"]
  },
  virtual: {},
  compressPublicAssets: false,
  // Dev
  dev: false,
  devServer: { watch: [] },
  watchOptions: { ignoreInitial: true },
  devProxy: {},
  // Routing
  baseURL: process.env.NITRO_APP_BASE_URL || "/",
  handlers: [],
  devHandlers: [],
  errorHandler: "#internal/nitro/error",
  routeRules: {},
  prerender: {
    concurrency: 1,
    interval: 0,
    crawlLinks: false,
    ignore: [],
    routes: []
  },
  // Rollup
  alias: {
    "#internal/nitro": runtimeDir
  },
  unenv: {},
  analyze: false,
  moduleSideEffects: [
    "unenv/runtime/polyfill/",
    "node-fetch-native/polyfill",
    "node-fetch-native/dist/polyfill"
  ],
  replace: {},
  node: true,
  sourceMap: true,
  // Advanced
  typescript: {
    strict: false,
    generateTsConfig: true,
    tsconfigPath: "types/tsconfig.json",
    internalPaths: false
  },
  nodeModulesDirs: [],
  hooks: {},
  commands: {}
};
async function loadOptions(configOverrides = {}, opts = {}) {
  let presetOverride = configOverrides.preset || process.env.NITRO_PRESET;
  if (configOverrides.dev) {
    presetOverride = "nitro-dev";
  }
  configOverrides = klona(configOverrides);
  globalThis.defineNitroConfig = globalThis.defineNitroConfig || ((c) => c);
  const c12Config = await (opts.watch ? watchConfig : loadConfig)({
    name: "nitro",
    cwd: configOverrides.rootDir,
    dotenv: configOverrides.dev,
    extend: { extendKey: ["extends", "preset"] },
    overrides: {
      ...configOverrides,
      preset: presetOverride
    },
    defaultConfig: {
      preset: detectTarget() || "node-server"
    },
    defaults: NitroDefaults,
    jitiOptions: {
      alias: {
        nitropack: "nitropack/config",
        "nitropack/config": "nitropack/config"
      }
    },
    resolve(id) {
      const presets = _PRESETS;
      let matchedPreset = presets[camelCase(id)] || presets[id];
      if (!matchedPreset) {
        return null;
      }
      if (typeof matchedPreset === "function") {
        matchedPreset = matchedPreset();
      }
      return {
        config: matchedPreset
      };
    },
    ...opts.c12
  });
  const options = klona(c12Config.config);
  options._config = configOverrides;
  options._c12 = c12Config;
  options.preset = presetOverride || c12Config.layers.find((l) => l.config.preset)?.config.preset || (detectTarget({ static: options.static }) ?? "node-server");
  options.rootDir = resolve(options.rootDir || ".");
  options.workspaceDir = await findWorkspaceDir(options.rootDir).catch(
    () => options.rootDir
  );
  options.srcDir = resolve(options.srcDir || options.rootDir);
  for (const key of ["srcDir", "publicDir", "buildDir"]) {
    options[key] = resolve(options.rootDir, options[key]);
  }
  options.alias = {
    ...options.alias,
    "~/": join(options.srcDir, "/"),
    "@/": join(options.srcDir, "/"),
    "~~/": join(options.rootDir, "/"),
    "@@/": join(options.rootDir, "/")
  };
  if (!options.static && !options.entry) {
    throw new Error(
      `Nitro entry is missing! Is "${options.preset}" preset correct?`
    );
  }
  if (options.entry) {
    options.entry = resolvePath(options.entry, options);
  }
  options.output.dir = resolvePath(
    options.output.dir || NitroDefaults.output.dir,
    options
  );
  options.output.publicDir = resolvePath(
    options.output.publicDir || NitroDefaults.output.publicDir,
    options
  );
  options.output.serverDir = resolvePath(
    options.output.serverDir || NitroDefaults.output.serverDir,
    options
  );
  options.nodeModulesDirs.push(resolve(options.workspaceDir, "node_modules"));
  options.nodeModulesDirs.push(resolve(options.rootDir, "node_modules"));
  options.nodeModulesDirs.push(resolve(pkgDir, "node_modules"));
  options.nodeModulesDirs = [
    ...new Set(
      options.nodeModulesDirs.map((dir) => resolve(options.rootDir, dir))
    )
  ];
  options.scanDirs.unshift(options.srcDir);
  options.scanDirs = options.scanDirs.map(
    (dir) => resolve(options.srcDir, dir)
  );
  options.scanDirs = [...new Set(options.scanDirs)];
  if (options.imports && Array.isArray(options.imports.exclude) && options.imports.exclude.length === 0) {
    options.imports.exclude.push(/[/\\]\.git[/\\]/);
    options.imports.exclude.push(options.buildDir);
    const scanDirsInNodeModules = options.scanDirs.map((dir) => dir.match(/(?<=\/)node_modules\/(.+)$/)?.[1]).filter(Boolean);
    options.imports.exclude.push(
      scanDirsInNodeModules.length > 0 ? new RegExp(
        `node_modules\\/(?!${scanDirsInNodeModules.map((dir) => escapeRE(dir)).join("|")})`
      ) : /[/\\]node_modules[/\\]/
    );
  }
  if (options.imports) {
    const h3Exports = await resolveModuleExportNames("h3", {
      url: import.meta.url
    });
    options.imports.presets.push({
      from: "h3",
      imports: h3Exports.filter((n) => !/^[A-Z]/.test(n) && n !== "use")
    });
  }
  if (options.imports) {
    options.imports.dirs.push(
      ...options.scanDirs.map((dir) => join(dir, "utils/*"))
    );
  }
  options.appConfigFiles = options.appConfigFiles.map((file) => resolveFile(resolvePath(file, options))).filter(Boolean);
  for (const dir of options.scanDirs) {
    const configFile = resolveFile("app.config", dir);
    if (configFile && !options.appConfigFiles.includes(configFile)) {
      options.appConfigFiles.push(configFile);
    }
  }
  options.routeRules = defu(options.routeRules, options.routes || {});
  options.routeRules = normalizeRouteRules(options);
  options.baseURL = withLeadingSlash(withTrailingSlash(options.baseURL));
  options.runtimeConfig = normalizeRuntimeConfig(options);
  for (const publicAsset of options.publicAssets) {
    publicAsset.dir = resolve(options.srcDir, publicAsset.dir);
    publicAsset.baseURL = withLeadingSlash(
      withoutTrailingSlash(publicAsset.baseURL || "/")
    );
  }
  for (const serverAsset of options.serverAssets) {
    serverAsset.dir = resolve(options.srcDir, serverAsset.dir);
  }
  for (const pkg of ["defu", "h3", "radix3"]) {
    if (!options.alias[pkg]) {
      options.alias[pkg] = await resolvePath$1(pkg, { url: import.meta.url });
    }
  }
  const fsMounts = {
    root: resolve(options.rootDir),
    src: resolve(options.srcDir),
    build: resolve(options.buildDir),
    cache: resolve(options.buildDir, "cache")
  };
  for (const p in fsMounts) {
    options.devStorage[p] = options.devStorage[p] || {
      driver: "fs",
      readOnly: p === "root" || p === "src",
      base: fsMounts[p]
    };
  }
  options.plugins = options.plugins.map((p) => resolvePath(p, options));
  if (options.dev && options.experimental.openAPI) {
    options.handlers.push({
      route: "/_nitro/openapi.json",
      handler: "#internal/nitro/routes/openapi"
    });
    options.handlers.push({
      route: "/_nitro/swagger",
      handler: "#internal/nitro/routes/swagger"
    });
  }
  return options;
}
function normalizeRuntimeConfig(config) {
  provideFallbackValues(config.runtimeConfig);
  const runtimeConfig = defu(config.runtimeConfig, {
    app: {
      baseURL: config.baseURL
    },
    nitro: {}
  });
  runtimeConfig.nitro.routeRules = config.routeRules;
  return runtimeConfig;
}
function normalizeRouteRules(config) {
  const normalizedRules = {};
  for (const path in config.routeRules) {
    const routeConfig = config.routeRules[path];
    const routeRules = {
      ...routeConfig,
      redirect: void 0,
      proxy: void 0
    };
    if (routeConfig.redirect) {
      routeRules.redirect = {
        to: "/",
        statusCode: 307,
        ...typeof routeConfig.redirect === "string" ? { to: routeConfig.redirect } : routeConfig.redirect
      };
    }
    if (routeConfig.proxy) {
      routeRules.proxy = typeof routeConfig.proxy === "string" ? { to: routeConfig.proxy } : routeConfig.proxy;
      if (path.endsWith("/**")) {
        routeRules.proxy._proxyStripBase = path.slice(0, -3);
      }
    }
    if (routeConfig.cors) {
      routeRules.headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "*",
        "access-control-allow-headers": "*",
        "access-control-max-age": "0",
        ...routeRules.headers
      };
    }
    if (routeConfig.swr) {
      routeRules.cache = routeRules.cache || {};
      routeRules.cache.swr = true;
      if (typeof routeConfig.swr === "number") {
        routeRules.cache.maxAge = routeConfig.swr;
      }
    }
    if (routeConfig.cache === false) {
      routeRules.cache = false;
    }
    normalizedRules[path] = routeRules;
  }
  return normalizedRules;
}

async function createNitro(config = {}, opts = {}) {
  const options = await loadOptions(config, opts);
  const nitro = {
    options,
    hooks: createHooks(),
    vfs: {},
    logger: consola.withTag("nitro"),
    scannedHandlers: [],
    close: () => nitro.hooks.callHook("close"),
    storage: void 0,
    async updateConfig(config2) {
      nitro.options.routeRules = normalizeRouteRules(
        config2.routeRules ? config2 : nitro.options
      );
      nitro.options.runtimeConfig = normalizeRuntimeConfig(
        config2.runtimeConfig ? config2 : nitro.options
      );
      await nitro.hooks.callHook("rollup:reload");
      consola.success("Nitro config hot reloaded!");
    }
  };
  nitro.storage = await createStorage(nitro);
  nitro.hooks.hook("close", async () => {
    await nitro.storage.dispose();
  });
  if (nitro.options.debug) {
    createDebugger(nitro.hooks, { tag: "nitro" });
    nitro.options.plugins.push("#internal/nitro/debug");
  }
  if (nitro.options.timing) {
    nitro.options.plugins.push("#internal/nitro/timing");
  }
  if (nitro.options.logLevel !== void 0) {
    nitro.logger.level = nitro.options.logLevel;
  }
  nitro.hooks.addHooks(nitro.options.hooks);
  for (const dir of options.scanDirs) {
    const publicDir = resolve(dir, "public");
    if (!existsSync(publicDir)) {
      continue;
    }
    if (options.publicAssets.some((asset) => asset.dir === publicDir)) {
      continue;
    }
    options.publicAssets.push({ dir: publicDir });
  }
  for (const asset of options.publicAssets) {
    asset.baseURL = asset.baseURL || "/";
    const isTopLevel = asset.baseURL === "/";
    asset.fallthrough = asset.fallthrough ?? isTopLevel;
    const routeRule = options.routeRules[asset.baseURL + "/**"];
    asset.maxAge = routeRule?.cache?.maxAge ?? asset.maxAge ?? 0;
    if (asset.maxAge && !asset.fallthrough) {
      options.routeRules[asset.baseURL + "/**"] = defu(routeRule, {
        headers: {
          "cache-control": `public, max-age=${asset.maxAge}, immutable`
        }
      });
    }
  }
  nitro.options.serverAssets.push({
    baseName: "server",
    dir: resolve(nitro.options.srcDir, "assets")
  });
  const scannedPlugins = await scanPlugins(nitro);
  for (const plugin of scannedPlugins) {
    if (!nitro.options.plugins.includes(plugin)) {
      nitro.options.plugins.push(plugin);
    }
  }
  if (nitro.options.imports) {
    nitro.unimport = createUnimport(nitro.options.imports);
    nitro.options.virtual["#imports"] = () => nitro.unimport.toExports();
    nitro.options.virtual["#nitro"] = 'export * from "#imports"';
  }
  return nitro;
}

export { GLOB_SCAN_PATTERN as G, createNitro as a, build as b, copyPublicAssets as c, scanMiddleware as d, scanRoutes as e, scanPlugins as f, defineNitroPreset as g, compressPublicAssets as h, writeFile$1 as i, loadOptions as l, prepare as p, scanHandlers as s, writeTypes as w };
