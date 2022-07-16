var os = require('os')
var fs = require('fs')
var piebuilder = require('./piebuilderSource.js')

let project = new piebuilder.Project()

project.globalFileDependency('package.json')
    .globalFileDependency('package-lock.json')
    .globalFileDependency('build.js')
    .beforeTask(
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

project.target('piebuilderSource.js')
    .fileDependency('src/piebuilderSource.ts')
    .task('npx tsc src/piebuilderSource.ts --outDir . --module node16 --strict true --newLine lf')

project.target('out/piebuilder.js')
    .fileDependency('piebuilderSource.js')
    .task('npx minify piebuilderSource.js > out/piebuilder.js')

let duration = project.build('out/piebuilder.js')

console.log('built sucessfully in ' + duration + ' milliseconds')
