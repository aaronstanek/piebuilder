import * as pathlib from 'path';
import * as hash from './hash';
import * as cache from './cache';
import * as doTask from './doTask';
import * as Source from './Source';
import * as Project from './Project';

interface RawDependencyDictionaryType {
    [index: string]: boolean;
    // true for file
    // false for directory
}

export interface PathsDictionaryType {
    [index: string]: Target | Source.Source;
}

export class Target {
    _paths: string[];
    _tasks: doTask.TaskItemType[];
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
                let obj: Target | Source.Source = projectPaths[dependency];
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
                let source: Source.Source = new Source.Source(dependency,this._rawDependencies[dependency]);
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
    _hardBuild(project: Project.Project, buildInfo: cache.BuildInfoType): void {
        for (let i = 0; i < this._tasks.length; ++i) {
            doTask.doTask(this._tasks[i]);
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
            cache.copyFileIntoCache(project._cachePath,targetPath,targetHash);
            buildInfo.previous[targetPath] = [targetHash,buildInfo.meta.build_count];
            let recipeHash: string = this._computeRecipeHash(targetPath);
            buildInfo.recipes[recipeHash] = [targetHash,buildInfo.meta.build_count];
        }
    }
    _computeBuildHash(previous: cache.BuildInfoPreviousType): string {
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
    _build(project: Project.Project, buildInfo: cache.BuildInfoType): void {
        if (this._buildHash.length) return;
        this._computeExactDependencies(project._paths);
        // this._exactDependencies is set
        // build all dependencies recursively
        let dependencyList: string[] = Object.keys(this._exactDependencies);
        for (let i = 0; i < dependencyList.length; ++i) {
            let obj: Target | Source.Source = this._exactDependencies[dependencyList[i]];
            if (obj instanceof Target) {
                // obj is a Target
                obj._build(project,buildInfo);
            }
            else {
                // obj is a Source.Source
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
                    let recipe: cache.RecipeType = buildInfo.recipes[recipeHash];
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
                    if (cache.blobExists(project._cachePath,targetHash)) {
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
                cache.copyFileFromCache(project._cachePath,blobCopyList[i][0],blobCopyList[i][1]);
                buildInfo.previous[blobCopyList[i][0]] = [blobCopyList[i][1],buildInfo.meta.build_count];
            }
        }
        this._buildHash = this._computeBuildHash(buildInfo.previous);
    }
}
