import * as Project from './Project';
import * as Target from './Target';

type DependencyContextStatus = 'pretarget' | 'active';

type DependencyTuple = [string,Target.DependencyFormEnum];

export class DependencyContext {
    _status: DependencyContextStatus;
    _project: Project.Project;
    _ancestor: DependencyContext | null;
    _dependencies: DependencyTuple[];
    constructor(proj: Project.Project, ans: DependencyContext) {
        this._status = 'pretarget';
        this._project = proj;
        this._ancestor = ans;
        this._dependencies = [];
    }
    _newDependency(path: any, dependencyForm: Target.DependencyFormEnum): void {
        if (this._status !== 'pretarget') {
            throw 'DependencyContext cannot add a new dependency after creating a Target or another DependencyContext';
        }
        if (typeof path !== 'string') {
            throw 'DependencyContext expects dependencies to be strings, not ' + (typeof path);
        }
        this._dependencies.push([path,dependencyForm]);
    }
    fileDependency(path: any): DependencyContext {
        this._newDependency(path,'f');
        return this;
    }
    directorySourcesDependency(path: any): DependencyContext {
        this._newDependency(path,'dr');
        return this;
    }
    directoryTargetsDependency(path: any): DependencyContext {
        this._newDependency(path,'dt');
        return this;
    }
    directoryTotalDependency(path: any): DependencyContext {
        this._newDependency(path,'drt');
        return this;
    }
    dependencyContext(): DependencyContext {
        this._status = 'active';
        return new DependencyContext(this._project,this);
    }
    _applyDependencies(t: Target.Target): void {
        if (this._ancestor !== null) {
            this._ancestor._applyDependencies(t);
        }
        for (let i = 0; i < this._dependencies.length; ++i) {
            let dependency: DependencyTuple = this._dependencies[i];
            t._newDependency(dependency[0],dependency[1]);
        }
    }
    target(path: any): Target.Target {
        this._status = 'active';
        let t: Target.Target = this._project.target(path);
        this._applyDependencies(t);
        return t;
    }
}
