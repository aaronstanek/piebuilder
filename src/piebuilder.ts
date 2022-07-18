// imports

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as pathlib from 'path';
import * as child_process from 'child_process';

import * as hash from './hash';

// cache management

type BuildInfoMetaType = {
    'file_format': number,
    'build_count': number,
    'memory_lifetime': number
}

type PreviousElementType = [string,number]

interface BuildInfoPreviousType {
    [index: string]: PreviousElementType;
}

type RecipeType = [string,number]

interface BuildInfoRecipesType {
    [index: string]: RecipeType;
}

type BuildInfoType = {
    'meta': BuildInfoMetaType,
    'previous': BuildInfoPreviousType,
    'recipes': BuildInfoRecipesType
}

function saveBuildInfo(path: string, buildInfo: BuildInfoType): void {
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

function loadBuildInfo(path: string): BuildInfoType {
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

function blobExists(path: string, blobName: string): boolean {
    let blobPath: string = pathlib.join(pathlib.join(path,"blobs"),blobName);
    return fs.existsSync(blobPath);
}

interface BlobCollectionType {
    [index: string]: null;
}

function purgeOldRecipes(meta: BuildInfoMetaType, recipes: BuildInfoRecipesType): BlobCollectionType {
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

function purgeUnunsedBlobs(path: string, activeBlobs: BlobCollectionType): void {
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

function copyFileIntoCache(path: string, sourcePath: string, blobName: string): void {
    let destinationPath: string = pathlib.join(pathlib.join(path,"blobs"),blobName);
    fs.copyFileSync(sourcePath,destinationPath);
}

function copyFileFromCache(path: string, destinationPath: string, blobName: string): void {
    let sourcePath: string = pathlib.join(pathlib.join(path,"blobs"),blobName);
    fs.copyFileSync(sourcePath,destinationPath);
}

type TaskItemType = string | Function;

function callShell(command: string): number | null {
    return child_process.spawnSync(
        command,
        {
            shell:true,
            stdio:'inherit'
        }
        ).status;
}

function doTask(taskitem: TaskItemType): void {
    let finalResult: number | null;
    if (typeof taskitem === 'string') {
        finalResult = callShell(taskitem);
    }
    else {
        let intermediateResult: any = taskitem();
        if (typeof intermediateResult === 'number' || intermediateResult === null) {
            finalResult = intermediateResult;
        }
        else if (typeof intermediateResult === 'string') {
            finalResult = callShell(intermediateResult);
        }
        else {
            throw 'Task returned an unexpected type: ' + (typeof intermediateResult);
        }
    }
    if (finalResult === null) {
        throw 'Task returned null exit code';
    }
    if (finalResult !== 0) {
        throw 'Task returned nonzero exit code: ' + finalResult;
    }
}

interface RawDependencyDictionaryType {
    [index: string]: boolean;
    // true for file
    // false for directory
}

interface PathsDictionaryType {
    [index: string]: Target | Source;
}

class Source {
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

class Target {
    _paths: string[];
    _tasks: TaskItemType[];
    _rawDependencies: RawDependencyDictionaryType;
    _exactDependencies: PathsDictionaryType;
    _buildHash: string;
    constructor(path: any) {
        if (typeof path === 'string') {
            if (path.length < 1) {
                throw 'Target constructor expects string argument to have length of at least 1';
            }
            this._paths = [pathlib.normalize(path)];
        }
        else if (Array.isArray(path)) {
            if (path.length < 1) {
                throw 'Target constructor expects array argument to have length of at least 1';
            }
            for (let i = 0; i < path.length; ++i) {
                if (typeof path[i] !== 'string') {
                    throw 'Target constructor expects array argument to be filled with nonempty strings';
                }
                if (path[i].length < 1) {
                    throw 'Target constructor expects array argument to be filled with nonempty strings';
                }
            }
            this._paths = [];
            for (let i = 0; i < path.length; ++i) {
                this._paths.push(pathlib.normalize(path[i]));
            }
        }
        else {
            throw 'Target constructor expects string or array of strings, not ' + (typeof path);
        }
        this._tasks = [];
        this._rawDependencies = {};
        this._exactDependencies = {};
        this._buildHash = '';
    }
    task(taskitem: any): Target {
        if (typeof taskitem === 'string' || typeof taskitem === 'function') {
            this._tasks.push(taskitem);
        }
        else {
            throw 'In Target: ' + JSON.stringify(this._paths) + ' Target.task expects string or function argument, not ' + (typeof taskitem);
        }
        return this;
    }
    _newDependency(path: any, isfile: boolean): void {
        if (typeof path !== 'string') {
            throw 'In Target: ' + JSON.stringify(this._paths) + ' Target dependencies must be strings, not ' + (typeof path);
        }
        path = pathlib.normalize(path);
        if (path in this._rawDependencies) {
            throw 'In Target: ' + JSON.stringify(this._paths) + ' Duplicate registration of dependency: ' + path;
        }
        this._rawDependencies[path] = isfile;
    }
    fileDependency(path: any): Target {
        this._newDependency(path,true);
        return this;
    }
    directoryDependency(path: any): Target {
        this._newDependency(path,false);
        return this;
    }
    _computeExactDependencies(projectPaths: PathsDictionaryType): void {
        let dependencyList: string[] = Object.keys(this._rawDependencies);
        for (let i = 0; i < dependencyList.length; ++i) {
            let dependency: string = dependencyList[i];
            if (dependency in projectPaths) {
                // we know about this dependency
                // we need to double check that we have the details right
                let obj: Target | Source = projectPaths[dependency];
                if (obj instanceof Target) {
                    // obj is a target
                    // we must have indicated this as a file dependency
                    if (this._rawDependencies[dependency]) {
                        // the user correctly marked this as a file
                        this._exactDependencies[dependency] = obj;
                    }
                    else {
                        // the user incorrectly marked this as a directory
                        throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a directory, but it is actually a file';
                    }
                }
                else {
                    // obj is a source
                    if (this._rawDependencies[dependency]) {
                        // it was marked as a file
                        if (obj._isfile) {
                            // correctly marked as a file
                            this._exactDependencies[dependency] = obj;
                        }
                        else {
                            throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a file, but it is actually a directory';
                        }
                    }
                    else {
                        // it was marked as a directory
                        if (obj._isfile) {
                            throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a directory, but it is actually a file';
                        }
                        else {
                            // correctly marked as dependency
                            this._exactDependencies[dependency] = obj;
                        }
                    }
                }
            }
            else {
                // we do not know about this dependency
                // we need to create a source
                let source: Source = new Source(dependency,this._rawDependencies[dependency]);
                this._exactDependencies[dependency] = source;
                projectPaths[dependency] = source;
            }
        }
    }
    _computeRecipeHash(targetPath: string): string {
        let dependencyList = Object.keys(this._exactDependencies);
        // need consistent order
        dependencyList.sort();
        // build document
        let document: string[][] = [[targetPath]];
        for (let i = 0; i < dependencyList.length; ++i) {
            let dependency: string = dependencyList[i];
            document.push([dependency,this._exactDependencies[dependency]._buildHash]);
        }
        return hash.documentToHash(document);
    }
    _hardBuild(project: Project, buildInfo: BuildInfoType): void {
        for (let i = 0; i < this._tasks.length; ++i) {
            doTask(this._tasks[i]);
        }
        // need to check that we actually did something
        // need to update previous and recipes
        for (let i = 0; i < this._paths.length; ++i) {
            let targetPath: string = this._paths[i];
            let targetHash: string = hash.fileToHash(this._paths[i]);
            if (targetHash.length < 1) {
                // the file was not created
                throw 'Target was not created by tasks: ' + targetPath;
            }
            copyFileIntoCache(project._cachePath,targetPath,targetHash);
            buildInfo.previous[targetPath] = [targetHash,buildInfo.meta.build_count];
            let recipeHash: string = this._computeRecipeHash(targetPath);
            buildInfo.recipes[recipeHash] = [targetHash,buildInfo.meta.build_count];
        }
    }
    _computeBuildHash(previous: BuildInfoPreviousType): string {
        // all the values for previous exist and are correct
        let document: string[][] = [];
        let pathsLocalCopy = [...this._paths];
        pathsLocalCopy.sort(); // need consistent order
        for (let i = 0; i < pathsLocalCopy.length; ++i) {
            let path: string = pathsLocalCopy[i];
            document.push([path,previous[path][0]]);
        }
        return hash.documentToHash(document);
    }
    _build(project: Project, buildInfo: BuildInfoType): void {
        if (this._buildHash.length) return;
        this._computeExactDependencies(project._paths);
        // this._exactDependencies is set
        // build all dependencies recursively
        let dependencyList: string[] = Object.keys(this._exactDependencies);
        for (let i = 0; i < dependencyList.length; ++i) {
            let obj: Target | Source = this._exactDependencies[dependencyList[i]];
            if (obj instanceof Target) {
                // obj is a Target
                obj._build(project,buildInfo);
            }
            else {
                // obj is a Source
                obj._computeBuildHash();
            }
        }
        // all dependencies and subdependencies are built
        let blobCopyList: string[][] = [];
        // [destinaitonPath,blobName]
        let hardBuildRequired = false;
        if (project._cautionLevel === 3) {
            hardBuildRequired = true;
        }
        else {
            for (let i = 0; i < this._paths.length; ++i) {
                let targetPath: string = this._paths[i];
                let recipeHash: string = this._computeRecipeHash(targetPath);
                // check if this is a known recipe
                if (recipeHash in buildInfo.recipes) {
                    // this is a known recipe
                    // there is a decent chance that it is in previous
                    // we probably have a blob for it if we need it
                    let recipe: RecipeType = buildInfo.recipes[recipeHash];
                    recipe[1] = buildInfo.meta.build_count;
                    let targetHash: string = recipe[0];
                    // check to see if the file is already built in place
                    if (targetPath in buildInfo.previous) {
                        if (buildInfo.previous[targetPath][0] === targetHash) {
                            // the file is already built in place
                            // we don't have to do anything
                            if (project._cautionLevel === 1) {
                                buildInfo.previous[targetPath][1] = buildInfo.meta.build_count;
                                continue;
                            }
                            else {
                                // cautionLevel === 2
                                // in theory, we shouldn't need to take any action
                                // but with the higher level of caution, we should
                                // be sure that the target hasn't actually changed
                                // since the last build
                                if (hash.fileToHash(targetPath) === targetHash) {
                                    // yep, all good
                                    buildInfo.previous[targetPath][1] = buildInfo.meta.build_count;
                                    continue;
                                }
                                // the caution level was warranted
                                // this target file did change since the last build
                            }
                        }
                    }
                    // either the file did not exist previously
                    // or its hash is wrong
                    if (blobExists(project._cachePath,targetHash)) {
                        blobCopyList.push([targetPath,targetHash]);
                    }
                    else {
                        // the blob should exist
                        // but it doesn't
                        // we will have to do a hard build
                        hardBuildRequired = true;
                        break;
                    }
                }
                else {
                    // this is an unkonwn recipe
                    // we will have to do a hard build
                    hardBuildRequired = true;
                    break;
                }
            }
        }
        // we have identified the steps that we need to take in order to do the build
        if (hardBuildRequired) {
            this._hardBuild(project,buildInfo);
        }
        else {
            for (let i = 0; i < blobCopyList.length; ++i) {
                copyFileFromCache(project._cachePath,blobCopyList[i][0],blobCopyList[i][1]);
                buildInfo.previous[blobCopyList[i][0]] = [blobCopyList[i][1],buildInfo.meta.build_count];
            }
        }
        this._buildHash = this._computeBuildHash(buildInfo.previous);
    }
}

type ProjectStatusType = 'prebuild' | 'active' | 'error';

export class Project {
    _status: ProjectStatusType;
    _cautionLevel: 1 | 2 | 3;
    _cachePath: string;
    _paths: PathsDictionaryType;
    _globalFileDependencies: string[];
    _globalDirectoryDependencies: string[];
    _beforeTasks: TaskItemType[];
    _afterTasks: TaskItemType[];
    constructor() {
        this._status = 'prebuild';
        this._cautionLevel = 2; // good medium choice
        this._cachePath = pathlib.normalize('piebuilder_cache');
        this._paths = {};
        this._globalFileDependencies = [];
        this._globalDirectoryDependencies = [];
        this._beforeTasks = [];
        this._afterTasks = [];
    }
    setCachePath(path: any): Project {
        if (this._status !== 'prebuild') {
            throw 'Project.setCachePath may not be called after calling Project.build';
        }
        if (typeof path !== 'string') {
            throw 'Project.setCachePath expects a string argument, not ' + (typeof path);
        }
        if (path.length < 1) {
            throw 'Project.setCachePath expects a nonempty string argument';
        }
        this._cachePath = pathlib.normalize(path);
        return this;
    }
    setCautionLevel(level: any): Project {
        if (typeof level !== 'number') {
            throw 'Project.setCautionLevel expects a number argument, not ' + (typeof level);
        }
        if (level !== 1 && level !== 2 && level !== 3) {
            throw 'Project.setCautionLevel expects argument to be 1, 2, or 3, not ' + level;
        }
        this._cautionLevel = level;
        return this;
    }
    globalFileDependency(path: any): Project {
        if (typeof path !== 'string') {
            throw 'Project.globalFileDependency expects a string argument, not ' + (typeof path);
        }
        if (path.length < 1) {
            throw 'Project.globalFileDependency expects a nonempty string argument';
        }
        this._globalFileDependencies.push(path);
        return this;
    }
    globalDirectoryDependency(path: any): Project {
        if (typeof path !== 'string') {
            throw 'Project.globalDirectoryDependency expects a string argument, not ' + (typeof path);
        }
        if (path.length < 1) {
            throw 'Project.globalDirectoryDependency expects a nonempty string argument';
        }
        this._globalDirectoryDependencies.push(path);
        return this;
    }
    target(path: any): Target {
        if (this._status !== 'prebuild') {
            throw 'Project.target may not be called after calling Project.build';
        }
        let obj: Target = new Target(path);
        for (let i = 0; i < obj._paths.length; ++i) {
            if (obj._paths[i] in this._paths) {
                throw 'Duplicate registration of target path: '+obj._paths[i];
            }
        }
        // do all the checking before we put any new
        // entries into this._paths
        // this way, if there is an exception in the loop above
        // then the project will be unchanged
        for (let i = 0; i < obj._paths.length; ++i) {
            this._paths[obj._paths[i]] = obj;
        }
        return obj;
    }
    _checkTaskType(taskitem: any): void {
        if (typeof taskitem !== 'string' && typeof taskitem !== 'function') {
            throw 'Tasks passed to Project must be strings or functions, not ' + (typeof taskitem);
        }
    }
    beforeTask(taskitem: any): Project {
        this._checkTaskType(taskitem);
        this._beforeTasks.push(taskitem);
        return this;
    }
    afterTask(taskitem: any): Project {
        this._checkTaskType(taskitem);
        this._afterTasks.push(taskitem);
        return this;
    }
    _activate(): void {
        this._status = 'active';
        let targetPaths: string[] = Object.keys(this._paths);
        for (let i = 0; i < targetPaths.length; ++i) {
            let targetPath: string = targetPaths[i];
            let obj: Target = this._paths[targetPath] as Target;
            // typecasting is safe here because Source objects
            // are only added after the first call to Target.build
            // we know that hasn't happened yet because we just flipped
            // the status from 'prebuild' to 'active'
            for (let j = 0; j < this._globalFileDependencies.length; ++j) {
                obj.fileDependency(this._globalFileDependencies[j]);
            }
            for (let j = 0; j < this._globalDirectoryDependencies.length; ++j) {
                obj.directoryDependency(this._globalDirectoryDependencies[j]);
            }
        }
    }
    build(goalPath: any) {
        if (this._status === 'error') {
            throw 'Project.build may not be called after a build error has occured';
        }
        if (typeof goalPath !== 'string') {
            throw 'Project.build expects a string argument, not ' + (typeof goalPath);
        }
        if (goalPath.length < 1) {
            throw 'Project.build expects a nonempty string argument';
        }
        goalPath = pathlib.normalize(goalPath);
        if (!(goalPath in this._paths)) {
            throw 'Project.build expects a target path to be given as an argument, not ' + goalPath;
        }
        let obj: Target | Source = this._paths[goalPath];
        if (obj instanceof Source) {
            throw 'Project.build expects a target path to be given as an argument, not a source: ' + goalPath;
        }
        let startTime: number = new Date().getTime();
        if (this._status === 'prebuild') {
            this._activate();
        }
        let buildInfo: BuildInfoType | null = null;
        try {
            buildInfo = loadBuildInfo(this._cachePath);
            buildInfo.meta.build_count += 1;
            for (let i = 0; i < this._beforeTasks.length; ++i) {
                doTask(this._beforeTasks[i]);
            }
            obj._build(this,buildInfo);
            purgeOldRecipes(buildInfo.meta,buildInfo.previous);
            purgeUnunsedBlobs(this._cachePath,purgeOldRecipes(buildInfo.meta,buildInfo.recipes));
            saveBuildInfo(this._cachePath,buildInfo);
            for (let i = 0; i < this._afterTasks.length; ++i) {
                doTask(this._afterTasks[i]);
            }
        }
        catch (e: any) {
            this._status = 'error';
            if (buildInfo === null) {
                // there was an error loading the build info
                throw e;
            }
            else {
                // we were able to load the build info
                // but there was an error somewhere else
                saveBuildInfo(this._cachePath,buildInfo);
            }
            throw e;
        }
        return (new Date().getTime()) - startTime;
    }
}
