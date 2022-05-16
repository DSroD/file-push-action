import * as core from '@actions/core';
import * as git from './git';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { copy, writeFile } from 'fs-extra';
import addressparser from 'addressparser';

async function run() {
    try {
        const domain: string = core.getInput('domain') || 'github.com';
        const repo: string = core.getInput('repo') || process.env['GITHUB_REPOSITORY'] || '';
        const targetBranch: string = core.getInput('target_branch', {required: true})
        const keepHistory: boolean = /true/i.test(core.getInput('keep_history'));
        const allowEmptyCommit: boolean = /true/i.test(core.getInput('allow_empty_commit'));
        const buildDir: string = core.getInput('build_dir', {required: true});
        const absoluteBuildDir: boolean = /true/i.test(core.getInput('absolute_build_dir'));
        const followSymlinks: boolean = /true/i.test(core.getInput('follow_symlinks'));
        const committer: string = core.getInput('committer') || git.defaults.committer;
        const author: string = core.getInput('author') || git.defaults.author;
        const commitMessage: string = core.getInput('commit_message') || git.defaults.message;
        const dryRun: boolean = /true/i.test(core.getInput('dry_run'));
        const verbose: boolean = /true/i.test(core.getInput('verbose'));
        const file_wildcards: string[] = core.getInput('file_wildcards', { required: true }).split("\n").map(x => x.trim());
        const ignore: string = core.getInput('ignore') ||'';

        if (!fs.existsSync(buildDir)) {
            core.setFailed('Build dir does not exist');
            return;
          }
      
        let remoteURL = String('https://');
        if (process.env['GH_PAT']) {
            core.debug(`Use GH_PAT`);
            remoteURL = remoteURL.concat(process.env['GH_PAT'].trim(), '@');
        }
        else if (process.env['GITHUB_TOKEN']) {
            core.debug(`Use GITHUB_TOKEN`);
            remoteURL = remoteURL.concat('x-access-token:', process.env['GITHUB_TOKEN'].trim(), '@');
        }
        else if (!dryRun) {
            core.setFailed('You have to provide a GITHUB_TOKEN or GH_PAT');
            return;
        }
        remoteURL = remoteURL.concat(domain, '/', repo, '.git');
        core.debug(`remoteURL=${remoteURL}`);
    
        const remoteBranchExists: boolean = await git.remoteBranchExists(remoteURL, targetBranch);
        core.debug(`remoteBranchExists=${remoteBranchExists}`);
        const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'commited-files'));
        core.debug(`tmpdir=${tmpdir}`);
        const currentdir = path.resolve('.');
        core.debug(`currentdir=${currentdir}`);
    
        process.chdir(tmpdir);
        
        if (keepHistory && remoteBranchExists) {
            core.startGroup(`Cloning ${repo}`);
            await git.clone(remoteURL, targetBranch, '.');
            core.endGroup();
        }
        else {
            core.startGroup(`Initializing local git repo`);
            await git.init('.');
            await git.checkout(targetBranch);
            core.endGroup();
        }

        if (ignore) {
            core.startGroup('Creating .gitignore');
            await writeFile('.gitignore', '.gitignore' + '\n' + ignore);
            core.endGroup();
        }
        
        let copyCount = 0;
        await core.group(`Copying ${path.join(currentdir, buildDir)} to ${tmpdir}`, async () => {
            const sourcePath = absoluteBuildDir ? buildDir : path.join(currentdir, buildDir);
            await copy(sourcePath, tmpdir, {
                filter: (src, dest) => {
                    if (fs.lstatSync(src).isDirectory()) {
                        return true;
                    }
                    let isMatch = false;
                    for (const wildcard of file_wildcards)
                    {
                        let regex = wildcard.replace('*', '\\w+')
                        if ((new RegExp('\\/' + regex)).test(src))
                        {
                            isMatch = true;
                            break;
                        }
                    }
                    if (!isMatch)
                    {
                        return false;
                    }
                    if (verbose) {
                        core.info(`${src} => ${dest}`);
                    }
                    else {
                        if (copyCount > 1 && copyCount % 80 === 0) {
                        process.stdout.write('\n');
                        }
                        process.stdout.write('.');
                        copyCount++;
                    }
                    return true;
                    },
                dereference: followSymlinks
            }).catch(error => {
                core.error(error);
            });
            core.info(`[${file_wildcards.join(", ")}] used to filter files`)
            core.info(`${copyCount} file(s) copied.`);
        });

        const isDirty: boolean = await git.isDirty();
        core.debug(`isDirty=${isDirty}`);
        if (keepHistory && remoteBranchExists && !isDirty) {
            core.info('No changes to commit');
            return;
        }

        const committerPrs: addressparser.Address = addressparser(committer)[0];
        core.startGroup(`Configuring git committer`);
        await git.setConfig('user.name', committerPrs.name);
        await git.setConfig('user.email', committerPrs.address);
        core.endGroup();

        if (!(await git.hasChanges())) {
            core.info('Nothing to deploy');
            return;
          }
      
        core.startGroup(`Updating index of working tree`);
        for (var wildcard of file_wildcards) {
            await git.add(wildcard, verbose);
        }
        core.endGroup();

        const authorPrs: addressparser.Address = addressparser(author)[0];
        await core.group(`Committing changes`, async () => {
            await git.commit(allowEmptyCommit, `${authorPrs.name} <${authorPrs.address}>`, commitMessage);
            await git.showStat().then(output => {
                core.info(output);
            });
        });

        if (!dryRun) {
            core.startGroup(`Pushing ${buildDir} directory to ${targetBranch} branch on ${repo} repo`);
            if (!keepHistory) {
              core.debug(`Force push`);
            }
            await git.push(remoteURL, targetBranch, !keepHistory);
            core.endGroup();
            core.info(`Content of ${buildDir} has been pushed to ${targetBranch}!`);
        }
        else {
            core.warning(`Push disabled (dry run)`);
        }
      
          process.chdir(currentdir);
    }
    catch (error) {
        core.setFailed(error.message);
    }
}


run();