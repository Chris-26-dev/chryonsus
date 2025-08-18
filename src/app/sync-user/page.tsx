import { db } from '@/server/db';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import React from 'react';


const SyncUser = async () => {
    const { userId } = await auth();

    if (!userId) {
        return <div>Please sign in to sync your user data.</div>;
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    if (!user.emailAddresses[0]?.emailAddress) {
        return notFound();
    }

    // upsert - if the user exist update if not create a new user
    // eslint-disable-next-line
    await db.user.upsert({
        where: {
            emailAddress: user.emailAddresses[0]?.emailAddress ?? "",
        },
        update: {
            imageUrl: user.imageUrl,
            firstName: user.firstName,
            lastName: user.lastName,
        },
        create: {
            id: userId,
            emailAddress: user.emailAddresses[0]?.emailAddress ?? "",
            imageUrl: user.imageUrl,
            firstName: user.firstName,
            lastName: user.lastName,
        },
    })
    return redirect('/dashboard');
};

export default SyncUser;