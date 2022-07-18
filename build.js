var os = require('os')
var fs = require('fs')
var piebuilder = require('piebuilder')

let project = new piebuilder.Project()

project.beforeTask(
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

function typescriptTarget(project,endTarget,basename) {
    endTarget.fileDependency('out/' + basename + '.js')
    project.target('out/'+basename+'.js')
        .fileDependency('src/'+basename+'.ts')
        .task(compileTS(basename))
}

let endTarget = project.target('.gitignore')
    .fileDependency('out/package.json')

typescriptTarget(project,endTarget,'cache')
typescriptTarget(project,endTarget,'doTask')
typescriptTarget(project,endTarget,'hash')
typescriptTarget(project,endTarget,'index')
typescriptTarget(project,endTarget,'Project')
typescriptTarget(project,endTarget,'Source')
typescriptTarget(project,endTarget,'Target')
typescriptTarget(project,endTarget,'virtualPath')

let duration = project.build('.gitignore')

console.log('built sucessfully in ' + duration + ' milliseconds')
