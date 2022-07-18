import * as child_process from 'child_process';

export type TaskItemType = string | Function;

function callShell(command: string): number | null {
    return child_process.spawnSync(
        command,
        {
            shell:true,
            stdio:'inherit'
        }
        ).status;
}

export function doTask(taskitem: TaskItemType): void {
    let finalResult: number | null;
    if (typeof taskitem === 'string') {
        finalResult = callShell(taskitem);
    }
    else {
        let intermediateResult: any = taskitem();
        if (typeof intermediateResult === 'number' || intermediateResult === null) {
            finalResult = intermediateResult;
        }
        else if (typeof intermediateResult === 'string') {
            finalResult = callShell(intermediateResult);
        }
        else {
            throw 'Task returned an unexpected type: ' + (typeof intermediateResult);
        }
    }
    if (finalResult === null) {
        throw 'Task returned null exit code';
    }
    if (finalResult !== 0) {
        throw 'Task returned nonzero exit code: ' + finalResult;
    }
}
