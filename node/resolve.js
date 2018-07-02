"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
const fs = require("fs");
const path = require("path");
const src_1 = require("../src");
const fs_1 = require("./fs");
/**
 * Exception thrown when a module could not be resolved.
 */
class ModuleNotFoundException extends src_1.BaseException {
    constructor(moduleName, basePath) {
        super(`Could not find module ${JSON.stringify(moduleName)} from ${JSON.stringify(basePath)}.`);
        this.moduleName = moduleName;
        this.basePath = basePath;
        this.code = 'MODULE_NOT_FOUND';
    }
}
exports.ModuleNotFoundException = ModuleNotFoundException;
/**
 * Returns a list of all the callers from the resolve() call.
 * @returns {string[]}
 * @private
 */
function _caller() {
    // see https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
    const error = Error;
    const origPrepareStackTrace = error.prepareStackTrace;
    error.prepareStackTrace = (_, stack) => stack;
    const stack = (new Error()).stack;
    error.prepareStackTrace = origPrepareStackTrace;
    return stack ? stack.map(x => x.getFileName()).filter(x => !!x) : [];
}
/**
 * Get the global directory for node_modules. This is based on NPM code itself, and may be subject
 * to change, but is relatively stable.
 * @returns {string} The path to node_modules itself.
 * @private
 */
function _getGlobalNodeModules() {
    let globalPrefix;
    if (process.env.PREFIX) {
        globalPrefix = process.env.PREFIX;
    }
    else if (process.platform === 'win32') {
        // c:\node\node.exe --> prefix=c:\node\
        globalPrefix = path.dirname(process.execPath);
    }
    else {
        // /usr/local/bin/node --> prefix=/usr/local
        globalPrefix = path.dirname(path.dirname(process.execPath));
        // destdir only is respected on Unix
        const destdir = process.env.DESTDIR;
        if (destdir) {
            globalPrefix = path.join(destdir, globalPrefix);
        }
    }
    return (process.platform !== 'win32')
        ? path.resolve(globalPrefix || '', 'lib', 'node_modules')
        : path.resolve(globalPrefix || '', 'node_modules');
}
let _resolveHook = null;
function setResolveHook(hook) {
    _resolveHook = hook;
}
exports.setResolveHook = setResolveHook;
/**
 * Resolve a package using a logic similar to npm require.resolve, but with more options.
 * @param x The package name to resolve.
 * @param options A list of options. See documentation of those options.
 * @returns {string} Path to the index to include, or if `resolvePackageJson` option was
 *                   passed, a path to that file.
 * @throws {ModuleNotFoundException} If no module with that name was found anywhere.
 */
function resolve(x, options) {
    if (_resolveHook) {
        const maybe = _resolveHook(x, options);
        if (maybe) {
            return maybe;
        }
    }
    const readFileSync = fs.readFileSync;
    const extensions = options.extensions || Object.keys(require.extensions);
    const basePath = options.basedir;
    options.paths = options.paths || [];
    if (/^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/.test(x)) {
        let res = path.resolve(basePath, x);
        if (x === '..' || x.slice(-1) === '/') {
            res += '/';
        }
        const m = loadAsFileSync(res) || loadAsDirectorySync(res);
        if (m) {
            return m;
        }
    }
    else {
        const n = loadNodeModulesSync(x, basePath);
        if (n) {
            return n;
        }
    }
    // Fallback to checking the local (callee) node modules.
    if (options.checkLocal) {
        const callers = _caller();
        for (const caller of callers) {
            const localDir = path.dirname(caller);
            if (localDir !== options.basedir) {
                try {
                    return resolve(x, Object.assign({}, options, { checkLocal: false, checkGlobal: false, basedir: localDir }));
                }
                catch (e) {
                    // Just swap the basePath with the original call one.
                    if (!(e instanceof ModuleNotFoundException)) {
                        throw e;
                    }
                }
            }
        }
    }
    // Fallback to checking the global node modules.
    if (options.checkGlobal) {
        const globalDir = path.dirname(_getGlobalNodeModules());
        if (globalDir !== options.basedir) {
            try {
                return resolve(x, Object.assign({}, options, { checkLocal: false, checkGlobal: false, basedir: globalDir }));
            }
            catch (e) {
                // Just swap the basePath with the original call one.
                if (!(e instanceof ModuleNotFoundException)) {
                    throw e;
                }
            }
        }
    }
    throw new ModuleNotFoundException(x, basePath);
    function loadAsFileSync(x) {
        if (fs_1.isFile(x)) {
            return x;
        }
        return extensions.map(ex => x + ex).find(f => fs_1.isFile(f)) || null;
    }
    function loadAsDirectorySync(x) {
        const pkgfile = path.join(x, 'package.json');
        if (fs_1.isFile(pkgfile)) {
            if (options.resolvePackageJson) {
                return pkgfile;
            }
            try {
                const body = readFileSync(pkgfile, 'UTF8');
                const pkg = JSON.parse(body);
                if (pkg['main']) {
                    if (pkg['main'] === '.' || pkg['main'] === './') {
                        pkg['main'] = 'index';
                    }
                    const m = loadAsFileSync(path.resolve(x, pkg['main']));
                    if (m) {
                        return m;
                    }
                    const n = loadAsDirectorySync(path.resolve(x, pkg['main']));
                    if (n) {
                        return n;
                    }
                }
            }
            catch (_a) { }
        }
        return loadAsFileSync(path.join(x, '/index'));
    }
    function loadNodeModulesSync(x, start) {
        const dirs = nodeModulesPaths(start, options);
        for (const dir of dirs) {
            const m = loadAsFileSync(path.join(dir, '/', x));
            if (m) {
                return m;
            }
            const n = loadAsDirectorySync(path.join(dir, '/', x));
            if (n) {
                return n;
            }
        }
        return null;
    }
    function nodeModulesPaths(start, opts) {
        const modules = ['node_modules'];
        // ensure that `start` is an absolute path at this point,
        // resolving against the process' current working directory
        let absoluteStart = path.resolve(start);
        if (opts && opts.preserveSymlinks === false) {
            try {
                absoluteStart = fs.realpathSync(absoluteStart);
            }
            catch (err) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            }
        }
        let prefix = '/';
        if (/^([A-Za-z]:)/.test(absoluteStart)) {
            prefix = '';
        }
        else if (/^\\\\/.test(absoluteStart)) {
            prefix = '\\\\';
        }
        const paths = [absoluteStart];
        let parsed = path.parse(absoluteStart);
        while (parsed.dir !== paths[paths.length - 1]) {
            paths.push(parsed.dir);
            parsed = path.parse(parsed.dir);
        }
        const dirs = paths.reduce((dirs, aPath) => {
            return dirs.concat(modules.map(function (moduleDir) {
                return path.join(prefix, aPath, moduleDir);
            }));
        }, []);
        return opts && opts.paths ? dirs.concat(opts.paths) : dirs;
    }
}
exports.resolve = resolve;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZS5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvY29yZS9ub2RlL3Jlc29sdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLGdDQUF1QztBQUN2Qyw2QkFBOEI7QUFFOUI7O0dBRUc7QUFDSCw2QkFBcUMsU0FBUSxtQkFBYTtJQUd4RCxZQUE0QixVQUFrQixFQUFrQixRQUFnQjtRQUM5RSxLQUFLLENBQUMseUJBQXlCLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFEckUsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUFrQixhQUFRLEdBQVIsUUFBUSxDQUFRO1FBRTlFLElBQUksQ0FBQyxJQUFJLEdBQUcsa0JBQWtCLENBQUM7SUFDakMsQ0FBQztDQUNGO0FBUEQsMERBT0M7QUFFRDs7OztHQUlHO0FBQ0g7SUFDRSxnRUFBZ0U7SUFDaEUsTUFBTSxLQUFLLEdBQUcsS0FBOEQsQ0FBQztJQUM3RSxNQUFNLHFCQUFxQixHQUFHLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztJQUN0RCxLQUFLLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUM7SUFDOUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBa0UsQ0FBQztJQUMvRixLQUFLLENBQUMsaUJBQWlCLEdBQUcscUJBQXFCLENBQUM7SUFFaEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxD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QUMsQ0FBQztRQUNOLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVQLE1BQU0sQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUM3RCxDQUFDO0FBQ0gsQ0FBQztBQTNLRCwwQkEyS0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQmFzZUV4Y2VwdGlvbiB9IGZyb20gJy4uL3NyYyc7XG5pbXBvcnQgeyBpc0ZpbGUgfSBmcm9tICcuL2ZzJztcblxuLyoqXG4gKiBFeGNlcHRpb24gdGhyb3duIHdoZW4gYSBtb2R1bGUgY291bGQgbm90IGJlIHJlc29sdmVkLlxuICovXG5leHBvcnQgY2xhc3MgTW9kdWxlTm90Rm91bmRFeGNlcHRpb24gZXh0ZW5kcyBCYXNlRXhjZXB0aW9uIHtcbiAgcHVibGljIHJlYWRvbmx5IGNvZGU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbW9kdWxlTmFtZTogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgYmFzZVBhdGg6IHN0cmluZykge1xuICAgIHN1cGVyKGBDb3VsZCBub3QgZmluZCBtb2R1bGUgJHtKU09OLnN0cmluZ2lmeShtb2R1bGVOYW1lKX0gZnJvbSAke0pTT04uc3RyaW5naWZ5KGJhc2VQYXRoKX0uYCk7XG4gICAgdGhpcy5jb2RlID0gJ01PRFVMRV9OT1RfRk9VTkQnO1xuICB9XG59XG5cbi8qKlxuICogUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHRoZSBjYWxsZXJzIGZyb20gdGhlIHJlc29sdmUoKSBjYWxsLlxuICogQHJldHVybnMge3N0cmluZ1tdfVxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gX2NhbGxlcigpOiBzdHJpbmdbXSB7XG4gIC8vIHNlZSBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL3Y4L3dpa2kvSmF2YVNjcmlwdFN0YWNrVHJhY2VBcGlcbiAgY29uc3QgZXJyb3IgPSBFcnJvciBhcyB7fSBhcyB7IHByZXBhcmVTdGFja1RyYWNlOiAoeDoge30sIHN0YWNrOiB7fSkgPT4ge30gfTtcbiAgY29uc3Qgb3JpZ1ByZXBhcmVTdGFja1RyYWNlID0gZXJyb3IucHJlcGFyZVN0YWNrVHJhY2U7XG4gIGVycm9yLnByZXBhcmVTdGFja1RyYWNlID0gKF8sIHN0YWNrKSA9PiBzdGFjaztcbiAgY29uc3Qgc3RhY2sgPSAobmV3IEVycm9yKCkpLnN0YWNrIGFzIHt9IHwgdW5kZWZpbmVkIGFzIHsgZ2V0RmlsZU5hbWUoKTogc3RyaW5nIH1bXSB8IHVuZGVmaW5lZDtcbiAgZXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBvcmlnUHJlcGFyZVN0YWNrVHJhY2U7XG5cbiAgcmV0dXJuIHN0YWNrID8gc3RhY2subWFwKHggPT4geC5nZXRGaWxlTmFtZSgpKS5maWx0ZXIoeCA9PiAhIXgpIDogW107XG59XG5cblxuLyoqXG4gKiBHZXQgdGhlIGdsb2JhbCBkaXJlY3RvcnkgZm9yIG5vZGVfbW9kdWxlcy4gVGhpcyBpcyBiYXNlZCBvbiBOUE0gY29kZSBpdHNlbGYsIGFuZCBtYXkgYmUgc3ViamVjdFxuICogdG8gY2hhbmdlLCBidXQgaXMgcmVsYXRpdmVseSBzdGFibGUuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBUaGUgcGF0aCB0byBub2RlX21vZHVsZXMgaXRzZWxmLlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gX2dldEdsb2JhbE5vZGVNb2R1bGVzKCkge1xuICBsZXQgZ2xvYmFsUHJlZml4O1xuXG4gIGlmIChwcm9jZXNzLmVudi5QUkVGSVgpIHtcbiAgICBnbG9iYWxQcmVmaXggPSBwcm9jZXNzLmVudi5QUkVGSVg7XG4gIH0gZWxzZSBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuICAgIC8vIGM6XFxub2RlXFxub2RlLmV4ZSAtLT4gcHJlZml4PWM6XFxub2RlXFxcbiAgICBnbG9iYWxQcmVmaXggPSBwYXRoLmRpcm5hbWUocHJvY2Vzcy5leGVjUGF0aCk7XG4gIH0gZWxzZSB7XG4gICAgLy8gL3Vzci9sb2NhbC9iaW4vbm9kZSAtLT4gcHJlZml4PS91c3IvbG9jYWxcbiAgICBnbG9iYWxQcmVmaXggPSBwYXRoLmRpcm5hbWUocGF0aC5kaXJuYW1lKHByb2Nlc3MuZXhlY1BhdGgpKTtcblxuICAgIC8vIGRlc3RkaXIgb25seSBpcyByZXNwZWN0ZWQgb24gVW5peFxuICAgIGNvbnN0IGRlc3RkaXIgPSBwcm9jZXNzLmVudi5ERVNURElSO1xuICAgIGlmIChkZXN0ZGlyKSB7XG4gICAgICBnbG9iYWxQcmVmaXggPSBwYXRoLmpvaW4oZGVzdGRpciwgZ2xvYmFsUHJlZml4KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gKHByb2Nlc3MucGxhdGZvcm0gIT09ICd3aW4zMicpXG4gICAgPyBwYXRoLnJlc29sdmUoZ2xvYmFsUHJlZml4IHx8ICcnLCAnbGliJywgJ25vZGVfbW9kdWxlcycpXG4gICAgOiBwYXRoLnJlc29sdmUoZ2xvYmFsUHJlZml4IHx8ICcnLCAnbm9kZV9tb2R1bGVzJyk7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBSZXNvbHZlT3B0aW9ucyB7XG4gIC8qKlxuICAgKiBUaGUgYmFzZWRpciB0byB1c2UgZnJvbSB3aGljaCB0byByZXNvbHZlLlxuICAgKi9cbiAgYmFzZWRpcjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgbGlzdCBvZiBleHRlbnNpb25zIHRvIHJlc29sdmUuIEJ5IGRlZmF1bHQgdXNlcyBPYmplY3Qua2V5cyhyZXF1aXJlLmV4dGVuc2lvbnMpLlxuICAgKi9cbiAgZXh0ZW5zaW9ucz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBBbiBhZGRpdGlvbmFsIGxpc3Qgb2YgcGF0aHMgdG8gbG9vayBpbnRvLlxuICAgKi9cbiAgcGF0aHM/OiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogV2hldGhlciBvciBub3QgdG8gcHJlc2VydmUgc3ltYm9saWMgbGlua3MuIElmIGZhbHNlLCB0aGUgYWN0dWFsIHBhdGhzIHBvaW50ZWQgYnlcbiAgICogdGhlIHN5bWJvbGljIGxpbmtzIHdpbGwgYmUgdXNlZC4gVGhpcyBkZWZhdWx0cyB0byB0cnVlLlxuICAgKi9cbiAgcHJlc2VydmVTeW1saW5rcz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gZmFsbGJhY2sgdG8gYSBnbG9iYWwgbG9va3VwIGlmIHRoZSBiYXNlZGlyIG9uZSBmYWlsZWQuXG4gICAqL1xuICBjaGVja0dsb2JhbD86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gZmFsbGJhY2sgdG8gdXNpbmcgdGhlIGxvY2FsIGNhbGxlcidzIGRpcmVjdG9yeSBpZiB0aGUgYmFzZWRpciBmYWlsZWQuXG4gICAqL1xuICBjaGVja0xvY2FsPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogV2hldGhlciB0byBvbmx5IHJlc29sdmUgYW5kIHJldHVybiB0aGUgZmlyc3QgcGFja2FnZS5qc29uIGZpbGUgZm91bmQuIEJ5IGRlZmF1bHQsXG4gICAqIHJlc29sdmVzIHRoZSBtYWluIGZpZWxkIG9yIHRoZSBpbmRleCBvZiB0aGUgcGFja2FnZS5cbiAgICovXG4gIHJlc29sdmVQYWNrYWdlSnNvbj86IGJvb2xlYW47XG59XG5cblxubGV0IF9yZXNvbHZlSG9vazogKCh4OiBzdHJpbmcsIG9wdGlvbnM6IFJlc29sdmVPcHRpb25zKSA9PiBzdHJpbmcgfCBudWxsKSB8IG51bGwgPSBudWxsO1xuZXhwb3J0IGZ1bmN0aW9uIHNldFJlc29sdmVIb29rKFxuICBob29rOiAoKHg6IHN0cmluZywgb3B0aW9uczogUmVzb2x2ZU9wdGlvbnMpID0+IHN0cmluZyB8IG51bGwpIHwgbnVsbCxcbikge1xuICBfcmVzb2x2ZUhvb2sgPSBob29rO1xufVxuXG5cbi8qKlxuICogUmVzb2x2ZSBhIHBhY2thZ2UgdXNpbmcgYSBsb2dpYyBzaW1pbGFyIHRvIG5wbSByZXF1aXJlLnJlc29sdmUsIGJ1dCB3aXRoIG1vcmUgb3B0aW9ucy5cbiAqIEBwYXJhbSB4IFRoZSBwYWNrYWdlIG5hbWUgdG8gcmVzb2x2ZS5cbiAqIEBwYXJhbSBvcHRpb25zIEEgbGlzdCBvZiBvcHRpb25zLiBTZWUgZG9jdW1lbnRhdGlvbiBvZiB0aG9zZSBvcHRpb25zLlxuICogQHJldHVybnMge3N0cmluZ30gUGF0aCB0byB0aGUgaW5kZXggdG8gaW5jbHVkZSwgb3IgaWYgYHJlc29sdmVQYWNrYWdlSnNvbmAgb3B0aW9uIHdhc1xuICogICAgICAgICAgICAgICAgICAgcGFzc2VkLCBhIHBhdGggdG8gdGhhdCBmaWxlLlxuICogQHRocm93cyB7TW9kdWxlTm90Rm91bmRFeGNlcHRpb259IElmIG5vIG1vZHVsZSB3aXRoIHRoYXQgbmFtZSB3YXMgZm91bmQgYW55d2hlcmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlKHg6IHN0cmluZywgb3B0aW9uczogUmVzb2x2ZU9wdGlvbnMpOiBzdHJpbmcge1xuICBpZiAoX3Jlc29sdmVIb29rKSB7XG4gICAgY29uc3QgbWF5YmUgPSBfcmVzb2x2ZUhvb2soeCwgb3B0aW9ucyk7XG4gICAgaWYgKG1heWJlKSB7XG4gICAgICByZXR1cm4gbWF5YmU7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcmVhZEZpbGVTeW5jID0gZnMucmVhZEZpbGVTeW5jO1xuXG4gIGNvbnN0IGV4dGVuc2lvbnM6IHN0cmluZ1tdID0gb3B0aW9ucy5leHRlbnNpb25zIHx8IE9iamVjdC5rZXlzKHJlcXVpcmUuZXh0ZW5zaW9ucyk7XG4gIGNvbnN0IGJhc2VQYXRoID0gb3B0aW9ucy5iYXNlZGlyO1xuXG4gIG9wdGlvbnMucGF0aHMgPSBvcHRpb25zLnBhdGhzIHx8IFtdO1xuXG4gIGlmICgvXig/OlxcLlxcLj8oPzpcXC98JCl8XFwvfChbQS1aYS16XTopP1svXFxcXF0pLy50ZXN0KHgpKSB7XG4gICAgbGV0IHJlcyA9IHBhdGgucmVzb2x2ZShiYXNlUGF0aCwgeCk7XG4gICAgaWYgKHggPT09ICcuLicgfHwgeC5zbGljZSgtMSkgPT09ICcvJykge1xuICAgICAgcmVzICs9ICcvJztcbiAgICB9XG5cbiAgICBjb25zdCBtID0gbG9hZEFzRmlsZVN5bmMocmVzKSB8fCBsb2FkQXNEaXJlY3RvcnlTeW5jKHJlcyk7XG4gICAgaWYgKG0pIHtcbiAgICAgIHJldHVybiBtO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBuID0gbG9hZE5vZGVNb2R1bGVzU3luYyh4LCBiYXNlUGF0aCk7XG4gICAgaWYgKG4pIHtcbiAgICAgIHJldHVybiBuO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGNoZWNraW5nIHRoZSBsb2NhbCAoY2FsbGVlKSBub2RlIG1vZHVsZXMuXG4gIGlmIChvcHRpb25zLmNoZWNrTG9jYWwpIHtcbiAgICBjb25zdCBjYWxsZXJzID0gX2NhbGxlcigpO1xuICAgIGZvciAoY29uc3QgY2FsbGVyIG9mIGNhbGxlcnMpIHtcbiAgICAgIGNvbnN0IGxvY2FsRGlyID0gcGF0aC5kaXJuYW1lKGNhbGxlcik7XG4gICAgICBpZiAobG9jYWxEaXIgIT09IG9wdGlvbnMuYmFzZWRpcikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiByZXNvbHZlKHgsIHtcbiAgICAgICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgICAgICBjaGVja0xvY2FsOiBmYWxzZSxcbiAgICAgICAgICAgIGNoZWNrR2xvYmFsOiBmYWxzZSxcbiAgICAgICAgICAgIGJhc2VkaXI6IGxvY2FsRGlyLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gSnVzdCBzd2FwIHRoZSBiYXNlUGF0aCB3aXRoIHRoZSBvcmlnaW5hbCBjYWxsIG9uZS5cbiAgICAgICAgICBpZiAoIShlIGluc3RhbmNlb2YgTW9kdWxlTm90Rm91bmRFeGNlcHRpb24pKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGNoZWNraW5nIHRoZSBnbG9iYWwgbm9kZSBtb2R1bGVzLlxuICBpZiAob3B0aW9ucy5jaGVja0dsb2JhbCkge1xuICAgIGNvbnN0IGdsb2JhbERpciA9IHBhdGguZGlybmFtZShfZ2V0R2xvYmFsTm9kZU1vZHVsZXMoKSk7XG4gICAgaWYgKGdsb2JhbERpciAhPT0gb3B0aW9ucy5iYXNlZGlyKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSh4LCB7XG4gICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgICBjaGVja0xvY2FsOiBmYWxzZSxcbiAgICAgICAgICBjaGVja0dsb2JhbDogZmFsc2UsXG4gICAgICAgICAgYmFzZWRpcjogZ2xvYmFsRGlyLFxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gSnVzdCBzd2FwIHRoZSBiYXNlUGF0aCB3aXRoIHRoZSBvcmlnaW5hbCBjYWxsIG9uZS5cbiAgICAgICAgaWYgKCEoZSBpbnN0YW5jZW9mIE1vZHVsZU5vdEZvdW5kRXhjZXB0aW9uKSkge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgTW9kdWxlTm90Rm91bmRFeGNlcHRpb24oeCwgYmFzZVBhdGgpO1xuXG4gIGZ1bmN0aW9uIGxvYWRBc0ZpbGVTeW5jKHg6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmIChpc0ZpbGUoeCkpIHtcbiAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIHJldHVybiBleHRlbnNpb25zLm1hcChleCA9PiB4ICsgZXgpLmZpbmQoZiA9PiBpc0ZpbGUoZikpIHx8IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBsb2FkQXNEaXJlY3RvcnlTeW5jKHg6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IHBrZ2ZpbGUgPSBwYXRoLmpvaW4oeCwgJ3BhY2thZ2UuanNvbicpO1xuICAgIGlmIChpc0ZpbGUocGtnZmlsZSkpIHtcbiAgICAgIGlmIChvcHRpb25zLnJlc29sdmVQYWNrYWdlSnNvbikge1xuICAgICAgICByZXR1cm4gcGtnZmlsZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYm9keSA9IHJlYWRGaWxlU3luYyhwa2dmaWxlLCAnVVRGOCcpO1xuICAgICAgICBjb25zdCBwa2cgPSBKU09OLnBhcnNlKGJvZHkpO1xuXG4gICAgICAgIGlmIChwa2dbJ21haW4nXSkge1xuICAgICAgICAgIGlmIChwa2dbJ21haW4nXSA9PT0gJy4nIHx8IHBrZ1snbWFpbiddID09PSAnLi8nKSB7XG4gICAgICAgICAgICBwa2dbJ21haW4nXSA9ICdpbmRleCc7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgbSA9IGxvYWRBc0ZpbGVTeW5jKHBhdGgucmVzb2x2ZSh4LCBwa2dbJ21haW4nXSkpO1xuICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICByZXR1cm4gbTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgbiA9IGxvYWRBc0RpcmVjdG9yeVN5bmMocGF0aC5yZXNvbHZlKHgsIHBrZ1snbWFpbiddKSk7XG4gICAgICAgICAgaWYgKG4pIHtcbiAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCB7fVxuICAgIH1cblxuICAgIHJldHVybiBsb2FkQXNGaWxlU3luYyhwYXRoLmpvaW4oeCwgJy9pbmRleCcpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGxvYWROb2RlTW9kdWxlc1N5bmMoeDogc3RyaW5nLCBzdGFydDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgZGlycyA9IG5vZGVNb2R1bGVzUGF0aHMoc3RhcnQsIG9wdGlvbnMpO1xuICAgIGZvciAoY29uc3QgZGlyIG9mIGRpcnMpIHtcbiAgICAgIGNvbnN0IG0gPSBsb2FkQXNGaWxlU3luYyhwYXRoLmpvaW4oZGlyLCAnLycsIHgpKTtcbiAgICAgIGlmIChtKSB7XG4gICAgICAgIHJldHVybiBtO1xuICAgICAgfVxuICAgICAgY29uc3QgbiA9IGxvYWRBc0RpcmVjdG9yeVN5bmMocGF0aC5qb2luKGRpciwgJy8nLCB4KSk7XG4gICAgICBpZiAobikge1xuICAgICAgICByZXR1cm4gbjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vZGVNb2R1bGVzUGF0aHMoc3RhcnQ6IHN0cmluZywgb3B0czogUmVzb2x2ZU9wdGlvbnMpIHtcbiAgICBjb25zdCBtb2R1bGVzID0gWydub2RlX21vZHVsZXMnXTtcblxuICAgIC8vIGVuc3VyZSB0aGF0IGBzdGFydGAgaXMgYW4gYWJzb2x1dGUgcGF0aCBhdCB0aGlzIHBvaW50LFxuICAgIC8vIHJlc29sdmluZyBhZ2FpbnN0IHRoZSBwcm9jZXNzJyBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5XG4gICAgbGV0IGFic29sdXRlU3RhcnQgPSBwYXRoLnJlc29sdmUoc3RhcnQpO1xuXG4gICAgaWYgKG9wdHMgJiYgb3B0cy5wcmVzZXJ2ZVN5bWxpbmtzID09PSBmYWxzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYWJzb2x1dGVTdGFydCA9IGZzLnJlYWxwYXRoU3luYyhhYnNvbHV0ZVN0YXJ0KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBpZiAoZXJyLmNvZGUgIT09ICdFTk9FTlQnKSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHByZWZpeCA9ICcvJztcbiAgICBpZiAoL14oW0EtWmEtel06KS8udGVzdChhYnNvbHV0ZVN0YXJ0KSkge1xuICAgICAgcHJlZml4ID0gJyc7XG4gICAgfSBlbHNlIGlmICgvXlxcXFxcXFxcLy50ZXN0KGFic29sdXRlU3RhcnQpKSB7XG4gICAgICBwcmVmaXggPSAnXFxcXFxcXFwnO1xuICAgIH1cblxuICAgIGNvbnN0IHBhdGhzID0gW2Fic29sdXRlU3RhcnRdO1xuICAgIGxldCBwYXJzZWQgPSBwYXRoLnBhcnNlKGFic29sdXRlU3RhcnQpO1xuICAgIHdoaWxlIChwYXJzZWQuZGlyICE9PSBwYXRoc1twYXRocy5sZW5ndGggLSAxXSkge1xuICAgICAgcGF0aHMucHVzaChwYXJzZWQuZGlyKTtcbiAgICAgIHBhcnNlZCA9IHBhdGgucGFyc2UocGFyc2VkLmRpcik7XG4gICAgfVxuXG4gICAgY29uc3QgZGlycyA9IHBhdGhzLnJlZHVjZSgoZGlyczogc3RyaW5nW10sIGFQYXRoOiBzdHJpbmcpID0+IHtcbiAgICAgIHJldHVybiBkaXJzLmNvbmNhdChtb2R1bGVzLm1hcChmdW5jdGlvbiAobW9kdWxlRGlyKSB7XG4gICAgICAgIHJldHVybiBwYXRoLmpvaW4ocHJlZml4LCBhUGF0aCwgbW9kdWxlRGlyKTtcbiAgICAgIH0pKTtcbiAgICB9LCBbXSk7XG5cbiAgICByZXR1cm4gb3B0cyAmJiBvcHRzLnBhdGhzID8gZGlycy5jb25jYXQob3B0cy5wYXRocykgOiBkaXJzO1xuICB9XG59XG4iXX0=