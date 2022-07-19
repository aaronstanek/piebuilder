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

function typescriptTarget(project,basename) {
    project.target('out/'+basename+'.js')
        .fileDependency('src/'+basename+'.ts')
        .task(compileTS(basename))
}

typescriptTarget(project,'cache')
typescriptTarget(project,'doTask')
typescriptTarget(project,'hash')
typescriptTarget(project,'index')
typescriptTarget(project,'Project')
typescriptTarget(project,'Source')
typescriptTarget(project,'Target')
typescriptTarget(project,'virtualPath')

project.target(piebuilder.makeVirtualPath('endTarget'))
    .directoryDependency('out')

let duration = project.build(piebuilder.makeVirtualPath('endTarget'))

console.log('built sucessfully in ' + duration + ' milliseconds')
