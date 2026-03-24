"use client"

import { signIn } from "next-auth/react"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-xl shadow-sm border border-gray-200 w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">DocHub</h1>
          <p className="text-sm text-gray-500 mt-1">PCC2K Documentation Platform</p>
        </div>
        <button
          onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
          className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}
