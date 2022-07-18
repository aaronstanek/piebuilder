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

project.target('out/package.json')
    .fileDependency('src/package.json')
    .task(
        ()=>{
            fs.copyFileSync('src/package.json','out/package.json')
            return 0;
        }
    )

project.target('out/piebuilder.js')
    .fileDependency('src/piebuilder.ts')
    .task('npx tsc src/piebuilder.ts --outDir ./out --module commonjs --strict true --newLine lf')

project.target('out/index.js')
    .fileDependency('src/index.ts')
    .task('npx tsc src/index.ts --outDir ./out --module commonjs --strict true --newLine lf')

let duration = project.build('out/package.json')
    + project.build('out/piebuilder.js')
    + project.build('out/index.js')

console.log('built sucessfully in ' + duration + ' milliseconds')
