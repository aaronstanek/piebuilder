import * as crypto from 'crypto';
import * as fs from 'fs';
import * as pathlib from 'path';

export function documentToHash(obj: string[][]): string {
    // returns hex of hash
    let docString: string = JSON.stringify(obj);
    return crypto.createHash('sha256').update(docString).digest('hex');
}

export function fileToHash(path: string): string {
    // returns empty string on error
    // otherwise returns hex of hash
    let file;
    try {
        file = fs.readFileSync(path,{flag:'r'});
    }
    catch {
        return '';
    }
    let hash = crypto.createHash('sha256');
    hash.update(file);
    return hash.digest('hex');
}

export function directoryToHash(path: string): string {
    // returns empty string on error
    // otherwise returns hex of hash
    let dirContents: string[];
    try {
        dirContents = fs.readdirSync(path);
    }
    catch {
        return '';
    }
    // we want to access the elements in a consistent order
    dirContents.sort();
    // then create a document of the hashs of the elements
    // then take the hash of that document
    let document: string[][] = [];
    for (let i = 0; i < dirContents.length; ++i) {
        let totalPath: string = pathlib.join(path,dirContents[i]);
        let pathStats = fs.statSync(totalPath);
        if (pathStats.isFile()) {
            let fileHash: string = fileToHash(totalPath);
            if (fileHash.length) {
                document.push([totalPath,'f',fileHash]);
            }
            else {
                // there was an error while reading the file
                // propagate error upwards
                return '';
            }
        }
        else if (pathStats.isDirectory()) {
            let directoryHash: string = directoryToHash(totalPath);
            if (directoryHash.length) {
                document.push([totalPath,'d',directoryHash]);
            }
            else {
                // there was an error while computing the hash
                // of the directory
                // propagate error upwards
                return '';
            }
        }
    }
    // we have the complete document of contents' hashes
    // now return its hash
    return documentToHash(document);
}
