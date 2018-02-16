"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Subject_1 = require("rxjs/Subject");
const empty_1 = require("rxjs/observable/empty");
const of_1 = require("rxjs/observable/of");
const throw_1 = require("rxjs/observable/throw");
const exception_1 = require("../../exception/exception");
const path_1 = require("../path");
class SimpleMemoryHost {
    constructor() {
        this._cache = new Map();
        this._watchers = new Map();
    }
    _isDir(path) {
        if (path === '/') {
            return true;
        }
        for (const p of this._cache.keys()) {
            if (p.startsWith(path + path_1.NormalizedSep)) {
                return true;
            }
        }
        return false;
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
            maybeWatcher.forEach(watcher => {
                const [options, subject] = watcher;
                subject.next({ path, time, type });
                if (!options.persistent && type == 2 /* Deleted */) {
                    subject.complete();
                    this._watchers.delete(currentPath);
                }
            });
        }
        do {
            currentPath = parent !== null ? parent : currentPath;
            parent = path_1.dirname(currentPath);
            const maybeWatcher = this._watchers.get(currentPath);
            if (maybeWatcher) {
                maybeWatcher.forEach(watcher => {
                    const [options, subject] = watcher;
                    if (!options.recursive) {
                        return;
                    }
                    subject.next({ path, time, type });
                    if (!options.persistent && type == 2 /* Deleted */) {
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
    write(path, content) {
        if (this._isDir(path)) {
            return throw_1._throw(new exception_1.PathIsDirectoryException(path));
        }
        const existed = this._cache.has(path);
        this._cache.set(path, content);
        this._updateWatchers(path, existed ? 0 /* Changed */ : 1 /* Created */);
        return empty_1.empty();
    }
    read(path) {
        if (this._isDir(path)) {
            return throw_1._throw(new exception_1.PathIsDirectoryException(path));
        }
        const maybeBuffer = this._cache.get(path);
        if (!maybeBuffer) {
            return throw_1._throw(new exception_1.FileDoesNotExistException(path));
        }
        else {
            return of_1.of(maybeBuffer);
        }
    }
    delete(path) {
        if (this._isDir(path)) {
            for (const [cachePath, _] of this._cache.entries()) {
                if (path.startsWith(cachePath + path_1.NormalizedSep)) {
                    this._cache.delete(cachePath);
                }
            }
        }
        else {
            this._cache.delete(path);
        }
        this._updateWatchers(path, 2 /* Deleted */);
        return empty_1.empty();
    }
    rename(from, to) {
        if (!this._cache.has(from)) {
            return throw_1._throw(new exception_1.FileDoesNotExistException(from));
        }
        else if (this._cache.has(to)) {
            return throw_1._throw(new exception_1.FileAlreadyExistException(from));
        }
        if (this._isDir(from)) {
            for (const path of this._cache.keys()) {
                if (path.startsWith(from + path_1.NormalizedSep)) {
                    const content = this._cache.get(path);
                    if (content) {
                        this._cache.set(path_1.join(to, path_1.NormalizedSep, path.slice(from.length)), content);
                    }
                }
            }
        }
        else {
            const content = this._cache.get(from);
            if (content) {
                this._cache.delete(from);
                this._cache.set(to, content);
            }
        }
        this._updateWatchers(from, 3 /* Renamed */);
        return empty_1.empty();
    }
    list(path) {
        if (this._cache.has(path)) {
            return throw_1._throw(new exception_1.PathIsFileException(path));
        }
        const fragments = path_1.split(path);
        const result = new Set();
        if (path !== path_1.NormalizedRoot) {
            for (const p of this._cache.keys()) {
                if (p.startsWith(path + path_1.NormalizedSep)) {
                    result.add(path_1.split(p)[fragments.length]);
                }
            }
        }
        else {
            for (const p of this._cache.keys()) {
                if (p.startsWith(path_1.NormalizedSep)) {
                    result.add(path_1.split(p)[1]);
                }
            }
        }
        return of_1.of([...result]);
    }
    exists(path) {
        return of_1.of(this._cache.has(path) || this._isDir(path));
    }
    isDirectory(path) {
        return of_1.of(this._isDir(path));
    }
    isFile(path) {
        return of_1.of(this._cache.has(path));
    }
    stats(_path) {
        return null;
    }
    watch(path, options) {
        const subject = new Subject_1.Subject();
        let maybeWatcherArray = this._watchers.get(path);
        if (!maybeWatcherArray) {
            maybeWatcherArray = [];
            this._watchers.set(path, maybeWatcherArray);
        }
        maybeWatcherArray.push([options || {}, subject]);
        return subject.asObservable();
    }
}
exports.SimpleMemoryHost = SimpleMemoryHost;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVtb3J5LmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9jb3JlL3NyYy92aXJ0dWFsLWZzL2hvc3QvbWVtb3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsMENBQXVDO0FBQ3ZDLGlEQUE4QztBQUM5QywyQ0FBd0Q7QUFDeEQsaURBQStDO0FBQy9DLHlEQUttQztBQUNuQyxrQ0FRaUI7QUFZakI7SUFBQTtRQUNVLFdBQU0sR0FBRyxJQUFJLEdBQUcsRUFBb0IsQ0FBQztRQUNyQyxjQUFTLEdBQUcsSUFBSSxHQUFHLEVBQXVELENBQUM7SUFrTHJGLENBQUM7SUFoTFcsTUFBTSxDQUFDLElBQVU7UUFDekIsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNkLENBQUM7UUFFRCxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksR0FBRyxvQkFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2QsQ0FBQztRQUNILENBQUM7UUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVTLGVBQWUsQ0FBQyxJQUFVLEVBQUUsSUFBd0I7UUFDNUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUN4QixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDdkIsSUFBSSxNQUFNLEdBQWdCLElBQUksQ0FBQztRQUUvQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdCLHdDQUF3QztZQUN4QyxNQUFNLENB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Q0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVELGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUVqRCxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQ2hDLENBQUM7Q0FDRjtBQXBMRCw0Q0FvTEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAncnhqcy9PYnNlcnZhYmxlJztcbmltcG9ydCB7IFN1YmplY3QgfSBmcm9tICdyeGpzL1N1YmplY3QnO1xuaW1wb3J0IHsgZW1wdHkgfSBmcm9tICdyeGpzL29ic2VydmFibGUvZW1wdHknO1xuaW1wb3J0IHsgb2YgYXMgb2JzZXJ2YWJsZU9mIH0gZnJvbSAncnhqcy9vYnNlcnZhYmxlL29mJztcbmltcG9ydCB7IF90aHJvdyB9IGZyb20gJ3J4anMvb2JzZXJ2YWJsZS90aHJvdyc7XG5pbXBvcnQge1xuICBGaWxlQWxyZWFkeUV4aXN0RXhjZXB0aW9uLFxuICBGaWxlRG9lc05vdEV4aXN0RXhjZXB0aW9uLFxuICBQYXRoSXNEaXJlY3RvcnlFeGNlcHRpb24sXG4gIFBhdGhJc0ZpbGVFeGNlcHRpb24sXG59IGZyb20gJy4uLy4uL2V4Y2VwdGlvbi9leGNlcHRpb24nO1xuaW1wb3J0IHtcbiAgTm9ybWFsaXplZFJvb3QsXG4gIE5vcm1hbGl6ZWRTZXAsXG4gIFBhdGgsXG4gIFBhdGhGcmFnbWVudCxcbiAgZGlybmFtZSxcbiAgam9pbixcbiAgc3BsaXQsXG59IGZyb20gJy4uL3BhdGgnO1xuaW1wb3J0IHtcbiAgRmlsZUJ1ZmZlcixcbiAgSG9zdCxcbiAgSG9zdENhcGFiaWxpdGllcyxcbiAgSG9zdFdhdGNoRXZlbnQsXG4gIEhvc3RXYXRjaEV2ZW50VHlwZSxcbiAgSG9zdFdhdGNoT3B0aW9ucyxcbiAgU3RhdHMsXG59IGZyb20gJy4vaW50ZXJmYWNlJztcblxuXG5leHBvcnQgY2xhc3MgU2ltcGxlTWVtb3J5SG9zdCBpbXBsZW1lbnRzIEhvc3Q8e30+IHtcbiAgcHJpdmF0ZSBfY2FjaGUgPSBuZXcgTWFwPFBhdGgsIEZpbGVCdWZmZXI+KCk7XG4gIHByaXZhdGUgX3dhdGNoZXJzID0gbmV3IE1hcDxQYXRoLCBbSG9zdFdhdGNoT3B0aW9ucywgU3ViamVjdDxIb3N0V2F0Y2hFdmVudD5dW10+KCk7XG5cbiAgcHJvdGVjdGVkIF9pc0RpcihwYXRoOiBQYXRoKSB7XG4gICAgaWYgKHBhdGggPT09ICcvJykge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBwIG9mIHRoaXMuX2NhY2hlLmtleXMoKSkge1xuICAgICAgaWYgKHAuc3RhcnRzV2l0aChwYXRoICsgTm9ybWFsaXplZFNlcCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJvdGVjdGVkIF91cGRhdGVXYXRjaGVycyhwYXRoOiBQYXRoLCB0eXBlOiBIb3N0V2F0Y2hFdmVudFR5cGUpIHtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUoKTtcbiAgICBsZXQgY3VycmVudFBhdGggPSBwYXRoO1xuICAgIGxldCBwYXJlbnQ6IFBhdGggfCBudWxsID0gbnVsbDtcblxuICAgIGlmICh0aGlzLl93YXRjaGVycy5zaXplID09IDApIHtcbiAgICAgIC8vIE5vdGhpbmcgdG8gZG8gaWYgdGhlcmUncyBubyB3YXRjaGVycy5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBtYXliZVdhdGNoZXIgPSB0aGlzLl93YXRjaGVycy5nZXQoY3VycmVudFBhdGgpO1xuICAgIGlmIChtYXliZVdhdGNoZXIpIHtcbiAgICAgIG1heWJlV2F0Y2hlci5mb3JFYWNoKHdhdGNoZXIgPT4ge1xuICAgICAgICBjb25zdCBbb3B0aW9ucywgc3ViamVjdF0gPSB3YXRjaGVyO1xuICAgICAgICBzdWJqZWN0Lm5leHQoeyBwYXRoLCB0aW1lLCB0eXBlIH0pO1xuXG4gICAgICAgIGlmICghb3B0aW9ucy5wZXJzaXN0ZW50ICYmIHR5cGUgPT0gSG9zdFdhdGNoRXZlbnRUeXBlLkRlbGV0ZWQpIHtcbiAgICAgICAgICBzdWJqZWN0LmNvbXBsZXRlKCk7XG4gICAgICAgICAgdGhpcy5fd2F0Y2hlcnMuZGVsZXRlKGN1cnJlbnRQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZG8ge1xuICAgICAgY3VycmVudFBhdGggPSBwYXJlbnQgIT09IG51bGwgPyBwYXJlbnQgOiBjdXJyZW50UGF0aDtcbiAgICAgIHBhcmVudCA9IGRpcm5hbWUoY3VycmVudFBhdGgpO1xuXG4gICAgICBjb25zdCBtYXliZVdhdGNoZXIgPSB0aGlzLl93YXRjaGVycy5nZXQoY3VycmVudFBhdGgpO1xuICAgICAgaWYgKG1heWJlV2F0Y2hlcikge1xuICAgICAgICBtYXliZVdhdGNoZXIuZm9yRWFjaCh3YXRjaGVyID0+IHtcbiAgICAgICAgICBjb25zdCBbb3B0aW9ucywgc3ViamVjdF0gPSB3YXRjaGVyO1xuICAgICAgICAgIGlmICghb3B0aW9ucy5yZWN1cnNpdmUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgc3ViamVjdC5uZXh0KHsgcGF0aCwgdGltZSwgdHlwZSB9KTtcblxuICAgICAgICAgIGlmICghb3B0aW9ucy5wZXJzaXN0ZW50ICYmIHR5cGUgPT0gSG9zdFdhdGNoRXZlbnRUeXBlLkRlbGV0ZWQpIHtcbiAgICAgICAgICAgIHN1YmplY3QuY29tcGxldGUoKTtcbiAgICAgICAgICAgIHRoaXMuX3dhdGNoZXJzLmRlbGV0ZShjdXJyZW50UGF0aCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IHdoaWxlIChwYXJlbnQgIT0gY3VycmVudFBhdGgpO1xuICB9XG5cbiAgZ2V0IGNhcGFiaWxpdGllcygpOiBIb3N0Q2FwYWJpbGl0aWVzIHtcbiAgICByZXR1cm4geyBzeW5jaHJvbm91czogdHJ1ZSB9O1xuICB9XG5cbiAgd3JpdGUocGF0aDogUGF0aCwgY29udGVudDogRmlsZUJ1ZmZlcik6IE9ic2VydmFibGU8dm9pZD4ge1xuICAgIGlmICh0aGlzLl9pc0RpcihwYXRoKSkge1xuICAgICAgcmV0dXJuIF90aHJvdyhuZXcgUGF0aElzRGlyZWN0b3J5RXhjZXB0aW9uKHBhdGgpKTtcbiAgICB9XG5cbiAgICBjb25zdCBleGlzdGVkID0gdGhpcy5fY2FjaGUuaGFzKHBhdGgpO1xuICAgIHRoaXMuX2NhY2hlLnNldChwYXRoLCBjb250ZW50KTtcbiAgICB0aGlzLl91cGRhdGVXYXRjaGVycyhwYXRoLCBleGlzdGVkID8gSG9zdFdhdGNoRXZlbnRUeXBlLkNoYW5nZWQgOiBIb3N0V2F0Y2hFdmVudFR5cGUuQ3JlYXRlZCk7XG5cbiAgICByZXR1cm4gZW1wdHk8dm9pZD4oKTtcbiAgfVxuICByZWFkKHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPEZpbGVCdWZmZXI+IHtcbiAgICBpZiAodGhpcy5faXNEaXIocGF0aCkpIHtcbiAgICAgIHJldHVybiBfdGhyb3cobmV3IFBhdGhJc0RpcmVjdG9yeUV4Y2VwdGlvbihwYXRoKSk7XG4gICAgfVxuICAgIGNvbnN0IG1heWJlQnVmZmVyID0gdGhpcy5fY2FjaGUuZ2V0KHBhdGgpO1xuICAgIGlmICghbWF5YmVCdWZmZXIpIHtcbiAgICAgIHJldHVybiBfdGhyb3cobmV3IEZpbGVEb2VzTm90RXhpc3RFeGNlcHRpb24ocGF0aCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb2JzZXJ2YWJsZU9mKG1heWJlQnVmZmVyKTtcbiAgICB9XG4gIH1cbiAgZGVsZXRlKHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5faXNEaXIocGF0aCkpIHtcbiAgICAgIGZvciAoY29uc3QgW2NhY2hlUGF0aCwgX10gb2YgdGhpcy5fY2FjaGUuZW50cmllcygpKSB7XG4gICAgICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoY2FjaGVQYXRoICsgTm9ybWFsaXplZFNlcCkpIHtcbiAgICAgICAgICB0aGlzLl9jYWNoZS5kZWxldGUoY2FjaGVQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9jYWNoZS5kZWxldGUocGF0aCk7XG4gICAgfVxuICAgIHRoaXMuX3VwZGF0ZVdhdGNoZXJzKHBhdGgsIEhvc3RXYXRjaEV2ZW50VHlwZS5EZWxldGVkKTtcblxuICAgIHJldHVybiBlbXB0eSgpO1xuICB9XG4gIHJlbmFtZShmcm9tOiBQYXRoLCB0bzogUGF0aCk6IE9ic2VydmFibGU8dm9pZD4ge1xuICAgIGlmICghdGhpcy5fY2FjaGUuaGFzKGZyb20pKSB7XG4gICAgICByZXR1cm4gX3Rocm93KG5ldyBGaWxlRG9lc05vdEV4aXN0RXhjZXB0aW9uKGZyb20pKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuX2NhY2hlLmhhcyh0bykpIHtcbiAgICAgIHJldHVybiBfdGhyb3cobmV3IEZpbGVBbHJlYWR5RXhpc3RFeGNlcHRpb24oZnJvbSkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5faXNEaXIoZnJvbSkpIHtcbiAgICAgIGZvciAoY29uc3QgcGF0aCBvZiB0aGlzLl9jYWNoZS5rZXlzKCkpIHtcbiAgICAgICAgaWYgKHBhdGguc3RhcnRzV2l0aChmcm9tICsgTm9ybWFsaXplZFNlcCkpIHtcbiAgICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5fY2FjaGUuZ2V0KHBhdGgpO1xuICAgICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgICB0aGlzLl9jYWNoZS5zZXQoam9pbih0bywgTm9ybWFsaXplZFNlcCwgcGF0aC5zbGljZShmcm9tLmxlbmd0aCkpLCBjb250ZW50KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuX2NhY2hlLmdldChmcm9tKTtcbiAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgIHRoaXMuX2NhY2hlLmRlbGV0ZShmcm9tKTtcbiAgICAgICAgdGhpcy5fY2FjaGUuc2V0KHRvLCBjb250ZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLl91cGRhdGVXYXRjaGVycyhmcm9tLCBIb3N0V2F0Y2hFdmVudFR5cGUuUmVuYW1lZCk7XG5cbiAgICByZXR1cm4gZW1wdHkoKTtcbiAgfVxuXG4gIGxpc3QocGF0aDogUGF0aCk6IE9ic2VydmFibGU8UGF0aEZyYWdtZW50W10+IHtcbiAgICBpZiAodGhpcy5fY2FjaGUuaGFzKHBhdGgpKSB7XG4gICAgICByZXR1cm4gX3Rocm93KG5ldyBQYXRoSXNGaWxlRXhjZXB0aW9uKHBhdGgpKTtcbiAgICB9XG4gICAgY29uc3QgZnJhZ21lbnRzID0gc3BsaXQocGF0aCk7XG4gICAgY29uc3QgcmVzdWx0ID0gbmV3IFNldDxQYXRoRnJhZ21lbnQ+KCk7XG4gICAgaWYgKHBhdGggIT09IE5vcm1hbGl6ZWRSb290KSB7XG4gICAgICBmb3IgKGNvbnN0IHAgb2YgdGhpcy5fY2FjaGUua2V5cygpKSB7XG4gICAgICAgIGlmIChwLnN0YXJ0c1dpdGgocGF0aCArIE5vcm1hbGl6ZWRTZXApKSB7XG4gICAgICAgICAgcmVzdWx0LmFkZChzcGxpdChwKVtmcmFnbWVudHMubGVuZ3RoXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChjb25zdCBwIG9mIHRoaXMuX2NhY2hlLmtleXMoKSkge1xuICAgICAgICBpZiAocC5zdGFydHNXaXRoKE5vcm1hbGl6ZWRTZXApKSB7XG4gICAgICAgICAgcmVzdWx0LmFkZChzcGxpdChwKVsxXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JzZXJ2YWJsZU9mKFsuLi5yZXN1bHRdKTtcbiAgfVxuXG4gIGV4aXN0cyhwYXRoOiBQYXRoKTogT2JzZXJ2YWJsZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIG9ic2VydmFibGVPZih0aGlzLl9jYWNoZS5oYXMocGF0aCkgfHwgdGhpcy5faXNEaXIocGF0aCkpO1xuICB9XG4gIGlzRGlyZWN0b3J5KHBhdGg6IFBhdGgpOiBPYnNlcnZhYmxlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gb2JzZXJ2YWJsZU9mKHRoaXMuX2lzRGlyKHBhdGgpKTtcbiAgfVxuICBpc0ZpbGUocGF0aDogUGF0aCk6IE9ic2VydmFibGU8Ym9vbGVhbj4ge1xuICAgIHJldHVybiBvYnNlcnZhYmxlT2YodGhpcy5fY2FjaGUuaGFzKHBhdGgpKTtcbiAgfVxuXG4gIHN0YXRzKF9wYXRoOiBQYXRoKTogT2JzZXJ2YWJsZTxTdGF0czx7fT4+IHwgbnVsbCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB3YXRjaChwYXRoOiBQYXRoLCBvcHRpb25zPzogSG9zdFdhdGNoT3B0aW9ucyk6IE9ic2VydmFibGU8SG9zdFdhdGNoRXZlbnQ+IHwgbnVsbCB7XG4gICAgY29uc3Qgc3ViamVjdCA9IG5ldyBTdWJqZWN0PEhvc3RXYXRjaEV2ZW50PigpO1xuICAgIGxldCBtYXliZVdhdGNoZXJBcnJheSA9IHRoaXMuX3dhdGNoZXJzLmdldChwYXRoKTtcbiAgICBpZiAoIW1heWJlV2F0Y2hlckFycmF5KSB7XG4gICAgICBtYXliZVdhdGNoZXJBcnJheSA9IFtdO1xuICAgICAgdGhpcy5fd2F0Y2hlcnMuc2V0KHBhdGgsIG1heWJlV2F0Y2hlckFycmF5KTtcbiAgICB9XG5cbiAgICBtYXliZVdhdGNoZXJBcnJheS5wdXNoKFtvcHRpb25zIHx8IHt9LCBzdWJqZWN0XSk7XG5cbiAgICByZXR1cm4gc3ViamVjdC5hc09ic2VydmFibGUoKTtcbiAgfVxufVxuIl19