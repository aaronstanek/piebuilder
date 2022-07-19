import * as pathlib from 'path';

import * as cache from './cache';
import * as DependencyContext from './DependencyContext';
import * as doTask from './doTask';
import * as Source from './Source';
import * as Target from './Target';

type ProjectStatusType = 'prebuild' | 'active' | 'error';

export class Project {
    _status: ProjectStatusType;
    _cautionLevel: 1 | 2 | 3;
    _cachePath: string;
    _paths: Target.PathsDictionaryType;
    _beforeTasks: doTask.TaskItemType[];
    _afterTasks: doTask.TaskItemType[];
    constructor() {
        this._status = 'prebuild';
        this._cautionLevel = 2; // good medium choice
        this._cachePath = pathlib.normalize('piebuilder_cache');
        this._paths = {};
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
    target(path: any): Target.Target {
        if (this._status !== 'prebuild') {
            throw 'Project.target may not be called after calling Project.build';
        }
        let obj: Target.Target = new Target.Target(path);
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
    dependencyContext(): DependencyContext.DependencyContext {
        if (this._status !== 'prebuild') {
            throw 'Project.dependencyContext may not be called after calling Project.build';
        }
        return new DependencyContext.DependencyContext(this,null);
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
        let obj: Target.Target | Source.Source = this._paths[goalPath];
        if (obj instanceof Source.Source) {
            throw 'Project.build expects a target path to be given as an argument, not a source: ' + goalPath;
        }
        let startTime: number = new Date().getTime();
        if (this._status === 'prebuild') {
            this._status = 'active';
        }
        let buildInfo: cache.BuildInfoType | null = null;
        try {
            buildInfo = cache.loadBuildInfo(this._cachePath);
            buildInfo.meta.build_count += 1;
            for (let i = 0; i < this._beforeTasks.length; ++i) {
                doTask.doTask(this._beforeTasks[i]);
            }
            obj._build(this,buildInfo);
            cache.purgeOldRecipes(buildInfo.meta,buildInfo.previous);
            cache.purgeUnunsedBlobs(this._cachePath,cache.purgeOldRecipes(buildInfo.meta,buildInfo.recipes));
            cache.saveBuildInfo(this._cachePath,buildInfo);
            for (let i = 0; i < this._afterTasks.length; ++i) {
                doTask.doTask(this._afterTasks[i]);
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
                cache.saveBuildInfo(this._cachePath,buildInfo);
            }
            throw e;
        }
        return (new Date().getTime()) - startTime;
    }
}
