import type { NextAuthOptions } from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { prisma } from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      try {
        const allowed = await prisma.staffUser.findUnique({
          where: { email: user.email },
        })
        return !!allowed
      } catch (e) {
        return false
      }
    },
    async jwt({ token, user }) {
      if (user?.email) {
        try {
          const staffUser = await prisma.staffUser.findUnique({
            where: { email: user.email },
          })
          if (staffUser) {
            token.id = staffUser.id
            token.role = staffUser.role
          }
        } catch (e) {
          console.error("JWT ERROR:", String(e))
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
}
