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
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      console.log("SIGNIN ATTEMPT:", user.email)
      try {
        const allowed = await prisma.staffUser.findUnique({
          where: { email: user.email },
        })
        console.log("STAFFUSER LOOKUP:", JSON.stringify(allowed))
        return https://github.com/michaelsaville/dochub/blob/master/app/app/api/auth/%5B...nextauth%5D/route.tsallowed
      } catch (e) {
        console.error("STAFFUSER ERROR:", e)
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
          console.error("SESSION ERROR:", e)
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
