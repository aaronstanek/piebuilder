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

project.target('out' + piebuilder.sys.pathSep + 'package.json')
    .fileDependency('src' + piebuilder.sys.pathSep + 'package.json')
    .task(
        ()=>{
            fs.copyFileSync(
                'src' + piebuilder.sys.pathSep + 'package.json',
                'out' + piebuilder.sys.pathSep + 'package.json'
                )
            return 0;
        }
    )

function compileTS(basename) {
    return ()=>{
        return 'npx tsc src' + piebuilder.sys.pathSep + basename + '.ts --outDir .'
            + piebuilder.sys.pathSep + 'out --module commonjs --strict true --newLine lf';
    }
}

function typescriptTarget(basename,dependencies) {
    let t = project.target('out' + piebuilder.sys.pathSep + basename + '.js')
        .fileDependency('src' + piebuilder.sys.pathSep + basename + '.ts')
        .task(compileTS(basename))
    for (let i = 0; i < dependencies.length; ++i) {
        t.fileDependency('src' + piebuilder.sys.pathSep+dependencies[i] + '.ts')
    }
}

typescriptTarget('cache',[])
typescriptTarget('DependencyContext',[])
typescriptTarget('doTask',[])
typescriptTarget('hash',[])
typescriptTarget('index',['DependencyContext','Project','systemInfo','virtualPath'])
typescriptTarget('Project',['cache','DependencyContext','doTask','RollCall','Source','Target'])
typescriptTarget('RollCall',[])
typescriptTarget('Source',['hash'])
typescriptTarget('systemInfo',[])
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
