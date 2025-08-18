"use client"
import { useUser } from '@clerk/nextjs';
import React from 'react'

export default function DashboardPage() {
  const { user } = useUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>Welcome, {user?.firstName}!</p>
    </div>
  )
}
