"use client"

import { useState } from "react"
import { Shield, FileText, MessageCircle, ArrowLeft, Bot, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChatInterface } from "@/components/chat-interface"

type ChatMode = "select" | "pv" | "vraag"

export function PoliceChatbot() {
  const [mode, setMode] = useState<ChatMode>("select")

  const handleBack = () => {
    setMode("select")
  }

  return (
    <Card className="w-full max-w-2xl shadow-2xl border-border/50 overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />

      {/* Header - enhanced with gradient background */}
      <div className="flex items-center gap-3 p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        {mode !== "select" && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0 hover:bg-primary/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary shadow-lg">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-card flex items-center justify-center">
              <Bot className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="font-semibold text-lg text-foreground">Politie Assistent</h1>
            <p className="text-sm text-muted-foreground">Belgische Federale Politie</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {mode === "select" ? (
          <div className="space-y-8">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Online
              </div>
              <h2 className="text-2xl font-semibold text-foreground">Hoe kan ik u helpen?</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Kies hieronder een optie om te beginnen. Ik sta klaar om u te assisteren.
              </p>
            </div>

            <div className="grid gap-4">
              <button
                className="group relative h-auto p-6 flex items-center gap-5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all duration-200 hover:shadow-lg text-left"
                onClick={() => setMode("pv")}
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shrink-0 group-hover:from-primary/30 group-hover:to-primary/20 transition-colors">
                  <FileText className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">PV Opstellen</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Stel een proces-verbaal op met stapsgewijze begeleiding
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>

              <button
                className="group relative h-auto p-6 flex items-center gap-5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all duration-200 hover:shadow-lg text-left"
                onClick={() => setMode("vraag")}
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shrink-0 group-hover:from-primary/30 group-hover:to-primary/20 transition-colors">
                  <MessageCircle className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">Stel een vraag</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vragen over verkeersregels, wetgeving en procedures
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                24/7 Beschikbaar
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Veilige verbinding
              </span>
            </div>
          </div>
        ) : (
          <ChatInterface mode={mode} />
        )}
      </div>
    </Card>
  )
}
