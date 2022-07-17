var os = require('os')
var fs = require('fs')
var piebuilder = require('./out/piebuilder.js')

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

project.target('out/piebuilder.js')
    .fileDependency('src/piebuilder.ts')
    .task('npx tsc src/piebuilder.ts --outDir ./out --module commonjs --strict true --newLine lf')

let duration = project.build('out/piebuilder.js')

console.log('built sucessfully in ' + duration + ' milliseconds')
