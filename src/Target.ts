import * as pathlib from 'path';
import * as hash from './hash';
import * as cache from './cache';
import * as doTask from './doTask';
import * as virtualPath from './virtualPath';
import * as Source from './Source';
import * as Project from './Project';
import * as RollCall from './RollCall';

export type DependencyFormEnum = 'f' | 'dr' | 'dt' | 'drt';
// f for file (target or source)
// dr (directory is source)
// dt (directory is filled with other targets)
// drt (both dr and drt)

interface RawDependencyDictionaryType {
    [index: string]: DependencyFormEnum;
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
    _newDependency(path: any, dependencyForm: DependencyFormEnum): void {
        if (typeof path !== 'string') {
            throw 'In Target: ' + JSON.stringify(this._paths) + ' Target dependencies must be strings, not ' + (typeof path);
        }
        path = pathlib.normalize(path);
        if (path in this._rawDependencies) {
            throw 'In Target: ' + JSON.stringify(this._paths) + ' Duplicate registration of dependency: ' + path;
        }
        this._rawDependencies[path] = dependencyForm;
    }
    fileDependency(path: any): Target {
        this._newDependency(path,'f');
        return this;
    }
    directorySourcesDependency(path: any): Target {
        this._newDependency(path,'dr');
        return this;
    }
    directoryTargetsDependency(path: any): Target {
        this._newDependency(path,'dt');
        return this;
    }
    directoryTotalDependency(path: any): Target {
        this._newDependency(path,'drt');
        return this;
    }
    _computeExactDependenciesFormF(projectPaths: PathsDictionaryType, dependency: string): void {
        // dependency is marked as a file
        // it could be a target or a source
        if (dependency in projectPaths) {
            // we know about this dependency
            let obj: Target | Source.Source = projectPaths[dependency];
            if (obj instanceof Target) {
                // obj is a Target
                // Target can only reference a file
                this._exactDependencies[dependency] = obj;
            }
            else {
                // obj is a Source
                // it could reference a file or directory
                // double check that it is actually a file
                if (obj._isfile) {
                    this._exactDependencies[dependency] = obj;
                }
                else {
                    // wrong
                    throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a file, but it is actually a directory';
                }
            }
        }
        else {
            // we don't know about this dependency
            // we need to create it
            let source: Source.Source = new Source.Source(dependency,true);
            projectPaths[dependency] = source;
            this._exactDependencies[dependency] = source;
        }
    }
    _computeExactDependenciesFormDR(projectPaths: PathsDictionaryType, dependency: string): void {
        // dependency is marked as a recursive
        // hash of a directory tree
        if (dependency in projectPaths) {
            // we know about this dependency
            // we can just use the existing object
            let obj: Target | Source.Source = projectPaths[dependency];
            // check that it's a source
            if (obj instanceof Source.Source) {
                // check that it's a directory source
                if (obj._isfile) {
                    throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a directory, but it is actually a file';
                }
                else {
                    this._exactDependencies[dependency] = obj;
                }
            }
            else {
                throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a source, but it is actually a target';
            }
        }
        else {
            // we don't know about this dependency
            // we need to create it
            let source: Source.Source = new Source.Source(dependency,false);
            projectPaths[dependency] = source;
            this._exactDependencies[dependency] = source;
        }
    }
    _computeExactDependenciesFormDT(projectPaths: PathsDictionaryType, dependency: string) {
        // dependency is marked as a
        // hash of all taargets in a directory
        // first, make sure that we won't have a name
        // conflict by virtualizing the name
        let virtualDependencyName = virtualPath.makeVirtualAutoPath(dependency);
        if (virtualDependencyName in this._rawDependencies) {
            throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + virtualDependencyName + ' was registered by the user, but this virtual path is required by the system for another purpose';
        }
        // we need to create a virtual file to depend on all of these
        // things for easier reuse
        if (virtualDependencyName in projectPaths) {
            // we know about this dependency
            // we can just use the existing object
            let obj: Target | Source.Source = projectPaths[virtualDependencyName];
            // an integrity check here doesn't do much
            // because is is very unlikely that this path could have been
            // created by the user
            // but nonetheless, it is good practice
            if (obj instanceof Target) {
                this._exactDependencies[virtualDependencyName] = obj;
            }
            else {
                throw 'In Target: ' + JSON.stringify(this._paths) + ' dependency: ' + dependency + ' was marked as a target, but it is actually a source';
            }
        }
        else {
            // we don't know about this dependency
            // we need to create it
            // find all targets
            // that are within the scope of the path
            let virtualDependency: Target = new Target(virtualDependencyName);
            let projectPathsList: string[] = Object.keys(projectPaths);
            for (let i = 0; i < projectPathsList.length; ++i) {
                let path: string = projectPathsList[i];
                if (virtualPath.pathIsVirtual(path)) continue;
                if (projectPaths[path] instanceof Source.Source) continue;
                // we are only considering real targets at this point
                let relativePath = pathlib.relative(dependency,path);
                if (relativePath.slice(0,2) !== '..') {
                    // path is within the scope of dependency
                    virtualDependency.fileDependency(path);
                }
            }
            // virtualDependency now has all the necessary targets
            // as direct dependencies
            projectPaths[virtualDependencyName] = virtualDependency;
            this._exactDependencies[virtualDependencyName] = virtualDependency;
        }
    }
    _computeExactDependencies(projectPaths: PathsDictionaryType): void {
        let dependencyList: string[] = Object.keys(this._rawDependencies);
        for (let i = 0; i < dependencyList.length; ++i) {
            let dependency: string = dependencyList[i];
            let dependencyForm: DependencyFormEnum = this._rawDependencies[dependency];
            if (dependencyForm === 'f') {
                this._computeExactDependenciesFormF(projectPaths,dependency);
            }
            else if (dependencyForm === 'dr') {
                this._computeExactDependenciesFormDR(projectPaths,dependency);
            }
            else if (dependencyForm === 'dt') {
                this._computeExactDependenciesFormDT(projectPaths,dependency);
            }
            else {
                // dependencyForm === 'drt
                // it's ok to use both because the DT dependency name
                // becomes virtualized
                this._computeExactDependenciesFormDR(projectPaths,dependency);
                this._computeExactDependenciesFormDT(projectPaths,dependency);
            }
        }
    }
    _buildDependencies(rollcall: RollCall.RollCall, project: Project.Project, buildInfo: cache.BuildInfoType): void {
        // build all dependencies
        // because a target in a drt dependency
        // might impact the source hash
        // building targets before sources will ensure that
        // if a target's correct hash is unchanged, then the drt
        // source will also be unchanged, avoiding extra recipes and rebuilds
        let dependencyList: string[] = Object.keys(this._exactDependencies);
        let targetDependencies: Target[] = [];
        let sourceDependencies: Source.Source[] = [];
        for (let i = 0; i < dependencyList.length; ++i) {
            let obj: Target | Source.Source = this._exactDependencies[dependencyList[i]];
            if (obj instanceof Target) {
                targetDependencies.push(obj);
            }
            else {
                sourceDependencies.push(obj);
            }
        }
        for (let i = 0; i < targetDependencies.length; ++i) {
            targetDependencies[i]._build(rollcall,project,buildInfo);
        }
        for (let i = 0; i < sourceDependencies.length; ++i) {
            sourceDependencies[i]._computeBuildHash();
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
            if (virtualPath.pathIsVirtual(targetPath)) {
                // this is a virtual file
                // there is nothing on the hard drive
                let recipeHash: string = this._computeRecipeHash(targetPath);
                // we can say that the contents of the virtual file
                // are it's recipe document
                // that way its recipe hash is the same as its content hash
                buildInfo.previous[targetPath] = [recipeHash,buildInfo.meta.build_count];
                buildInfo.recipes[recipeHash] = [recipeHash,buildInfo.meta.build_count];
            }
            else {
                // this is a real file which actually exists on the hard drive
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
    _build(rollcall: RollCall.RollCall, project: Project.Project, buildInfo: cache.BuildInfoType): void {
        if (this._buildHash.length) {
            if (this._buildHash === 'building') {
                throw 'Circular dependencies detected in target: ' + JSON.stringify(this._paths);
            }
            else {
                return;
            }
        }
        this._buildHash = 'building';
        this._computeExactDependencies(project._paths);
        // this._exactDependencies is set
        // build all dependencies recursively
        this._buildDependencies(rollcall,project,buildInfo);
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
                            if (project._cautionLevel === 1 || virtualPath.pathIsVirtual(targetPath)) {
                                // if the file is virtual then it cannot have changed since
                                // the last build
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
                    if (virtualPath.pathIsVirtual(targetPath)) {
                        // we will never have a blob available for a virtual file
                        // so we shouldn't even look
                        // because looking takes extra time
                        hardBuildRequired = true;
                        break
                    }
                    else if (cache.blobExists(project._cachePath,targetHash)) {
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
