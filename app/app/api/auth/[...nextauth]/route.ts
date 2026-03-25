import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

const handler = NextAuth({
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
})

export { handler as GET, handler as POST }
