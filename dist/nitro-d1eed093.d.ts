import { Preset } from 'unenv';
import { Unimport } from 'unimport';
import { UnimportPluginOptions } from 'unimport/unplugin';
import { PluginVisualizerOptions } from 'rollup-plugin-visualizer';
import { Hookable, NestedHooks } from 'hookable';
import { ConsolaInstance, LogLevel } from 'consola';
import { WatchOptions } from 'chokidar';
import { RollupCommonJSOptions } from '@rollup/plugin-commonjs';
import { RollupWasmOptions } from '@rollup/plugin-wasm';
import { Storage, BuiltinDriverName } from 'unstorage';
import { ServerOptions } from 'http-proxy';
import { RouterMethod, H3Event, EventHandler, H3Error, ProxyOptions } from 'h3';
import { ResolvedConfig, ConfigWatcher } from 'c12';
import { NodeFileTraceOptions } from '@vercel/nft';
import { InputOptions, OutputOptions } from 'rollup';
import { FetchRequest, FetchOptions, FetchResponse } from 'ofetch';
import { Loader } from 'esbuild';
import { FilterPattern } from '@rollup/pluginutils';

type MatchResult<Key extends string, Exact extends boolean = false, Score extends any[] = [], catchAll extends boolean = false> = {
    [k in Key]: {
        key: k;
        exact: Exact;
        score: Score;
        catchAll: catchAll;
    };
}[Key];
type Subtract<Minuend extends any[] = [], Subtrahend extends any[] = []> = Minuend extends [...Subtrahend, ...infer Remainder] ? Remainder : never;
type TupleIfDiff<First extends string, Second extends string, Tuple extends any[] = []> = First extends `${Second}${infer Diff}` ? Diff extends "" ? [] : Tuple : [];
type MaxTuple<N extends any[] = [], T extends any[] = []> = {
    current: T;
    result: MaxTuple<N, ["", ...T]>;
}[[N["length"]] extends [Partial<T>["length"]] ? "current" : "result"];
type CalcMatchScore<Key extends string, Route extends string, Score extends any[] = [], Init extends boolean = false, FirstKeySegMatcher extends string = Init extends true ? ":Invalid:" : ""> = `${Key}/` extends `${infer KeySeg}/${infer KeyRest}` ? KeySeg extends FirstKeySegMatcher ? Subtract<[
    ...Score,
    ...TupleIfDiff<Route, Key, ["", ""]>
], TupleIfDiff<Key, Route, ["", ""]>> : `${Route}/` extends `${infer RouteSeg}/${infer RouteRest}` ? `${RouteSeg}?` extends `${infer RouteSegWithoutQuery}?${string}` ? RouteSegWithoutQuery extends KeySeg ? CalcMatchScore<KeyRest, RouteRest, [...Score, "", ""]> : KeySeg extends `:${string}` ? RouteSegWithoutQuery extends "" ? never : CalcMatchScore<KeyRest, RouteRest, [...Score, ""]> : KeySeg extends RouteSegWithoutQuery ? CalcMatchScore<KeyRest, RouteRest, [...Score, ""]> : never : never : never : never;
type _MatchedRoutes<Route extends string, MatchedResultUnion extends MatchResult<string> = MatchResult<keyof InternalApi>> = MatchedResultUnion["key"] extends infer MatchedKeys ? MatchedKeys extends string ? Route extends MatchedKeys ? MatchResult<MatchedKeys, true> : MatchedKeys extends `${infer Root}/**${string}` ? MatchedKeys extends `${string}/**` ? Route extends `${Root}/${string}` ? MatchResult<MatchedKeys, false, [], true> : never : MatchResult<MatchedKeys, false, CalcMatchScore<Root, Route, [], true>> : MatchResult<MatchedKeys, false, CalcMatchScore<MatchedKeys, Route, [], true>> : never : never;
type MatchedRoutes<Route extends string, MatchedKeysResult extends MatchResult<string> = MatchResult<keyof InternalApi>, Matches extends MatchResult<string> = _MatchedRoutes<Route, MatchedKeysResult>> = Route extends "/" ? keyof InternalApi : Extract<Matches, {
    exact: true;
}> extends never ? Extract<Exclude<Matches, {
    score: never;
}>, {
    score: MaxTuple<Matches["score"]>;
}>["key"] | Extract<Matches, {
    catchAll: true;
}>["key"] : Extract<Matches, {
    exact: true;
}>["key"];
type KebabCase<T extends string, A extends string = ""> = T extends `${infer F}${infer R}` ? KebabCase<R, `${A}${F extends Lowercase<F> ? "" : "-"}${Lowercase<F>}`> : A;

interface InternalApi {
}
type NitroFetchRequest = Exclude<keyof InternalApi, `/_${string}` | `/api/_${string}`> | Exclude<FetchRequest, string> | (string & {});
type MiddlewareOf<Route extends string, Method extends RouterMethod | "default"> = Method extends keyof InternalApi[MatchedRoutes<Route>] ? Exclude<InternalApi[MatchedRoutes<Route>][Method], Error | void> : never;
type TypedInternalResponse<Route, Default = unknown, Method extends RouterMethod = RouterMethod> = Default extends string | boolean | number | null | void | object ? Default : Route extends string ? MiddlewareOf<Route, Method> extends never ? MiddlewareOf<Route, "default"> extends never ? Default : MiddlewareOf<Route, "default"> : MiddlewareOf<Route, Method> : Default;
type AvailableRouterMethod<R extends NitroFetchRequest> = R extends string ? keyof InternalApi[MatchedRoutes<R>] extends undefined ? RouterMethod : Extract<keyof InternalApi[MatchedRoutes<R>], "default"> extends undefined ? Extract<RouterMethod, keyof InternalApi[MatchedRoutes<R>]> : RouterMethod : RouterMethod;
interface NitroFetchOptions<R extends NitroFetchRequest, M extends AvailableRouterMethod<R> = AvailableRouterMethod<R>> extends FetchOptions {
    method?: Uppercase<M> | M;
}
type ExtractedRouteMethod<R extends NitroFetchRequest, O extends NitroFetchOptions<R>> = O extends undefined ? "get" : Lowercase<O["method"]> extends RouterMethod ? Lowercase<O["method"]> : "get";
interface $Fetch<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest> {
    <T = DefaultT, R extends NitroFetchRequest = DefaultR, O extends NitroFetchOptions<R> = NitroFetchOptions<R>>(request: R, opts?: O): Promise<TypedInternalResponse<R, T, ExtractedRouteMethod<R, O>>>;
    raw<T = DefaultT, R extends NitroFetchRequest = DefaultR, O extends NitroFetchOptions<R> = NitroFetchOptions<R>>(request: R, opts?: O): Promise<FetchResponse<TypedInternalResponse<R, T, ExtractedRouteMethod<R, O>>>>;
    create<T = DefaultT, R extends NitroFetchRequest = DefaultR>(defaults: FetchOptions): $Fetch<T, R>;
}
declare global {
    var $fetch: $Fetch;
    namespace NodeJS {
        interface Global {
            $fetch: $Fetch;
        }
    }
}

interface NodeExternalsOptions {
    inline?: string[];
    external?: string[];
    outDir?: string;
    trace?: boolean;
    traceOptions?: NodeFileTraceOptions;
    moduleDirectories?: string[];
    exportConditions?: string[];
    traceInclude?: string[];
}

type RollupConfig = InputOptions & {
    output: OutputOptions;
};

type Options = {
    include?: FilterPattern;
    exclude?: FilterPattern;
    sourceMap?: boolean | "inline" | "hidden";
    minify?: boolean;
    target: string | string[];
    jsxFactory?: string;
    jsxFragment?: string;
    define?: {
        [k: string]: string;
    };
    /**
     * Use this tsconfig file instead
     * Disable it by setting to `false`
     */
    tsconfig?: string | false;
    /**
     * Map extension to esbuild loader
     * Note that each entry (the extension) needs to start with a dot
     */
    loaders?: {
        [ext: string]: Loader | false;
    };
};

interface CacheEntry<T = any> {
    value?: T;
    expires?: number;
    mtime?: number;
    integrity?: string;
}
interface CacheOptions<T = any> {
    name?: string;
    getKey?: (...args: any[]) => string | Promise<string>;
    transform?: (entry: CacheEntry<T>, ...args: any[]) => any;
    validate?: (entry: CacheEntry<T>) => boolean;
    shouldInvalidateCache?: (...args: any[]) => boolean;
    shouldBypassCache?: (...args: any[]) => boolean;
    group?: string;
    integrity?: any;
    maxAge?: number;
    swr?: boolean;
    staleMaxAge?: number;
    base?: string;
}
interface ResponseCacheEntry<T = any> {
    body: T;
    code: number;
    headers: Record<string, string | number | string[]>;
}
interface CachedEventHandlerOptions<T = any> extends Omit<CacheOptions<ResponseCacheEntry<T>>, "transform" | "validate"> {
    shouldInvalidateCache?: (event: H3Event) => boolean;
    shouldBypassCache?: (event: H3Event) => boolean;
    getKey?: (event: H3Event) => string | Promise<string>;
    headersOnly?: boolean;
}

declare module "h3" {
    interface H3Event {
        /** @experimental Calls fetch with same context and request headers */
        fetch: typeof globalThis.fetch;
        /** @experimental Calls fetch with same context and request headers */
        $fetch: typeof globalThis.fetch;
    }
}

declare const awsLambda: NitroPreset;

declare const azureFunctions: NitroPreset;

declare const azure: NitroPreset;

declare const baseWorker: NitroPreset;

declare const cloudflareModule: NitroPreset;

declare const cloudflarePages: NitroPreset;

declare const cloudflare: NitroPreset;

declare const deno: NitroPreset;

declare const digitalOcean: NitroPreset;

declare const firebase: NitroPreset;

declare const heroku: NitroPreset;

declare const edgio: NitroPreset;

declare const netlify: NitroPreset;
declare const netlifyBuilder: NitroPreset;
declare const netlifyEdge: NitroPreset;
declare const netlifyStatic: NitroPreset;

declare const nitroDev: NitroPreset;

declare const nitroPrerender: NitroPreset;

declare const cli: NitroPreset;

declare const nodeServer: NitroPreset;
declare const nodeCluster: NitroPreset;

declare const node: NitroPreset;

declare const renderCom: NitroPreset;

declare const serviceWorker: NitroPreset;

declare const stormkit: NitroPreset;

declare const vercel: NitroPreset;
declare const vercelEdge: NitroPreset;
declare const vercelStatic: NitroPreset;

declare const cleavr: NitroPreset;

/**
 * Both function_id and organization_id fields are required but only used when deploying the function
 * Ref: https://github.com/lagonapp/lagon/blob/06093d051898d7603f356b9cae5e3f14078d480a/crates/cli/src/utils/deployments.rs#L34
 */
interface LagonFunctionConfig {
    function_id: string;
    organization_id: string;
    index: string;
    client?: string;
    assets?: string;
}
declare const lagon: NitroPreset;

declare const _static: NitroPreset;

declare const githubPages: NitroPreset;

type _PRESETS_LagonFunctionConfig = LagonFunctionConfig;
declare const _PRESETS_awsLambda: typeof awsLambda;
declare const _PRESETS_azure: typeof azure;
declare const _PRESETS_azureFunctions: typeof azureFunctions;
declare const _PRESETS_baseWorker: typeof baseWorker;
declare const _PRESETS_cleavr: typeof cleavr;
declare const _PRESETS_cli: typeof cli;
declare const _PRESETS_cloudflare: typeof cloudflare;
declare const _PRESETS_cloudflareModule: typeof cloudflareModule;
declare const _PRESETS_cloudflarePages: typeof cloudflarePages;
declare const _PRESETS_deno: typeof deno;
declare const _PRESETS_digitalOcean: typeof digitalOcean;
declare const _PRESETS_edgio: typeof edgio;
declare const _PRESETS_firebase: typeof firebase;
declare const _PRESETS_githubPages: typeof githubPages;
declare const _PRESETS_heroku: typeof heroku;
declare const _PRESETS_lagon: typeof lagon;
declare const _PRESETS_netlify: typeof netlify;
declare const _PRESETS_netlifyBuilder: typeof netlifyBuilder;
declare const _PRESETS_netlifyEdge: typeof netlifyEdge;
declare const _PRESETS_netlifyStatic: typeof netlifyStatic;
declare const _PRESETS_nitroDev: typeof nitroDev;
declare const _PRESETS_nitroPrerender: typeof nitroPrerender;
declare const _PRESETS_node: typeof node;
declare const _PRESETS_nodeCluster: typeof nodeCluster;
declare const _PRESETS_nodeServer: typeof nodeServer;
declare const _PRESETS_renderCom: typeof renderCom;
declare const _PRESETS_serviceWorker: typeof serviceWorker;
declare const _PRESETS_stormkit: typeof stormkit;
declare const _PRESETS_vercel: typeof vercel;
declare const _PRESETS_vercelEdge: typeof vercelEdge;
declare const _PRESETS_vercelStatic: typeof vercelStatic;
declare namespace _PRESETS {
  export {
    _PRESETS_LagonFunctionConfig as LagonFunctionConfig,
    _PRESETS_awsLambda as awsLambda,
    _PRESETS_azure as azure,
    _PRESETS_azureFunctions as azureFunctions,
    _PRESETS_baseWorker as baseWorker,
    _PRESETS_cleavr as cleavr,
    _PRESETS_cli as cli,
    _PRESETS_cloudflare as cloudflare,
    _PRESETS_cloudflareModule as cloudflareModule,
    _PRESETS_cloudflarePages as cloudflarePages,
    _PRESETS_deno as deno,
    _PRESETS_digitalOcean as digitalOcean,
    _PRESETS_edgio as edgio,
    _PRESETS_firebase as firebase,
    _PRESETS_githubPages as githubPages,
    _PRESETS_heroku as heroku,
    _PRESETS_lagon as lagon,
    edgio as layer0,
    _PRESETS_netlify as netlify,
    _PRESETS_netlifyBuilder as netlifyBuilder,
    _PRESETS_netlifyEdge as netlifyEdge,
    _PRESETS_netlifyStatic as netlifyStatic,
    _PRESETS_nitroDev as nitroDev,
    _PRESETS_nitroPrerender as nitroPrerender,
    _PRESETS_node as node,
    _PRESETS_nodeCluster as nodeCluster,
    _PRESETS_nodeServer as nodeServer,
    _PRESETS_renderCom as renderCom,
    _PRESETS_serviceWorker as serviceWorker,
    _static as static,
    _PRESETS_stormkit as stormkit,
    _PRESETS_vercel as vercel,
    _PRESETS_vercelEdge as vercelEdge,
    _PRESETS_vercelStatic as vercelStatic,
  };
}

interface NitroEventHandler {
    /**
     * Path prefix or route
     *
     * If an empty string used, will be used as a middleware
     */
    route?: string;
    /**
     * Specifies this is a middleware handler.
     * Middleware are called on every route and should normally return nothing to pass to the next handlers
     */
    middleware?: boolean;
    /**
     * Use lazy loading to import handler
     */
    lazy?: boolean;
    /**
     * Path to event handler
     *
     */
    handler: string;
    /**
     * Router method matcher
     */
    method?: string;
}
interface NitroDevEventHandler {
    /**
     * Path prefix or route
     */
    route?: string;
    /**
     * Event handler
     *
     */
    handler: EventHandler;
}
type NitroErrorHandler = (error: H3Error, event: H3Event) => void | Promise<void>;

/**
 * Vercel Build Output Configuration
 * @see https://vercel.com/docs/build-output-api/v3
 */
interface VercelBuildConfigV3 {
    version: 3;
    routes?: ({
        src: string;
        headers: {
            "cache-control": string;
        };
        continue: boolean;
    } | {
        handle: string;
    } | {
        src: string;
        dest: string;
    })[];
    images?: {
        sizes: number[];
        domains: string[];
        remotePatterns?: {
            protocol?: "http" | "https";
            hostname: string;
            port?: string;
            pathname?: string;
        }[];
        minimumCacheTTL?: number;
        formats?: ("image/avif" | "image/webp")[];
        dangerouslyAllowSVG?: boolean;
        contentSecurityPolicy?: string;
    };
    wildcard?: Array<{
        domain: string;
        value: string;
    }>;
    overrides?: Record<string, {
        path?: string;
        contentType?: string;
    }>;
    cache?: string[];
    crons?: {
        path: string;
        schedule: string;
    }[];
}
interface PresetOptions {
    vercel: {
        config: VercelBuildConfigV3;
        /**
         * If you are using `vercel-edge`, you can specify the region(s) for your edge function.
         * @see https://vercel.com/docs/concepts/functions/edge-functions#edge-function-regions
         */
        regions?: string[];
        functions?: {
            memory: number;
            maxDuration: number;
        };
    };
}

type NitroDynamicConfig = Pick<NitroConfig, "runtimeConfig" | "routeRules">;
interface Nitro {
    options: NitroOptions;
    scannedHandlers: NitroEventHandler[];
    vfs: Record<string, string>;
    hooks: Hookable<NitroHooks>;
    unimport?: Unimport;
    logger: ConsolaInstance;
    storage: Storage;
    close: () => Promise<void>;
    updateConfig: (config: NitroDynamicConfig) => void | Promise<void>;
    _prerenderedRoutes?: PrerenderGenerateRoute[];
}
interface PrerenderRoute {
    route: string;
    contents?: string;
    data?: ArrayBuffer;
    fileName?: string;
    error?: Error & {
        statusCode: number;
        statusMessage: string;
    };
    generateTimeMS?: number;
}
interface PrerenderGenerateRoute extends PrerenderRoute {
    skip?: boolean;
}
type HookResult = void | Promise<void>;
interface NitroHooks {
    "rollup:before": (nitro: Nitro, config: RollupConfig) => HookResult;
    compiled: (nitro: Nitro) => HookResult;
    "dev:reload": () => HookResult;
    "rollup:reload": () => HookResult;
    restart: () => HookResult;
    close: () => HookResult;
    "prerender:routes": (routes: Set<string>) => HookResult;
    "prerender:route": (route: PrerenderRoute) => HookResult;
    "prerender:generate": (route: PrerenderGenerateRoute, nitro: Nitro) => HookResult;
}
type CustomDriverName = string & {
    _custom?: any;
};
interface StorageMounts {
    [path: string]: {
        driver: BuiltinDriverName | CustomDriverName;
        [option: string]: any;
    };
}
type DeepPartial<T> = T extends Record<string, any> ? {
    [P in keyof T]?: DeepPartial<T[P]> | T[P];
} : T;
type NitroPreset = NitroConfig | (() => NitroConfig);
interface NitroConfig extends DeepPartial<Omit<NitroOptions, "routeRules" | "rollupConfig">> {
    extends?: string | string[] | NitroPreset;
    routeRules?: {
        [path: string]: NitroRouteConfig;
    };
    rollupConfig?: Partial<RollupConfig>;
}
interface AppConfig {
    [key: string]: any;
}
interface PublicAssetDir {
    baseURL?: string;
    fallthrough?: boolean;
    maxAge: number;
    dir: string;
}
interface ServerAssetDir {
    baseName: string;
    dir: string;
}
interface DevServerOptions {
    watch: string[];
}
interface CompressOptions {
    gzip?: boolean;
    brotli?: boolean;
}
type Enumerate<N extends number, Acc extends number[] = []> = Acc["length"] extends N ? Acc[number] : Enumerate<N, [...Acc, Acc["length"]]>;
type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;
type HTTPStatusCode = IntRange<100, 600>;
type ExcludeFunctions<G extends Record<string, any>> = Pick<G, {
    [P in keyof G]: NonNullable<G[P]> extends Function ? never : P;
}[keyof G]>;
interface NitroRouteConfig {
    cache?: ExcludeFunctions<CachedEventHandlerOptions> | false;
    headers?: Record<string, string>;
    redirect?: string | {
        to: string;
        statusCode?: HTTPStatusCode;
    };
    prerender?: boolean;
    proxy?: string | ({
        to: string;
    } & ProxyOptions);
    isr?: number | boolean;
    cors?: boolean;
    swr?: boolean | number;
    static?: boolean | number;
}
interface NitroRouteRules extends Omit<NitroRouteConfig, "redirect" | "cors" | "swr" | "static"> {
    redirect?: {
        to: string;
        statusCode: HTTPStatusCode;
    };
    proxy?: {
        to: string;
    } & ProxyOptions;
}
interface NitroOptions extends PresetOptions {
    _config: NitroConfig;
    _c12: ResolvedConfig<NitroConfig> | ConfigWatcher<NitroConfig>;
    debug: boolean;
    preset: KebabCase<keyof typeof _PRESETS> | (string & {});
    static: boolean;
    logLevel: LogLevel;
    runtimeConfig: {
        app: {
            baseURL: string;
        };
        [key: string]: any;
    };
    appConfig: AppConfig;
    appConfigFiles: string[];
    workspaceDir: string;
    rootDir: string;
    srcDir: string;
    scanDirs: string[];
    buildDir: string;
    output: {
        dir: string;
        serverDir: string;
        publicDir: string;
    };
    storage: StorageMounts;
    devStorage: StorageMounts;
    bundledStorage: string[];
    timing: boolean;
    renderer?: string;
    serveStatic: boolean | "node" | "deno";
    noPublicDir: boolean;
    experimental?: {
        wasm?: boolean | RollupWasmOptions;
        legacyExternals?: boolean;
        openAPI?: boolean;
    };
    future: {
        nativeSWR: boolean;
    };
    serverAssets: ServerAssetDir[];
    publicAssets: PublicAssetDir[];
    imports: UnimportPluginOptions | false;
    plugins: string[];
    virtual: Record<string, string | (() => string | Promise<string>)>;
    compressPublicAssets: boolean | CompressOptions;
    dev: boolean;
    devServer: DevServerOptions;
    watchOptions: WatchOptions;
    devProxy: Record<string, string | ServerOptions>;
    baseURL: string;
    handlers: NitroEventHandler[];
    routeRules: {
        [path: string]: NitroRouteRules;
    };
    devHandlers: NitroDevEventHandler[];
    errorHandler: string;
    devErrorHandler: NitroErrorHandler;
    prerender: {
        concurrency: number;
        interval: number;
        crawlLinks: boolean;
        ignore: string[];
        routes: string[];
    };
    rollupConfig?: RollupConfig;
    entry: string;
    unenv: Preset;
    alias: Record<string, string>;
    minify: boolean;
    inlineDynamicImports: boolean;
    sourceMap: boolean | "inline" | "hidden";
    node: boolean;
    moduleSideEffects: string[];
    esbuild?: {
        options?: Partial<Options>;
    };
    noExternals: boolean;
    externals: NodeExternalsOptions;
    analyze: false | PluginVisualizerOptions;
    replace: Record<string, string | ((id: string) => string)>;
    commonJS?: RollupCommonJSOptions;
    typescript: {
        strict?: boolean;
        internalPaths?: boolean;
        generateTsConfig?: boolean;
        /** the path of the generated `tsconfig.json`, relative to buildDir */
        tsconfigPath: string;
    };
    hooks: NestedHooks<NitroHooks>;
    nodeModulesDirs: string[];
    commands: {
        preview: string;
        deploy: string;
    };
}

export { $Fetch as $, AvailableRouterMethod as A, CompressOptions as C, DevServerOptions as D, ExtractedRouteMethod as E, InternalApi as I, KebabCase as K, MiddlewareOf as M, Nitro as N, PrerenderRoute as P, ResponseCacheEntry as R, StorageMounts as S, TypedInternalResponse as T, NitroConfig as a, NitroOptions as b, NitroEventHandler as c, NitroPreset as d, NitroFetchRequest as e, NitroFetchOptions as f, NitroDynamicConfig as g, PrerenderGenerateRoute as h, NitroHooks as i, AppConfig as j, PublicAssetDir as k, ServerAssetDir as l, NitroRouteConfig as m, NitroRouteRules as n, NitroDevEventHandler as o, NitroErrorHandler as p, MatchedRoutes as q, CacheEntry as r, CacheOptions as s, CachedEventHandlerOptions as t };
