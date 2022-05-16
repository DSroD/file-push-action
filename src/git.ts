import * as actionsExec from '@actions/exec';
import {ExecOptions} from '@actions/exec';

export interface ExecResult {
  returnCode: number;
  stdout: string;
  stderr: string;
}

export const exec = async (command: string, args: string[] = [], silent?: boolean): Promise<ExecResult> => {
  let stdout = '';
  let stderr = '';

  const options: ExecOptions = {
    silent: silent,
    ignoreReturnCode: false
  };
  options.listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString();
    },
    stderr: (data: Buffer) => {
      stderr += data.toString();
    }
  };

  const returnCode: number = await actionsExec.exec(command, args, options);

  return {
    returnCode: returnCode,
    stdout: stdout.trim(),
    stderr: stderr.trim()
  };
};

export const defaults = {
    committer: 'GitHub <noreply@github.com>',
    author: 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
    message: 'Push Files Action'
  };
  
  export async function remoteBranchExists(remoteURL: string, branch: string): Promise<boolean> {
    return await exec('git', ['ls-remote', '--heads', remoteURL, branch], true).then(res => {
      if (res.stderr != '' && res.returnCode !== 0) {
        throw new Error(res.stderr);
      }
      return res.stdout.trim().length > 0;
    });
  }
  
  export async function clone(remoteURL: string, branch: string, dest: string): Promise<void> {
    await exec('git', ['clone', '--quiet', '--branch', branch, '--depth', '1', remoteURL, dest]);
  }
  
  export async function init(dest: string): Promise<void> {
    await exec('git', ['init', dest]);
  }
  
  export async function checkout(branch: string): Promise<void> {
    await exec('git', ['checkout', '--orphan', branch]);
  }
  
  export async function isDirty(): Promise<boolean> {
    return await exec('git', ['status', '--short'], true).then(res => {
      if (res.stderr != '' && res.returnCode !== 0) {
        throw new Error(res.stderr);
      }
      return res.stdout.trim().length > 0;
    });
  }
  
  export async function hasChanges(): Promise<boolean> {
    return await exec('git', ['status', '--porcelain'], true).then(res => {
      if (res.stderr != '' && res.returnCode !== 0) {
        throw new Error(res.stderr);
      }
      return res.stdout.trim().length > 0;
    });
  }
  
  export async function setConfig(key: string, value: string): Promise<void> {
    await exec('git', ['config', key, value]);
  }
  
  export async function add(pattern: string, verbose: boolean): Promise<void> {
    const args: Array<string> = ['add'];
    if (verbose) {
      args.push('--verbose');
    }
    args.push('--all', pattern);
    await exec('git', args);
  }
  
  export async function commit(allowEmptyCommit: boolean, author: string, message: string): Promise<void> {
    const args: Array<string> = [];
    args.push('commit');
    if (allowEmptyCommit) {
      args.push('--allow-empty');
    }
    if (author !== '') {
      args.push('--author', author);
    }
    args.push('--message', message);
    await exec('git', args);
  }
  
  export async function showStat(): Promise<string> {
    return await exec('git', ['show', `--stat-count=1000`, 'HEAD'], true).then(res => {
      if (res.stderr != '' && res.returnCode !== 0) {
        throw new Error(res.stderr);
      }
      return res.stdout.trim();
    });
  }
  
  export async function push(remoteURL: string, branch: string, force: boolean): Promise<void> {
    const args: Array<string> = [];
    args.push('push');
    if (force) {
      args.push('--force');
    }
    args.push(remoteURL, branch);
    await exec('git', args);
  }