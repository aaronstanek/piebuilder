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

function typescriptTarget(basename,dependencies) {
    let t = project.target('out/'+basename+'.js')
        .fileDependency('src/'+basename+'.ts')
        .task(compileTS(basename))
    for (let i = 0; i < dependencies.length; ++i) {
        t.fileDependency('src/'+dependencies[i]+'.ts')
    }
}

typescriptTarget('cache',[])
typescriptTarget('doTask',[])
typescriptTarget('hash',[])
typescriptTarget('index',['Project','virtualPath'])
typescriptTarget('Project',['cache','doTask','Source','Target'])
typescriptTarget('Source',['hash'])
typescriptTarget('Target',['cache','hash','doTask','Project','Source','virtualPath'])
typescriptTarget('virtualPath',[])

project.target(piebuilder.makeVirtualPath('endTarget'))
    .directoryTargetsDependency('out')

let duration = project.build(piebuilder.makeVirtualPath('endTarget'))

console.log('built sucessfully in ' + duration + ' milliseconds')
