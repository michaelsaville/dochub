import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      const allowed = await prisma.staffUser.findUnique({
        where: { email: user.email },
      })
      return !!allowed
    },
    async session({ session, user }) {
      if (session.user) {
        const staffUser = await prisma.staffUser.findUnique({
          where: { email: session.user.email! },
        })
        if (staffUser) {
          session.user.id = staffUser.id
        }
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})

export { handler as GET, handler as POST }
