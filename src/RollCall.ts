type RollCallResult = 'same' | 'cached' | 'built'

export interface RollCallDictionary {
    [index: string]: RollCallResult;
}

export class RollCall {
    _paths: RollCallDictionary;
    constructor() {
        this._paths = {};
    }
    same(path: string) {
        if (!(path in this._paths)) {
            this._paths[path] = 'same';
        }
    }
    cached(path: string) {
        if (path in this._paths) {
            if (this._paths[path] === 'same') {
                this._paths[path] = 'cached';
            }
        }
        else {
            this._paths[path] = 'cached';
        }
    }
    built(path: string) {
        this._paths[path] = 'built';
    }
}
