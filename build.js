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
typescriptTarget('DependencyContext',[])
typescriptTarget('doTask',[])
typescriptTarget('hash',[])
typescriptTarget('index',['DependencyContext','Project','virtualPath'])
typescriptTarget('Project',['cache','DependencyContext','doTask','RollCall','Source','Target'])
typescriptTarget('RollCall',[])
typescriptTarget('Source',['hash'])
typescriptTarget('Target',['cache','hash','doTask','Project','RollCall','Source','virtualPath'])
typescriptTarget('virtualPath',[])

project.target(piebuilder.makeVirtualPath('endTarget'))
    .directoryTargetsDependency('out')

let buildOutput = project.build(piebuilder.makeVirtualPath('endTarget'))

console.log('')

let fileList = Object.keys(buildOutput.files)
for (let i = 0; i < fileList.length; ++i) {
    let fileName = fileList[i]
    console.log(fileName,buildOutput.files[fileName])
}

console.log('')

console.log('built sucessfully in ' + buildOutput.duration + ' milliseconds')

console.log('')
