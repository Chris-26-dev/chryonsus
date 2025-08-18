"use client"

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useRefetch from "@/hooks/use-refetch";
import { api } from "@/trpc/react";
import Image from "next/image";
import React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type FormInput = {
    repoUrl: string;
    projectName: string;
    githubToken?: string;
}

const CreatePage = () => {
    const { register, handleSubmit, reset } = useForm<FormInput>();
    const createProject = api.project.createProject.useMutation();
    const refetch = useRefetch();

    function onSubmit(data: FormInput) {
        createProject.mutate({
            name: data.projectName,
            githubUrl: data.repoUrl,
            githubToken: data.githubToken
        }, {
            onSuccess: () => {
                toast.success("Project created successfully!");
                refetch();
                reset();
            },
            onError: (error) => {
                toast.error("Error creating project: " + error.message);
            }
        });
        return true;
    }

    return (
        <div className="flex items-center gap-12 h-full justify-center">
            <Image src="/monitoring.png" alt="Logo" width={56} height={56} />
            <div>
                <div>
                    <h1 className="text-2xl font-semibold">
                        Link your Github Repository
                    </h1>
                    <p className="text-sm text-gray-500">
                        Please provide the URL of the Github repository you want to link.
                    </p>
                </div>
                <div className="h-4"></div>
                <div>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <Input
                            required
                            placeholder="Enter your Project Name"
                            {...register("projectName", { required: true })}
                        />
                        <div className="h-2"></div>
                        <Input
                            required
                            type="url"
                            placeholder="Enter your Github repository URL"
                            {...register("repoUrl", { required: true })}
                        />
                        <div className="h-2"></div>
                        <Input
                            placeholder="Enter your Github token (optional)"
                            {...register("githubToken")}
                        />
                        <div className="h-4"></div>
                        <Button type="submit" disabled={createProject.isPending}>
                            Create Project
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreatePage;