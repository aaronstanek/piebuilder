import * as DependencyContext from './DependencyContext';
import * as Project from './Project';
import * as systemInfo from './systemInfo';
import * as virtualPath from './virtualPath';

module.exports = {
    'DependencyContext': DependencyContext.DependencyContext,
    'Project': Project.Project,
    'sys': systemInfo.systemInfo(),
    'makeVirtualPath': virtualPath.makeVirtualPath
}
