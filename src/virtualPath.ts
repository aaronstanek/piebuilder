export function makeVirtualPath(path: string): string {
    return 'virtual\x00' + path;
}

export function pathIsVirtual(path: string): boolean {
    return (path.slice(0,8) === 'virtual\x00');
}
