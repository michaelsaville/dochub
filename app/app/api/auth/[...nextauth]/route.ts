import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

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
      console.log("SIGNIN ATTEMPT:", user.email)
      if (!user.email) return false
      try {
        const allowed = await prisma.staffUser.findUnique({
          where: { email: user.email },
        })
        console.log("STAFFUSER RESULT:", JSON.stringify(allowed))
        return !!allowed
      } catch (e) {
        console.error("STAFFUSER ERROR:", String(e))
        return false
      }
    },
    async session({ session, user }) {
      if (session.user) {
        try {
          const staffUser = await prisma.staffUser.findUnique({
            where: { email: session.user.email! },
          })
          if (staffUser) {
            session.user.id = staffUser.id
          }
        } catch (e) {
          console.error("SESSION ERROR:", String(e))
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
