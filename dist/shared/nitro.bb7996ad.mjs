import { pathToFileURL } from 'node:url';
import { relative, resolve, join } from 'pathe';
import { withBase, joinURL, withoutBase, parseURL } from 'ufo';
import chalk from 'chalk';
import { toRouteMatcher, createRouter } from 'radix3';
import { defu } from 'defu';
import { a as createNitro, b as build, h as compressPublicAssets, i as writeFile } from './nitro.de933615.mjs';

const allowedExtensions = /* @__PURE__ */ new Set(["", ".json"]);
async function prerender(nitro) {
  if (nitro.options.noPublicDir) {
    console.warn(
      "[nitro] Skipping prerender since `noPublicDir` option is enabled."
    );
    return;
  }
  const routes = new Set(nitro.options.prerender.routes);
  const prerenderRulePaths = Object.entries(nitro.options.routeRules).filter(([path2, options]) => options.prerender && !path2.includes("*")).map((e) => e[0]);
  for (const route of prerenderRulePaths) {
    routes.add(route);
  }
  if (nitro.options.prerender.crawlLinks && routes.size === 0) {
    routes.add("/");
  }
  await nitro.hooks.callHook("prerender:routes", routes);
  if (routes.size === 0) {
    return;
  }
  nitro.logger.info("Initializing prerenderer");
  nitro._prerenderedRoutes = [];
  const nitroRenderer = await createNitro({
    ...nitro.options._config,
    rootDir: nitro.options.rootDir,
    logLevel: 0,
    preset: "nitro-prerender"
  });
  let path = relative(nitro.options.output.dir, nitro.options.output.publicDir);
  if (!path.startsWith(".")) {
    path = `./${path}`;
  }
  nitroRenderer.options.commands.preview = `npx serve ${path}`;
  nitroRenderer.options.output.dir = nitro.options.output.dir;
  await build(nitroRenderer);
  const serverEntrypoint = resolve(
    nitroRenderer.options.output.serverDir,
    "index.mjs"
  );
  const { localFetch } = await import(pathToFileURL(serverEntrypoint).href);
  const _routeRulesMatcher = toRouteMatcher(
    createRouter({ routes: nitro.options.routeRules })
  );
  const _getRouteRules = (path2) => defu({}, ..._routeRulesMatcher.matchAll(path2).reverse());
  const generatedRoutes = /* @__PURE__ */ new Set();
  const skippedRoutes = /* @__PURE__ */ new Set();
  const displayedLengthWarns = /* @__PURE__ */ new Set();
  const canPrerender = (route = "/") => {
    if (generatedRoutes.has(route) || skippedRoutes.has(route)) {
      return false;
    }
    const FS_MAX_SEGMENT = 255;
    const FS_MAX_PATH = 1024;
    const FS_MAX_PATH_PUBLIC_HTML = FS_MAX_PATH - (nitro.options.output.publicDir.length + 10);
    if ((route.length >= FS_MAX_PATH_PUBLIC_HTML || route.split("/").some((s) => s.length > FS_MAX_SEGMENT)) && !displayedLengthWarns.has(route)) {
      displayedLengthWarns.add(route);
      const _route = route.slice(0, 60) + "...";
      if (route.length >= FS_MAX_PATH_PUBLIC_HTML) {
        nitro.logger.warn(
          `Prerendering long route "${_route}" (${route.length}) can cause filesystem issues since it exceeds ${FS_MAX_PATH_PUBLIC_HTML}-character limit when writing to \`${nitro.options.output.publicDir}\`.`
        );
      } else {
        nitro.logger.warn(
          `Skipping prerender of the route "${_route}" since it exceeds the ${FS_MAX_SEGMENT}-character limit in one of the path segments and can cause filesystem issues.`
        );
        return false;
      }
    }
    for (const ignore of nitro.options.prerender.ignore) {
      if (route.startsWith(ignore)) {
        return false;
      }
    }
    if (_getRouteRules(route).prerender === false) {
      return false;
    }
    return true;
  };
  const generateRoute = async (route) => {
    const start = Date.now();
    if (!canPrerender(route)) {
      skippedRoutes.add(route);
      return;
    }
    generatedRoutes.add(route);
    const _route = { route };
    const encodedRoute = encodeURI(route);
    const res = await localFetch(
      withBase(encodedRoute, nitro.options.baseURL),
      {
        headers: { "x-nitro-prerender": encodedRoute }
      }
    );
    _route.data = await res.arrayBuffer();
    Object.defineProperty(_route, "contents", {
      get: () => {
        if (!_route._contents) {
          _route._contents = new TextDecoder("utf8").decode(
            new Uint8Array(_route.data)
          );
        }
        return _route._contents;
      },
      set(value) {
        _route._contents = value;
        _route.data = new TextEncoder().encode(value);
      }
    });
    if (res.status !== 200) {
      _route.error = new Error(`[${res.status}] ${res.statusText}`);
      _route.error.statusCode = res.status;
      _route.error.statusMessage = res.statusText;
    }
    const isImplicitHTML = !route.endsWith(".html") && (res.headers.get("content-type") || "").includes("html");
    const routeWithIndex = route.endsWith("/") ? route + "index" : route;
    _route.fileName = isImplicitHTML ? joinURL(route, "index.html") : routeWithIndex;
    _route.fileName = withoutBase(_route.fileName, nitro.options.baseURL);
    await nitro.hooks.callHook("prerender:generate", _route, nitro);
    _route.generateTimeMS = Date.now() - start;
    if (_route.skip || _route.error) {
      return _route;
    }
    const filePath = join(nitro.options.output.publicDir, _route.fileName);
    await writeFile(filePath, Buffer.from(_route.data));
    nitro._prerenderedRoutes.push(_route);
    if (!_route.error && isImplicitHTML) {
      const extractedLinks = extractLinks(
        _route.contents,
        route,
        res,
        nitro.options.prerender.crawlLinks
      );
      for (const _link of extractedLinks) {
        if (canPrerender(_link)) {
          routes.add(_link);
        }
      }
    }
    return _route;
  };
  nitro.logger.info(
    nitro.options.prerender.crawlLinks ? `Prerendering ${routes.size} initial routes with crawler` : `Prerendering ${routes.size} routes`
  );
  async function processRoute(route) {
    const _route = await generateRoute(route).catch(
      (error) => ({ route, error })
    );
    if (!_route || _route.skip) {
      return;
    }
    await nitro.hooks.callHook("prerender:route", _route);
    if (_route.error) {
      nitro.logger.log(
        chalk[_route.error.statusCode === 404 ? "yellow" : "red"](
          `  \u251C\u2500 ${_route.route} (${_route.generateTimeMS}ms) ${`(${_route.error})`}`
        )
      );
    } else {
      nitro.logger.log(
        chalk.gray(`  \u251C\u2500 ${_route.route} (${_route.generateTimeMS}ms)`)
      );
    }
  }
  const tasks = /* @__PURE__ */ new Set();
  function refillQueue() {
    const workers = Math.min(
      nitro.options.prerender.concurrency - tasks.size,
      routes.size
    );
    return Promise.all(Array.from({ length: workers }, () => queueNext()));
  }
  function queueNext() {
    const route = routes.values().next().value;
    if (!route) {
      return;
    }
    routes.delete(route);
    const task = new Promise(
      (resolve2) => setTimeout(resolve2, nitro.options.prerender.interval)
    ).then(() => processRoute(route));
    tasks.add(task);
    return task.then(() => {
      tasks.delete(task);
      if (routes.size > 0) {
        return refillQueue();
      }
    });
  }
  await refillQueue();
  if (nitro.options.compressPublicAssets) {
    await compressPublicAssets(nitro);
  }
}
const LINK_REGEX = /href=["']?([^"'>]+)/g;
function extractLinks(html, from, res, crawlLinks) {
  const links = [];
  const _links = [];
  if (crawlLinks) {
    _links.push(
      ...[...html.matchAll(LINK_REGEX)].map((m) => m[1]).filter((link) => allowedExtensions.has(getExtension(link)))
    );
  }
  const header = res.headers.get("x-nitro-prerender") || "";
  _links.push(
    ...header.split(",").map((i) => i.trim()).map((i) => decodeURIComponent(i))
  );
  for (const link of _links.filter(Boolean)) {
    const parsed = parseURL(link);
    if (parsed.protocol) {
      continue;
    }
    let { pathname } = parsed;
    if (!pathname.startsWith("/")) {
      const fromURL = new URL(from, "http://localhost");
      pathname = new URL(pathname, fromURL).pathname;
    }
    links.push(pathname);
  }
  return links;
}
const EXT_REGEX = /\.[\da-z]+$/;
function getExtension(link) {
  const pathname = parseURL(link).pathname;
  return (pathname.match(EXT_REGEX) || [])[0] || "";
}

export { prerender as p };
