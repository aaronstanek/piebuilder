var os = require('os')
var fs = require('fs')
var piebuilder = require('piebuilder')

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

function compileTS(basename) {
    return ()=>{
        return 'npx tsc src/' + basename + '.ts --outDir ./out --module commonjs --strict true --newLine lf';
    }
}

function typescriptTarget(project,basename) {
    project.target('out/'+basename+'.js')
        .fileDependency('src/'+basename+'.ts')
        .task(compileTS(basename))
}

typescriptTarget(project,'piebuilder')
typescriptTarget(project,'hash')
typescriptTarget(project,'index')

project.target('.gitignore')
    .fileDependency('out/package.json')
    .fileDependency('out/piebuilder.js')
    .fileDependency('out/index.js')

let duration = project.build('.gitignore')

console.log('built sucessfully in ' + duration + ' milliseconds')
