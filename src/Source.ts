import * as hash from './hash';

export class Source {
    _path: string;
    _isfile: boolean;
    _buildHash: string;
    constructor(path: string, isfile: boolean) {
        this._path = path;
        this._isfile = isfile;
        this._buildHash = '';
    }
    _computeBuildHash(): void {
        if (this._buildHash.length) return;
        if (this._isfile) {
            this._buildHash = hash.fileToHash(this._path);
        }
        else {
            this._buildHash = hash.directoryToHash(this._path);
        }
        if (this._buildHash.length < 1) {
            throw 'Source not available: ' + this._path;
        }
    }
}
