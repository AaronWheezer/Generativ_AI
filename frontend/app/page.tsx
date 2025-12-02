import { PoliceChatbot } from "@/components/police-chatbot"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Top-right admin link */}
      <div className="absolute top-4 right-4 z-20">
        <a
          href="/admin"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all text-sm"
        >
          Admin Dashboard
        </a>
      </div>
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary/30 rounded-full" />
        <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-primary/20 rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-2.5 h-2.5 bg-primary/25 rounded-full" />
      </div>

      <PoliceChatbot />

      {/* Footer */}
      <p className="mt-6 text-sm text-muted-foreground">Federale Politie België</p>
    </main>
  )
}
