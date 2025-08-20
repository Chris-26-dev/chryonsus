import { db } from '@/server/db';
import { Octokit } from 'octokit';
import axios from 'axios';
import { aiSummariseCommits } from './gemini';

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const githubUrl = 'https://github.com/chris-26-dev/chryonsus';

type Response = {
    commitMessage:      string;
    commitHash:         string;
    commitAuthorName:  string;
    commitAuthorAvatar: string;
    commitDate:        string;
}

export const getCommitHashes = async (githubUrl: string): Promise<Response[]> => {
    const [owner, repo] = githubUrl.split('/').slice(-2);
    if (!owner || !repo) {
        throw new Error(`Invalid GitHub URL: ${githubUrl}`);
    }

    const { data } = await octokit.rest.repos.listCommits({
        owner,
        repo,
    });

    const sortedCommits = data.sort((a: any, b: any) => new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime());

    // Filter out merge commits (created when a PR is merged). Merge commits typically have
    // more than one parent or a commit message that starts with "Merge pull request".
    const nonMerge = sortedCommits.filter((commit: any) => {
        const parentCount = Array.isArray(commit.parents) ? commit.parents.length : 0;
        const message = String(commit.commit?.message ?? '');
        if (parentCount > 1) return false;
        if (message.startsWith('Merge pull request')) return false;
        return true;
    });

    // return the latest 10 commits but in chronological order (oldest -> newest)
    const latestChronological = nonMerge.slice(0, 10).reverse();
    return latestChronological.map((commit: any) => ({
        commitMessage:      commit.commit.message ?? "",
        commitHash:         commit.sha as string,
        commitAuthorName:  commit.commit?.author?.name ?? "",
        commitAuthorAvatar: commit.author?.avatar_url ?? "",
        commitDate:        commit.commit?.author?.date ?? "",
    }));
};

export const pollCommits = async (projectId: string) => {
    const { project, githubUrl } = await fetchProjectGithubUrl(projectId);
    const commitHashes = await getCommitHashes(githubUrl);
    const unprocessedCommits = await filterUnprocessedCommits(projectId, commitHashes);
    const summaryResponses = await Promise.allSettled(unprocessedCommits.map(commit => {
        return summariseCommits(githubUrl, commit.commitHash);
    }));
    const summaries = summaryResponses.map((response) => {
        if (response.status === 'fulfilled') {
            return response.value as string;
        }
        return "";
    });


    const commits = await db.commit.createMany({
        data: summaries.map((summary, index) => {
            const fallback = !summary || summary.trim() === '' ? (unprocessedCommits[index]?.commitMessage ?? '') : summary;
            if (!summary || summary.trim() === '') {
                console.debug('[pollCommits] ai summary empty — falling back to commit message', { projectId, commitHash: unprocessedCommits[index]?.commitHash });
            }

            return {
                projectId: projectId,
                commitHash: unprocessedCommits[index]!.commitHash,
                commitMessage: unprocessedCommits[index]!.commitMessage,
                commitAuthorName: unprocessedCommits[index]!.commitAuthorName,
                commitAuthorAvatar: unprocessedCommits[index]!.commitAuthorAvatar,
                commitDate: unprocessedCommits[index]!.commitDate,
                summary: fallback,
            }
        }),
    });

    
    return commits;
};

async function summariseCommits(githubUrl: string, commitHash: string) {
    const {data} = await axios.get(`${githubUrl}/commit/${commitHash}.diff`, {
        headers: {
            Accept: 'application/vnd.github.v3.diff'
        }
    });

    return await aiSummariseCommits(data) || "";
}

async function fetchProjectGithubUrl(projectId: string) {
    const project = await db.project.findUnique({
        where: { id: projectId },
        select: { githubUrl: true },
    });
    if (!project?.githubUrl) {
        throw new Error(`Project with ID ${projectId} not found`);
    }
    return {
        project,
        githubUrl: project?.githubUrl,
    };
}

async function filterUnprocessedCommits(projectId: string, commitHashes: Response[]) {
    const processedCommits = await db.commit.findMany({
        where: { projectId }
    });
    const unprocessedCommits = commitHashes.filter(commit => !processedCommits.some(pc => pc.commitHash === commit.commitHash));
    return unprocessedCommits;
}