import * as os from 'os';

type SystemInfoType = {
    'family': 'unix' | 'windows',
    'pathSep': '/' | '\\',
    'shellSep': ';' | '&'
}

export function systemInfo(): SystemInfoType {
    switch (os.platform()) {
        case 'aix':
        case 'android':
        case 'darwin':
        case 'freebsd':
        case 'linux':
        case 'openbsd':
        case 'sunos':
            return {
                family: 'unix',
                pathSep: '/',
                shellSep: ';'
            }
        case 'win32':
            return {
                family: 'windows',
                pathSep: '\\',
                shellSep: '&'
            }
        default:
            throw "Unknown platform";
    }
}
