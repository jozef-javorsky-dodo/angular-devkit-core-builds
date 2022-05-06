"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleMemoryHost = void 0;
const rxjs_1 = require("rxjs");
const exception_1 = require("../../exception");
const path_1 = require("../path");
class SimpleMemoryHost {
    constructor() {
        this._cache = new Map();
        this._watchers = new Map();
        this._cache.set((0, path_1.normalize)('/'), this._newDirStats());
    }
    _newDirStats() {
        return {
            inspect() {
                return '<Directory>';
            },
            isFile() {
                return false;
            },
            isDirectory() {
                return true;
            },
            size: 0,
            atime: new Date(),
            ctime: new Date(),
            mtime: new Date(),
            birthtime: new Date(),
            content: null,
        };
    }
    _newFileStats(content, oldStats) {
        return {
            inspect() {
                return `<File size(${content.byteLength})>`;
            },
            isFile() {
                return true;
            },
            isDirectory() {
                return false;
            },
            size: content.byteLength,
            atime: oldStats ? oldStats.atime : new Date(),
            ctime: new Date(),
            mtime: new Date(),
            birthtime: oldStats ? oldStats.birthtime : new Date(),
            content,
        };
    }
    _toAbsolute(path) {
        return (0, path_1.isAbsolute)(path) ? path : (0, path_1.normalize)('/' + path);
    }
    _updateWatchers(path, type) {
        const time = new Date();
        let currentPath = path;
        let parent = null;
        if (this._watchers.size == 0) {
            // Nothing to do if there's no watchers.
            return;
        }
        const maybeWatcher = this._watchers.get(currentPath);
        if (maybeWatcher) {
            maybeWatcher.forEach((watcher) => {
                const [options, subject] = watcher;
                subject.next({ path, time, type });
                if (!options.persistent && type == 2 /* HostWatchEventType.Deleted */) {
                    subject.complete();
                    this._watchers.delete(currentPath);
                }
            });
        }
        do {
            currentPath = parent !== null ? parent : currentPath;
            parent = (0, path_1.dirname)(currentPath);
            const maybeWatcher = this._watchers.get(currentPath);
            if (maybeWatcher) {
                maybeWatcher.forEach((watcher) => {
                    const [options, subject] = watcher;
                    if (!options.recursive) {
                        return;
                    }
                    subject.next({ path, time, type });
                    if (!options.persistent && type == 2 /* HostWatchEventType.Deleted */) {
                        subject.complete();
                        this._watchers.delete(currentPath);
                    }
                });
            }
        } while (parent != currentPath);
    }
    get capabilities() {
        return { synchronous: true };
    }
    /**
     * List of protected methods that give direct access outside the observables to the cache
     * and internal states.
     */
    _write(path, content) {
        path = this._toAbsolute(path);
        const old = this._cache.get(path);
        if (old && old.isDirectory()) {
            throw new exception_1.PathIsDirectoryException(path);
        }
        // Update all directories. If we find a file we know it's an invalid write.
        const fragments = (0, path_1.split)(path);
        let curr = (0, path_1.normalize)('/');
        for (const fr of fragments) {
            curr = (0, path_1.join)(curr, fr);
            const maybeStats = this._cache.get(fr);
            if (maybeStats) {
                if (maybeStats.isFile()) {
                    throw new exception_1.PathIsFileException(curr);
                }
            }
            else {
                this._cache.set(curr, this._newDirStats());
            }
        }
        // Create the stats.
        const stats = this._newFileStats(content, old);
        this._cache.set(path, stats);
        this._updateWatchers(path, old ? 0 /* HostWatchEventType.Changed */ : 1 /* HostWatchEventType.Created */);
    }
    _read(path) {
        path = this._toAbsolute(path);
        const maybeStats = this._cache.get(path);
        if (!maybeStats) {
            throw new exception_1.FileDoesNotExistException(path);
        }
        else if (maybeStats.isDirectory()) {
            throw new exception_1.PathIsDirectoryException(path);
        }
        else if (!maybeStats.content) {
            throw new exception_1.PathIsDirectoryException(path);
        }
        else {
            return maybeStats.content;
        }
    }
    _delete(path) {
        path = this._toAbsolute(path);
        if (this._isDirectory(path)) {
            for (const [cachePath] of this._cache.entries()) {
                if (cachePath.startsWith(path + path_1.NormalizedSep) || cachePath === path) {
                    this._cache.delete(cachePath);
                }
            }
        }
        else {
            this._cache.delete(path);
        }
        this._updateWatchers(path, 2 /* HostWatchEventType.Deleted */);
    }
    _rename(from, to) {
        from = this._toAbsolute(from);
        to = this._toAbsolute(to);
        if (!this._cache.has(from)) {
            throw new exception_1.FileDoesNotExistException(from);
        }
        else if (this._cache.has(to)) {
            throw new exception_1.FileAlreadyExistException(to);
        }
        if (this._isDirectory(from)) {
            for (const path of this._cache.keys()) {
                if (path.startsWith(from + path_1.NormalizedSep)) {
                    const content = this._cache.get(path);
                    if (content) {
                        // We don't need to clone or extract the content, since we're moving files.
                        this._cache.set((0, path_1.join)(to, path_1.NormalizedSep, path.slice(from.length)), content);
                    }
                }
            }
        }
        else {
            const content = this._cache.get(from);
            if (content) {
                const fragments = (0, path_1.split)(to);
                const newDirectories = [];
                let curr = (0, path_1.normalize)('/');
                for (const fr of fragments) {
                    curr = (0, path_1.join)(curr, fr);
                    const maybeStats = this._cache.get(fr);
                    if (maybeStats) {
                        if (maybeStats.isFile()) {
                            throw new exception_1.PathIsFileException(curr);
                        }
                    }
                    else {
                        newDirectories.push(curr);
                    }
                }
                for (const newDirectory of newDirectories) {
                    this._cache.set(newDirectory, this._newDirStats());
                }
                this._cache.delete(from);
                this._cache.set(to, content);
            }
        }
        this._updateWatchers(from, 3 /* HostWatchEventType.Renamed */);
    }
    _list(path) {
        path = this._toAbsolute(path);
        if (this._isFile(path)) {
            throw new exception_1.PathIsFileException(path);
        }
        const fragments = (0, path_1.split)(path);
        const result = new Set();
        if (path !== path_1.NormalizedRoot) {
            for (const p of this._cache.keys()) {
                if (p.startsWith(path + path_1.NormalizedSep)) {
                    result.add((0, path_1.split)(p)[fragments.length]);
                }
            }
        }
        else {
            for (const p of this._cache.keys()) {
                if (p.startsWith(path_1.NormalizedSep) && p !== path_1.NormalizedRoot) {
                    result.add((0, path_1.split)(p)[1]);
                }
            }
        }
        return [...result];
    }
    _exists(path) {
        return !!this._cache.get(this._toAbsolute(path));
    }
    _isDirectory(path) {
        const maybeStats = this._cache.get(this._toAbsolute(path));
        return maybeStats ? maybeStats.isDirectory() : false;
    }
    _isFile(path) {
        const maybeStats = this._cache.get(this._toAbsolute(path));
        return maybeStats ? maybeStats.isFile() : false;
    }
    _stat(path) {
        const maybeStats = this._cache.get(this._toAbsolute(path));
        if (!maybeStats) {
            return null;
        }
        else {
            return maybeStats;
        }
    }
    _watch(path, options) {
        path = this._toAbsolute(path);
        const subject = new rxjs_1.Subject();
        let maybeWatcherArray = this._watchers.get(path);
        if (!maybeWatcherArray) {
            maybeWatcherArray = [];
            this._watchers.set(path, maybeWatcherArray);
        }
        maybeWatcherArray.push([options || {}, subject]);
        return subject.asObservable();
    }
    write(path, content) {
        return new rxjs_1.Observable((obs) => {
            this._write(path, content);
            obs.next();
            obs.complete();
        });
    }
    read(path) {
        return new rxjs_1.Observable((obs) => {
            const content = this._read(path);
            obs.next(content);
            obs.complete();
        });
    }
    delete(path) {
        return new rxjs_1.Observable((obs) => {
            this._delete(path);
            obs.next();
            obs.complete();
        });
    }
    rename(from, to) {
        return new rxjs_1.Observable((obs) => {
            this._rename(from, to);
            obs.next();
            obs.complete();
        });
    }
    list(path) {
        return new rxjs_1.Observable((obs) => {
            obs.next(this._list(path));
            obs.complete();
        });
    }
    exists(path) {
        return new rxjs_1.Observable((obs) => {
            obs.next(this._exists(path));
            obs.complete();
        });
    }
    isDirectory(path) {
        return new rxjs_1.Observable((obs) => {
            obs.next(this._isDirectory(path));
            obs.complete();
        });
    }
    isFile(path) {
        return new rxjs_1.Observable((obs) => {
            obs.next(this._isFile(path));
            obs.complete();
        });
    }
    // Some hosts may not support stat.
    stat(path) {
        return new rxjs_1.Observable((obs) => {
            obs.next(this._stat(path));
            obs.complete();
        });
    }
    watch(path, options) {
        return this._watch(path, options);
    }
    reset() {
        this._cache.clear();
        this._watchers.clear();
    }
}
exports.SimpleMemoryHost = SimpleMemoryHost;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVtb3J5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvY29yZS9zcmMvdmlydHVhbC1mcy9ob3N0L21lbW9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFFSCwrQkFBMkM7QUFDM0MsK0NBS3lCO0FBQ3pCLGtDQVVpQjtBQWVqQixNQUFhLGdCQUFnQjtJQWlEM0I7UUFoRFUsV0FBTSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBQ3pELGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBdUQsQ0FBQztRQWdEakYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBQSxnQkFBUyxFQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUEvQ1MsWUFBWTtRQUNwQixPQUFPO1lBQ0wsT0FBTztnQkFDTCxPQUFPLGFBQWEsQ0FBQztZQUN2QixDQUFDO1lBRUQsTUFBTTtnQkFDSixPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFDRCxXQUFXO2dCQUNULE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUNELElBQUksRUFBRSxDQUFDO1lBRVAsS0FBSyxFQUFFLElBQUksSUFBSSxFQUFFO1lBQ2pCLEtBQUssRUFBRSxJQUFJLElBQUksRUFBRTtZQUNqQixLQUFLLEVBQUUsSUFBSSxJQUFJLEVBQUU7WUFDakIsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFO1lBRXJCLE9BQU8sRUFBRSxJQUFJO1NBQ2QsQ0FBQztJQUNKLENBQUM7SUFDUyxhQUFhLENBQUMsT0FBbUIsRUFBRSxRQUF1QztRQUNsRixPQUFPO1lBQ0wsT0FBTztnQkFDTCxPQUFPLGNBQWMsT0FBTyxDQUFDLFVBQVUsSUFBSSxDQUFDO1lBQzlDLENBQUM7WUFFRCxNQUFNO2dCQUNKLE9BQU8sSUFBSSxDQUFD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QUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMzQixHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQVUsRUFBRSxPQUEwQjtRQUMxQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxLQUFLO1FBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQTlWRCw0Q0E4VkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgU3ViamVjdCB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHtcbiAgRmlsZUFscmVhZHlFeGlzdEV4Y2VwdGlvbixcbiAgRmlsZURvZXNOb3RFeGlzdEV4Y2VwdGlvbixcbiAgUGF0aElzRGlyZWN0b3J5RXhjZXB0aW9uLFxuICBQYXRoSXNGaWxlRXhjZXB0aW9uLFxufSBmcm9tICcuLi8uLi9leGNlcHRpb24nO1xuaW1wb3J0IHtcbiAgTm9ybWFsaXplZFJvb3QsXG4gIE5vcm1hbGl6ZWRTZXAsXG4gIFBhdGgsXG4gIFBhdGhGcmFnbWVudCxcbiAgZGlybmFtZSxcbiAgaXNBYnNvbHV0ZSxcbiAgam9pbixcbiAgbm9ybWFsaXplLFxuICBzcGxpdCxcbn0gZnJvbSAnLi4vcGF0aCc7XG5pbXBvcnQge1xuICBGaWxlQnVmZmVyLFxuICBIb3N0LFxuICBIb3N0Q2FwYWJpbGl0aWVzLFxuICBIb3N0V2F0Y2hFdmVudCxcbiAgSG9zdFdhdGNoRXZlbnRUeXBlLFxuICBIb3N0V2F0Y2hPcHRpb25zLFxuICBTdGF0cyxcbn0gZnJvbSAnLi9pbnRlcmZhY2UnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpbXBsZU1lbW9yeUhvc3RTdGF0cyB7XG4gIHJlYWRvbmx5IGNvbnRlbnQ6IEZpbGVCdWZmZXIgfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlTWVtb3J5SG9zdCBpbXBsZW1lbnRzIEhvc3Q8e30+IHtcbiAgcHJvdGVjdGVkIF9jYWNoZSA9IG5ldyBNYXA8UGF0aCwgU3RhdHM8U2ltcGxlTWVtb3J5SG9zdFN0YXRzPj4oKTtcbiAgcHJpdmF0ZSBfd2F0Y2hlcnMgPSBuZXcgTWFwPFBhdGgsIFtIb3N0V2F0Y2hPcHRpb25zLCBTdWJqZWN0PEhvc3RXYXRjaEV2ZW50Pl1bXT4oKTtcblxuICBwcm90ZWN0ZWQgX25ld0RpclN0YXRzKCkge1xuICAgIHJldHVybiB7XG4gICAgICBpbnNwZWN0KCkge1xuICAgICAgICByZXR1cm4gJzxEaXJlY3Rvcnk+JztcbiAgICAgIH0sXG5cbiAgICAgIGlzRmlsZSgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSxcbiAgICAgIGlzRGlyZWN0b3J5KCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0sXG4gICAgICBzaXplOiAwLFxuXG4gICAgICBhdGltZTogbmV3IERhdGUoKSxcbiAgICAgIGN0aW1lOiBuZXcgRGF0ZSgpLFxuICAgICAgbXRpbWU6IG5ldyBEYXRlKCksXG4gICAgICBiaXJ0aHRpbWU6IG5ldyBEYXRlKCksXG5cbiAgICAgIGNvbnRlbnQ6IG51bGwsXG4gICAgfTtcbiAgfVxuICBwcm90ZWN0ZWQgX25ld0ZpbGVTdGF0cyhjb250ZW50OiBGaWxlQnVmZmVyLCBvbGRTdGF0cz86IFN0YXRzPFNpbXBsZU1lbW9yeUhvc3RTdGF0cz4pIHtcbiAgICByZXR1cm4ge1xuICAgICAgaW5zcGVjdCgpIHtcbiAgICAgICAgcmV0dXJuIGA8RmlsZSBzaXplKCR7Y29udGVudC5ieXRlTGVuZ3RofSk+YDtcbiAgICAgIH0sXG5cbiAgICAgIGlzRmlsZSgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9LFxuICAgICAgaXNEaXJlY3RvcnkoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0sXG4gICAgICBzaXplOiBjb250ZW50LmJ5dGVMZW5ndGgsXG5cbiAgICAgIGF0aW1lOiBvbGRTdGF0cyA/IG9sZFN0YXRzLmF0aW1lIDogbmV3IERhdGUoKSxcbiAgICAgIGN0aW1lOiBuZXcgRGF0ZSgpLFxuICAgICAgbXRpbWU6IG5ldyBEYXRlKCksXG4gICAgICBiaXJ0aHRpbWU6IG9sZFN0YXRzID8gb2xkU3RhdHMuYmlydGh0aW1lIDogbmV3IERhdGUoKSxcblxuICAgICAgY29udGVudCxcbiAgICB9O1xuICB9XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5fY2FjaGUuc2V0KG5vcm1hbGl6ZSgnLycpLCB0aGlzLl9uZXdEaXJTdGF0cygpKTtcbiAgfVxuXG4gIHByb3RlY3RlZCBfdG9BYnNvbHV0ZShwYXRoOiBQYXRoKSB7XG4gICAgcmV0dXJuIGlzQWJzb2x1dGUocGF0aCkgPyBwYXRoIDogbm9ybWFsaXplKCcvJyArIHBhdGgpO1xuICB9XG5cbiAgcHJvdGVjdGVkIF91cGRhdGVXYXRjaGVycyhwYXRoOiBQYXRoLCB0eXBlOiBIb3N0V2F0Y2hFdmVudFR5cGUpIHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUoKTtcbiAgICBsZXQgY3VycmVudFBhdGggPSBwYXRoO1xuICAgIGxldCBwYXJlbnQ6IFBhdGggfCBudWxsID0gbnVsbDtcblxuICAgIGlmICh0aGlzLl93YXRjaGVycy5zaXplID09IDApIHtcbiAgICAgIC8vIE5vdGhpbmcgdG8gZG8gaWYgdGhlcmUncyBubyB3YXRjaGVycy5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBtYXliZVdhdGNoZXIgPSB0aGlzLl93YXRjaGVycy5nZXQoY3VycmVudFBhdGgpO1xuICAgIGlmIChtYXliZVdhdGNoZXIpIHtcbiAgICAgIG1heWJlV2F0Y2hlci5mb3JFYWNoKCh3YXRjaGVyKSA9PiB7XG4gICAgICAgIGNvbnN0IFtvcHRpb25zLCBzdWJqZWN0XSA9IHdhdGNoZXI7XG4gICAgICAgIHN1YmplY3QubmV4dCh7IHBhdGgsIHRpbWUsIHR5cGUgfSk7XG5cbiAgICAgICAgaWYgKCFvcHRpb25zLnBlcnNpc3RlbnQgJiYgdHlwZSA9PSBIb3N0V2F0Y2hFdmVudFR5cGUuRGVsZXRlZCkge1xuICAgICAgICAgIHN1YmplY3QuY29tcGxldGUoKTtcbiAgICAgICAgICB0aGlzLl93YXRjaGVycy5kZWxldGUoY3VycmVudFBhdGgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBkbyB7XG4gICAgICBjdXJyZW50UGF0aCA9IHBhcmVudCAhPT0gbnVsbCA/IHBhcmVudCA6IGN1cnJlbnRQYXRoO1xuICAgICAgcGFyZW50ID0gZGlybmFtZShjdXJyZW50UGF0aCk7XG5cbiAgICAgIGNvbnN0IG1heWJlV2F0Y2hlciA9IHRoaXMuX3dhdGNoZXJzLmdldChjdXJyZW50UGF0aCk7XG4gICAgICBpZiAobWF5YmVXYXRjaGVyKSB7XG4gICAgICAgIG1heWJlV2F0Y2hlci5mb3JFYWNoKCh3YXRjaGVyKSA9PiB7XG4gICAgICAgICAgY29uc3QgW29wdGlvbnMsIHN1YmplY3RdID0gd2F0Y2hlcjtcbiAgICAgICAgICBpZiAoIW9wdGlvbnMucmVjdXJzaXZlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHN1YmplY3QubmV4dCh7IHBhdGgsIHRpbWUsIHR5cGUgfSk7XG5cbiAgICAgICAgICBpZiAoIW9wdGlvbnMucGVyc2lzdGVudCAmJiB0eXBlID09IEhvc3RXYXRjaEV2ZW50VHlwZS5EZWxldGVkKSB7XG4gICAgICAgICAgICBzdWJqZWN0LmNvbXBsZXRlKCk7XG4gICAgICAgICAgICB0aGlzLl93YXRjaGVycy5kZWxldGUoY3VycmVudFBhdGgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSB3aGlsZSAocGFyZW50ICE9IGN1cnJlbnRQYXRoKTtcbiAgfVxuXG4gIGdldCBjYXBhYmlsaXRpZXMoKTogSG9zdENhcGFiaWxpdGllcyB7XG4gICAgcmV0dXJuIHsgc3luY2hyb25vdXM6IHRydWUgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0IG9mIHByb3RlY3RlZCBtZXRob2RzIHRoYXQgZ2l2ZSBkaXJlY3QgYWNjZXNzIG91dHNpZGUgdGhlIG9ic2VydmFibGVzIHRvIHRoZSBjYWNoZVxuICAgKiBhbmQgaW50ZXJuYWwgc3RhdGVzLlxuICAgKi9cbiAgcHJvdGVjdGVkIF93cml0ZShwYXRoOiBQYXRoLCBjb250ZW50OiBGaWxlQnVmZmVyKTogdm9pZCB7XG4gICAgcGF0aCA9IHRoaXMuX3RvQWJzb2x1dGUocGF0aCk7XG4gICAgY29uc3Qgb2xkID0gdGhpcy5fY2FjaGUuZ2V0KHBhdGgpO1xuICAgIGlmIChvbGQgJiYgb2xkLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXRoSXNEaXJlY3RvcnlFeGNlcHRpb24ocGF0aCk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGFsbCBkaXJlY3Rvcmllcy4gSWYgd2UgZmluZCBhIGZpbGUgd2Uga25vdyBpdCdzIGFuIGludmFsaWQgd3JpdGUuXG4gICAgY29uc3QgZnJhZ21lbnRzID0gc3BsaXQocGF0aCk7XG4gICAgbGV0IGN1cnI6IFBhdGggPSBub3JtYWxpemUoJy8nKTtcbiAgICBmb3IgKGNvbnN0IGZyIG9mIGZyYWdtZW50cykge1xuICAgICAgY3VyciA9IGpvaW4oY3VyciwgZnIpO1xuICAgICAgY29uc3QgbWF5YmVTdGF0cyA9IHRoaXMuX2NhY2hlLmdldChmcik7XG4gICAgICBpZiAobWF5YmVTdGF0cykge1xuICAgICAgICBpZiAobWF5YmVTdGF0cy5pc0ZpbGUoKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXRoSXNGaWxlRXhjZXB0aW9uKGN1cnIpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9jYWNoZS5zZXQoY3VyciwgdGhpcy5fbmV3RGlyU3RhdHMoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBzdGF0cy5cbiAgICBjb25zdCBzdGF0czogU3RhdHM8U2ltcGxlTWVtb3J5SG9zdFN0YXRzPiA9IHRoaXMuX25ld0ZpbGVTdGF0cyhjb250ZW50LCBvbGQpO1xuICAgIHRoaXMuX2NhY2hlLnNldChwYXRoLCBzdGF0cyk7XG4gICAgdGhpcy5fdXBkYXRlV2F0Y2hlcnMocGF0aCwgb2xkID8gSG9zdFdhdGNoRXZlbnRUeXBlLkNoYW5nZWQgOiBIb3N0V2F0Y2hFdmVudFR5cGUuQ3JlYXRlZCk7XG4gIH1cbiAgcHJvdGVjdGVkIF9yZWFkKHBhdGg6IFBhdGgpOiBGaWxlQnVmZmVyIHtcbiAgICBwYXRoID0gdGhpcy5fdG9BYnNvbHV0ZShwYXRoKTtcbiAgICBjb25zdCBtYXliZVN0YXRzID0gdGhpcy5fY2FjaGUuZ2V0KHBhdGgpO1xuICAgIGlmICghbWF5YmVTdGF0cykge1xuICAgICAgdGhyb3cgbmV3IEZpbGVEb2VzTm90RXhpc3RFeGNlcHRpb24ocGF0aCk7XG4gICAgfSBlbHNlIGlmIChtYXliZVN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXRoSXNEaXJlY3RvcnlFeGNlcHRpb24ocGF0aCk7XG4gICAgfSBlbHNlIGlmICghbWF5YmVTdGF0cy5jb250ZW50KSB7XG4gICAgICB0aHJvdyBuZXcgUGF0aElzRGlyZWN0b3J5RXhjZXB0aW9uKHBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbWF5YmVTdGF0cy5jb250ZW50O1xuICAgIH1cbiAgfVxuICBwcm90ZWN0ZWQgX2RlbGV0ZShwYXRoOiBQYXRoKTogdm9pZCB7XG4gICAgcGF0aCA9IHRoaXMuX3RvQWJzb2x1dGUocGF0aCk7XG4gICAgaWYgKHRoaXMuX2lzRGlyZWN0b3J5KHBhdGgpKSB7XG4gICAgICBmb3IgKGNvbnN0IFtjYWNoZVBhdGhdIG9mIHRoaXMuX2NhY2hlLmVudHJpZXMoKSkge1xuICAgICAgICBpZiAoY2FjaGVQYXRoLnN0YXJ0c1dpdGgocGF0aCArIE5vcm1hbGl6ZWRTZXApIHx8IGNhY2hlUGF0aCA9PT0gcGF0aCkge1xuICAgICAgICAgIHRoaXMuX2NhY2hlLmRlbGV0ZShjYWNoZVBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX2NhY2hlLmRlbGV0ZShwYXRoKTtcbiAgICB9XG4gICAgdGhpcy5fdXBkYXRlV2F0Y2hlcnMocGF0aCwgSG9zdFdhdGNoRXZlbnRUeXBlLkRlbGV0ZWQpO1xuICB9XG4gIHByb3RlY3RlZCBfcmVuYW1lKGZyb206IFBhdGgsIHRvOiBQYXRoKTogdm9pZCB7XG4gICAgZnJvbSA9IHRoaXMuX3RvQWJzb2x1dGUoZnJvbSk7XG4gICAgdG8gPSB0aGlzLl90b0Fic29sdXRlKHRvKTtcbiAgICBpZiAoIXRoaXMuX2NhY2hlLmhhcyhmcm9tKSkge1xuICAgICAgdGhyb3cgbmV3IEZpbGVEb2VzTm90RXhpc3RFeGNlcHRpb24oZnJvbSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9jYWNoZS5oYXModG8pKSB7XG4gICAgICB0aHJvdyBuZXcgRmlsZUFscmVhZHlFeGlzdEV4Y2VwdGlvbih0byk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2lzRGlyZWN0b3J5KGZyb20pKSB7XG4gICAgICBmb3IgKGNvbnN0IHBhdGggb2YgdGhpcy5fY2FjaGUua2V5cygpKSB7XG4gICAgICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoZnJvbSArIE5vcm1hbGl6ZWRTZXApKSB7XG4gICAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuX2NhY2hlLmdldChwYXRoKTtcbiAgICAgICAgICBpZiAoY29udGVudCkge1xuICAgICAgICAgICAgLy8gV2UgZG9uJ3QgbmVlZCB0byBjbG9uZSBvciBleHRyYWN0IHRoZSBjb250ZW50LCBzaW5jZSB3ZSdyZSBtb3ZpbmcgZmlsZXMuXG4gICAgICAgICAgICB0aGlzLl9jYWNoZS5zZXQoam9pbih0bywgTm9ybWFsaXplZFNlcCwgcGF0aC5zbGljZShmcm9tLmxlbmd0aCkpLCBjb250ZW50KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuX2NhY2hlLmdldChmcm9tKTtcbiAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgIGNvbnN0IGZyYWdtZW50cyA9IHNwbGl0KHRvKTtcbiAgICAgICAgY29uc3QgbmV3RGlyZWN0b3JpZXMgPSBbXTtcbiAgICAgICAgbGV0IGN1cnI6IFBhdGggPSBub3JtYWxpemUoJy8nKTtcbiAgICAgICAgZm9yIChjb25zdCBmciBvZiBmcmFnbWVudHMpIHtcbiAgICAgICAgICBjdXJyID0gam9pbihjdXJyLCBmcik7XG4gICAgICAgICAgY29uc3QgbWF5YmVTdGF0cyA9IHRoaXMuX2NhY2hlLmdldChmcik7XG4gICAgICAgICAgaWYgKG1heWJlU3RhdHMpIHtcbiAgICAgICAgICAgIGlmIChtYXliZVN0YXRzLmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXRoSXNGaWxlRXhjZXB0aW9uKGN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXdEaXJlY3Rvcmllcy5wdXNoKGN1cnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IG5ld0RpcmVjdG9yeSBvZiBuZXdEaXJlY3Rvcmllcykge1xuICAgICAgICAgIHRoaXMuX2NhY2hlLnNldChuZXdEaXJlY3RvcnksIHRoaXMuX25ld0RpclN0YXRzKCkpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NhY2hlLmRlbGV0ZShmcm9tKTtcbiAgICAgICAgdGhpcy5fY2FjaGUuc2V0KHRvLCBjb250ZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLl91cGRhdGVXYXRjaGVycyhmcm9tLCBIb3N0V2F0Y2hFdmVudFR5cGUuUmVuYW1lZCk7XG4gIH1cblxuICBwcm90ZWN0ZWQgX2xpc3QocGF0aDogUGF0aCk6IFBhdGhGcmFnbWVudFtdIHtcbiAgICBwYXRoID0gdGhpcy5fdG9BYnNvbHV0ZShwYXRoKTtcbiAgICBpZiAodGhpcy5faXNGaWxlKHBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgUGF0aElzRmlsZUV4Y2VwdGlvbihwYXRoKTtcbiAgICB9XG5cbiAgICBjb25zdCBmcmFnbWVudHMgPSBzcGxpdChwYXRoKTtcbiAgICBjb25zdCByZXN1bHQgPSBuZXcgU2V0PFBhdGhGcmFnbWVudD4oKTtcbiAgICBpZiAocGF0aCAhPT0gTm9ybWFsaXplZFJvb3QpIHtcbiAgICAgIGZvciAoY29uc3QgcCBvZiB0aGlzLl9jYWNoZS5rZXlzKCkpIHtcbiAgICAgICAgaWYgKHAuc3RhcnRzV2l0aChwYXRoICsgTm9ybWFsaXplZFNlcCkpIHtcbiAgICAgICAgICByZXN1bHQuYWRkKHNwbGl0KHApW2ZyYWdtZW50cy5sZW5ndGhdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGNvbnN0IHAgb2YgdGhpcy5fY2FjaGUua2V5cygpKSB7XG4gICAgICAgIGlmIChwLnN0YXJ0c1dpdGgoTm9ybWFsaXplZFNlcCkgJiYgcCAhPT0gTm9ybWFsaXplZFJvb3QpIHtcbiAgICAgICAgICByZXN1bHQuYWRkKHNwbGl0KHApWzFdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBbLi4ucmVzdWx0XTtcbiAgfVxuXG4gIHByb3RlY3RlZCBfZXhpc3RzKHBhdGg6IFBhdGgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gISF0aGlzLl9jYWNoZS5nZXQodGhpcy5fdG9BYnNvbHV0ZShwYXRoKSk7XG4gIH1cbiAgcHJvdGVjdGVkIF9pc0RpcmVjdG9yeShwYXRoOiBQYXRoKTogYm9vbGVhbiB7XG4gICAgY29uc3QgbWF5YmVTdGF0cyA9IHRoaXMuX2NhY2hlLmdldCh0aGlzLl90b0Fic29sdXRlKHBhdGgpKTtcblxuICAgIHJldHVybiBtYXliZVN0YXRzID8gbWF5YmVTdGF0cy5pc0RpcmVjdG9yeSgpIDogZmFsc2U7XG4gIH1cbiAgcHJvdGVjdGVkIF9pc0ZpbGUocGF0aDogUGF0aCk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IG1heWJlU3RhdHMgPSB0aGlzLl9jYWNoZS5nZXQodGhpcy5fdG9BYnNvbHV0ZShwYXRoKSk7XG5cbiAgICByZXR1cm4gbWF5YmVTdGF0cyA/IG1heWJlU3RhdHMuaXNGaWxlKCkgOiBmYWxzZTtcbiAgfVxuXG4gIHByb3RlY3RlZCBfc3RhdChwYXRoOiBQYXRoKTogU3RhdHM8U2ltcGxlTWVtb3J5SG9zdFN0YXRzPiB8IG51bGwge1xuICAgIGNvbnN0IG1heWJlU3RhdHMgPSB0aGlzLl9jYWNoZS5nZXQodGhpcy5fdG9BYnNvbHV0ZShwYXRoKSk7XG5cbiAgICBpZiAoIW1heWJlU3RhdHMpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbWF5YmVTdGF0cztcbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgX3dhdGNoKHBhdGg6IFBhdGgsIG9wdGlvbnM/OiBIb3N0V2F0Y2hPcHRpb25zKTogT2JzZXJ2YWJsZTxIb3N0V2F0Y2hFdmVudD4ge1xuICAgIHBhdGggPSB0aGlzLl90b0Fic29sdXRlKHBhdGgpO1xuXG4gICAgY29uc3Qgc3ViamVjdCA9IG5ldyBTdWJqZWN0PEhvc3RXYXRjaEV2ZW50PigpO1xuICAgIGxldCBtYXliZVdhdGNoZXJBcnJheSA9IHRoaXMuX3dhdGNoZXJzLmdldChwYXRoKTtcbiAgICBpZiAoIW1heWJlV2F0Y2hlckFycmF5KSB7XG4gICAgICBtYXliZVdhdGNoZXJBcnJheSA9IFtdO1xuICAgICAgdGhpcy5fd2F0Y2hlcnMuc2V0KHBhdGgsIG1heWJlV2F0Y2hlckFycmF5KTtcbiAgICB9XG5cbiAgICBtYXliZVdhdGNoZXJBcnJheS5wdXNoKFtvcHRpb25zIHx8IHt9LCBzdWJqZWN0XSk7XG5cbiAgICByZXR1cm4gc3ViamVjdC5hc09ic2VydmFibGUoKTtcbiAgfVxuXG4gIHdyaXRlKHBhdGg6IFBhdGgsIGNvbnRlbnQ6IEZpbGVCdWZmZXIpOiBPYnNlcnZhYmxlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8dm9pZD4oKG9icykgPT4ge1xuICAgICAgdGhpcy5fd3JpdGUocGF0aCwgY29udGVudCk7XG4gICAgICBvYnMubmV4dCgpO1xuICAgICAgb2JzLmNvbXBsZXRlKCk7XG4gICAgfSk7XG4gIH1cblxuICByZWFkKHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPEZpbGVCdWZmZXI+IHtcbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8RmlsZUJ1ZmZlcj4oKG9icykgPT4ge1xuICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuX3JlYWQocGF0aCk7XG4gICAgICBvYnMubmV4dChjb250ZW50KTtcbiAgICAgIG9icy5jb21wbGV0ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlKHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8dm9pZD4oKG9icykgPT4ge1xuICAgICAgdGhpcy5fZGVsZXRlKHBhdGgpO1xuICAgICAgb2JzLm5leHQoKTtcbiAgICAgIG9icy5jb21wbGV0ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgcmVuYW1lKGZyb206IFBhdGgsIHRvOiBQYXRoKTogT2JzZXJ2YWJsZTx2b2lkPiB7XG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPHZvaWQ+KChvYnMpID0+IHtcbiAgICAgIHRoaXMuX3JlbmFtZShmcm9tLCB0byk7XG4gICAgICBvYnMubmV4dCgpO1xuICAgICAgb2JzLmNvbXBsZXRlKCk7XG4gICAgfSk7XG4gIH1cblxuICBsaXN0KHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPFBhdGhGcmFnbWVudFtdPiB7XG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPFBhdGhGcmFnbWVudFtdPigob2JzKSA9PiB7XG4gICAgICBvYnMubmV4dCh0aGlzLl9saXN0KHBhdGgpKTtcbiAgICAgIG9icy5jb21wbGV0ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgZXhpc3RzKHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8Ym9vbGVhbj4oKG9icykgPT4ge1xuICAgICAgb2JzLm5leHQodGhpcy5fZXhpc3RzKHBhdGgpKTtcbiAgICAgIG9icy5jb21wbGV0ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgaXNEaXJlY3RvcnkocGF0aDogUGF0aCk6IE9ic2VydmFibGU8Ym9vbGVhbj4ge1xuICAgIHJldHVybiBuZXcgT2JzZXJ2YWJsZTxib29sZWFuPigob2JzKSA9PiB7XG4gICAgICBvYnMubmV4dCh0aGlzLl9pc0RpcmVjdG9yeShwYXRoKSk7XG4gICAgICBvYnMuY29tcGxldGUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzRmlsZShwYXRoOiBQYXRoKTogT2JzZXJ2YWJsZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlPGJvb2xlYW4+KChvYnMpID0+IHtcbiAgICAgIG9icy5uZXh0KHRoaXMuX2lzRmlsZShwYXRoKSk7XG4gICAgICBvYnMuY29tcGxldGUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFNvbWUgaG9zdHMgbWF5IG5vdCBzdXBwb3J0IHN0YXQuXG4gIHN0YXQocGF0aDogUGF0aCk6IE9ic2VydmFibGU8U3RhdHM8e30+IHwgbnVsbD4gfCBudWxsIHtcbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGU8U3RhdHM8e30+IHwgbnVsbD4oKG9icykgPT4ge1xuICAgICAgb2JzLm5leHQodGhpcy5fc3RhdChwYXRoKSk7XG4gICAgICBvYnMuY29tcGxldGUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHdhdGNoKHBhdGg6IFBhdGgsIG9wdGlvbnM/OiBIb3N0V2F0Y2hPcHRpb25zKTogT2JzZXJ2YWJsZTxIb3N0V2F0Y2hFdmVudD4gfCBudWxsIHtcbiAgICByZXR1cm4gdGhpcy5fd2F0Y2gocGF0aCwgb3B0aW9ucyk7XG4gIH1cblxuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLl9jYWNoZS5jbGVhcigpO1xuICAgIHRoaXMuX3dhdGNoZXJzLmNsZWFyKCk7XG4gIH1cbn1cbiJdfQ==