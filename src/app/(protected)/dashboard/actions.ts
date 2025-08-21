'use server'
import { generateEmbedding } from '@/lib/gemini'
import { generateTextFromPrompt } from '@/lib/gemini'
import { db } from '@/server/db'

// lightweight polyfill for `createStreamableValue()` used previously.
// It exposes { value: ReadableStream<string>, update(text), done() }.
function createStreamableValue() {
    const ts = new TransformStream<string, string>();
    const writer = ts.writable.getWriter();
    return {
        value: ts.readable,
        async update(chunk: string) {
            try {
                // ensure chunk is string
                await writer.ready;
                await writer.write(String(chunk));
            } catch (e) {
                // ignore write errors during shutdown
                console.error('[createStreamableValue] write error', e);
            }
        },
        async done() {
            try { await writer.close(); } catch (e) { /* ignore */ }
        }
    };
}

export async function askQuestion(question: string, projectId: string) {
    const stream = createStreamableValue()

    const queryVector = await generateEmbedding(question)
    const vectorQuery = `[${queryVector.join(',')}]`
    // try to fetch the project's githubUrl for context and include fallback behavior
    const project = await db.project.findUnique({ where: { id: projectId }, select: { githubUrl: true } })

    let result = await db.$queryRaw`
    SELECT "fileName", "sourceCode", "summary",
    1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) AS similarity
    FROM "SourceCodeEmbedding"
    WHERE 1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) > .5
    AND "projectId" = ${projectId}
    ORDER BY similarity DESC
    LIMIT 10
    ` as { fileName: string; sourceCode: string; summary: string }[]

    // fallback: if no good matches, return top 10 files for the project (relaxed)
    if (!result || result.length === 0) {
        result = await db.$queryRaw`
        SELECT "fileName", "sourceCode", "summary",
        1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) AS similarity
        FROM "SourceCodeEmbedding"
        WHERE "projectId" = ${projectId}
        ORDER BY similarity DESC
        LIMIT 10
        ` as { fileName: string; sourceCode: string; summary: string }[]
    }

    // If still nothing, return documentation and manifest files (README, package.json, pyproject, requirements)
    if (!result || result.length === 0) {
        const docs = await db.$queryRaw`
        SELECT "fileName", "sourceCode", "summary"
        FROM "SourceCodeEmbedding"
        WHERE "projectId" = ${projectId}
        AND (
            lower("fileName") LIKE 'readme%'
            OR lower("fileName") LIKE '%package.json'
            OR lower("fileName") LIKE '%pyproject%'
            OR lower("fileName") LIKE '%requirements.txt'
            OR lower("fileName") LIKE 'setup.py'
        )
        LIMIT 10
        ` as { fileName: string; sourceCode: string; summary: string }[]

        if (docs && docs.length > 0) {
            result = docs
        }
    }

    let context = ''

    for (const doc of result) {
        context += `source: ${doc.fileName}\ncode content: ${doc.sourceCode}\nsummary: ${doc.summary}\n\n`
    }

    (async () => {
    const prompt = `
You are an **AI Code Assistant** whose role is to help interns and junior developers understand and navigate a software codebase.

Repository: ${project?.githubUrl ?? 'unknown'}

START CONTEXT BLOCK
${context}
END OF CONTEXT BLOCK

START QUESTION
${question}
END QUESTION
`

    const text = await generateTextFromPrompt(prompt)

    // send the full response as a single update (keeps the same stream API for the client)
    await stream.update(text)
    await stream.done()
    })()

    return {
        output: stream.value,
        fileReferences: result,
        projectGithubUrl: project?.githubUrl ?? null,
    }
}