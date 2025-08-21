'use client'
import React from "react"
import useProject from "@/hooks/use-project"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog"
import Image from "next/image"
import { askQuestion } from "./actions"
import MDEditor from "@uiw/react-md-editor"

// local helper to read a ReadableStream<string|Uint8Array> returned from a server action
async function* readStreamableValue(stream: ReadableStream<any> | null | undefined) {
    if (!stream) return
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value == null) continue
            if (typeof value === 'string') {
                yield value
            } else if (value instanceof Uint8Array) {
                yield decoder.decode(value)
            } else if (ArrayBuffer.isView(value)) {
                yield decoder.decode(value as Uint8Array)
            } else if (value instanceof ArrayBuffer) {
                yield decoder.decode(new Uint8Array(value))
            } else {
                // fallback
                yield String(value)
            }
        }
    } finally {
        try { reader.releaseLock() } catch (e) { /* ignore */ }
    }
}


const AskQuestionCard = () => {
    const { project } = useProject();
    const [question, setQuestion] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [fileReferences, setFileReferences] = React.useState<{ fileName: string; sourceCode: string; summary: string }[]>([]);
    const [projectGithubUrl, setProjectGithubUrl] = React.useState<string | null>(null)
    const [answer, setAnswer] = React.useState("");

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!project?.id) return
        // reset previous answer and references
        setAnswer("")
        setFileReferences([])
        setLoading(true);
        setOpen(true);

        try {
            const { output, fileReferences, projectGithubUrl } = await askQuestion(question, project.id) as any;
            setProjectGithubUrl(projectGithubUrl ?? null)
            setFileReferences(fileReferences ?? []);

            for await (const delta of readStreamableValue(output)) {
                if (delta) {
                    setAnswer(ans => ans + delta);
                }
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[60vw]">
                    <DialogHeader>
                        <DialogTitle>
                            <Image src='/chlogo.png' alt='Chryonsus Logo' width={40} height={40} />
                        </DialogTitle>
                    </DialogHeader>

                    {/* styled markdown container: force light background and scoped overrides */}
                    <div className="max-w-[70vw] max-h-[40vh] w-full overflow-auto p-4 bg-white rounded-md border border-slate-200 shadow-sm markdown-body-container">
                        <MDEditor.Markdown
                            source={answer}
                            className="markdown-body"
                        />
                    </div>

                    <h1>Files References</h1>
                    {projectGithubUrl && (
                        <div className="mb-2">
                            <a href={projectGithubUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">Open repository</a>
                        </div>
                    )}
                    {fileReferences.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No file references found.</p>
                    ) : (
                        fileReferences.map((file, idx) => (
                            <div key={file.fileName ?? idx} className="mb-2">
                                <strong>{file.fileName}</strong>
                                <div className="text-sm whitespace-pre-wrap">{file.summary}</div>
                            </div>
                        ))
                    )}
                </DialogContent>
            </Dialog>

            <Card className="relative col-span-3">
                <CardHeader>
                    <CardTitle>Ask a Question</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit}>
                        <Textarea placeholder="what file do i need to edit for dashboard?" value={question} onChange={(e) => setQuestion(e.target.value)} />
                        <div className="h-4"></div>
                        <Button type="submit" disabled={loading}>
                            Ask Chryonsus!
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </>
    )
}

export default AskQuestionCard