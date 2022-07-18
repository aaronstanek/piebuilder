import * as fs from 'fs';
import * as pathlib from 'path';

type BuildInfoMetaType = {
    'file_format': number,
    'build_count': number,
    'memory_lifetime': number
}

type PreviousElementType = [string,number]

export interface BuildInfoPreviousType {
    [index: string]: PreviousElementType;
}

export type RecipeType = [string,number]

interface BuildInfoRecipesType {
    [index: string]: RecipeType;
}

export type BuildInfoType = {
    'meta': BuildInfoMetaType,
    'previous': BuildInfoPreviousType,
    'recipes': BuildInfoRecipesType
}

export function saveBuildInfo(path: string, buildInfo: BuildInfoType): void {
    let buildInfoPath: string = pathlib.join(path,'build_info.json');
    let document: string = JSON.stringify(buildInfo);
    fs.writeFileSync(buildInfoPath,document,{flag:'w',encoding:'utf8'});
}

function initializeCache(path: string): void {
    let blobPath: string = pathlib.join(path,'blobs');
    fs.mkdirSync(blobPath,{recursive:true});
}

function checkBuildInfoMetaFormat(meta: any): boolean {
    if (typeof meta !== 'object') return false;
    if (typeof meta.file_format !== 'number') return false;
    if (typeof meta.build_count !== 'number') return false;
    if (typeof meta.memory_lifetime !== 'number') return false;
    return true;
}

function checkBuildInfoPreviousRecipesFormat(recipes: any): boolean {
    if (typeof recipes !== 'object') return false;
    let keys: string[] = Object.keys(recipes);
    for (let i = 0; i < keys.length; ++i) {
        let element: any = recipes[keys[i]];
        if (!Array.isArray(element)) return false;
        if (element.length !== 2) return false;
        if (typeof element[0] !== 'string') return false;
        if (typeof element[1] !== 'number') return false;
    }
    return true;
}

function checkBuildInfoFormat(buildInfo: any): boolean {
    if (typeof buildInfo !== 'object') return false;
    if (!checkBuildInfoMetaFormat(buildInfo.meta)) return false;
    if (!checkBuildInfoPreviousRecipesFormat(buildInfo.previous)) return false;
    if (!checkBuildInfoPreviousRecipesFormat(buildInfo.recipes)) return false;
    return true;
}

function loadBuildInfoMini(path: string): BuildInfoType | null {
    let buildInfoPath: string = pathlib.join(path,'build_info.json');
    try {
        let output: any = JSON.parse(fs.readFileSync(buildInfoPath,{flag:'r',encoding:'utf8'}));
        if (checkBuildInfoFormat(output)) return output;
    }
    catch {}
    return null;
}

export function loadBuildInfo(path: string): BuildInfoType {
    initializeCache(path);
    let output: BuildInfoType | null = loadBuildInfoMini(path);
    if (output !== null) return output;
    saveBuildInfo(
        path,
        {
            'meta': {
                'file_format': 1,
                'build_count': 0,
                'memory_lifetime': 20
            },
            'previous': {},
            'recipes': {}
        }
    );
    output = loadBuildInfoMini(path);
    if (output !== null) return output;
    // we are not able to load the cache
    // there is no recovery
    throw 'Unable to load cache. Program terminated.';
}

export function blobExists(path: string, blobName: string): boolean {
    let blobPath: string = pathlib.join(pathlib.join(path,"blobs"),blobName);
    return fs.existsSync(blobPath);
}

interface BlobCollectionType {
    [index: string]: null;
}

export function purgeOldRecipes(meta: BuildInfoMetaType, recipes: BuildInfoRecipesType): BlobCollectionType {
    // returns names of active blobs
    // first purge the old recipes
    let oldestBirthday: number = meta.build_count - meta.memory_lifetime;
    // oldestBirthday is the oldest recipes that we will retain
    let recipeList: string[] = Object.keys(recipes);
    let activeBlobs: BlobCollectionType = {};
    for (let i = 0; i < recipeList.length; ++i) {
        let recipe: RecipeType = recipes[recipeList[i]];
        if (recipe[1] < oldestBirthday || recipe[1] > meta.build_count) {
            // we need to delete this recipe
            delete recipes[recipeList[i]];
        }
        else {
            // we should keep the associated blob
            activeBlobs[recipe[0]] = null;
        }
    }
    return activeBlobs;
}

export function purgeUnunsedBlobs(path: string, activeBlobs: BlobCollectionType): void {
    let blobPath: string = pathlib.join(path,'blobs');
    let blobList: string[];
    try {
        blobList = fs.readdirSync(blobPath);
    }
    catch {
        // we are not able to access the blob directory
        // this isn't the end of the world
        // just give up?
        return;
    }
    for (let i = 0; i < blobList.length; ++i) {
        if (!(blobList[i] in activeBlobs)) {
            // we need to delete this blob
            let deletionPath = pathlib.join(blobPath,blobList[i]);
            fs.unlinkSync(deletionPath);
        }
    }
}

export function copyFileIntoCache(path: string, sourcePath: string, blobName: string): void {
    let destinationPath: string = pathlib.join(pathlib.join(path,"blobs"),blobName);
    fs.copyFileSync(sourcePath,destinationPath);
}

export function copyFileFromCache(path: string, destinationPath: string, blobName: string): void {
    let sourcePath: string = pathlib.join(pathlib.join(path,"blobs"),blobName);
    fs.copyFileSync(sourcePath,destinationPath);
}
