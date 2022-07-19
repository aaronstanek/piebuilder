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

function allTypescriptTargets(project) {
    let src = fs.readdirSync('src')
    for (let i = 0; i < src.length; ++i) {
        let name = src[i]
        if (name.slice(name.length-3) === '.ts') {
            typescriptTarget(project,name.slice(0,name.length-3))
        }
    }
}

allTypescriptTargets(project)

project.target(piebuilder.makeVirtualPath('endTarget'))
    .directoryTargetsDependency('out')

let duration = project.build(piebuilder.makeVirtualPath('endTarget'))

console.log('built sucessfully in ' + duration + ' milliseconds')
