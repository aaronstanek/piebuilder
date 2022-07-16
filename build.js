var os = require('os')
var fs = require('fs')
var piebuilder = require('./piebuilderSource.js')

let project = new piebuilder.Project()

project.globalFileDependency('package.json')
    .globalFileDependency('package-lock.json')
    .globalFileDependency('build.js')

let intermediateTarget = project.target('piebuilderSource.js')
    .fileDependency('src/piebuilderSource.ts')
    .task('npx tsc src/piebuilderSource.ts --outDir . --module node16 --strict true --newLine lf')

if (os.platform() === 'win32') {
    // Running on a Windows system
    intermediateTarget.fileDependency('initialize.bat')
}
else {
    // Running on a non-Windows system
    intermediateTarget.fileDependency('initialize.sh')
}

project.target('out/piebuilder.js')
    .fileDependency('piebuilderSource.js')
    .task(
        ()=>{
            if (!fs.existsSync('out')) {
                fs.mkdirSync('out')
                if (fs.existsSync('out')) {
                    return 0;
                }
                else {
                    return 1;
                }
            }
            else {
                return 0;
            }
        }
    )
    .task('npx minify piebuilderSource.js > out/piebuilder.js')

let duration = project.build('out/piebuilder.js')

console.log('built sucessfully in ' + duration + ' milliseconds')
