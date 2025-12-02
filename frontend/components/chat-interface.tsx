"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Send, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

type ChatInterfaceProps = {
  mode: "pv" | "vraag"
}

const initialMessages: Record<"pv" | "vraag", Message> = {
  pv: {
    id: "1",
    role: "assistant",
    content:
      "Welkom bij de PV assistent. Beschrijf in uw eerste antwoord zo volledig mogelijk wat er is gebeurd (wie, wat, waar, wanneer).",
  },
  vraag: {
    id: "1",
    role: "assistant",
    content: "Welkom! Ik kan u helpen met vragen over verkeersregels, wetgeving en procedures. Wat wilt u graag weten?",
  },
}

export function ChatInterface({ mode }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([initialMessages[mode]])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<string>(`sessie-${Date.now()}`)
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE as string) || "http://localhost:3000"

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  // Reset chat when switching mode (and refresh session for PV)
  useEffect(() => {
    setMessages([initialMessages[mode]])
    setInput("")
    setIsLoading(false)
    sessionRef.current = `sessie-${Date.now()}`
  }, [mode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const endpoint = mode === "pv" ? 
        `${API_BASE}/api/pv/chat` : 
        `${API_BASE}/api/rag/chat`

      const body = mode === "pv" ? 
        { sessionId: sessionRef.current, message: userMessage.content } : 
        { message: userMessage.content }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: typeof data?.response === "string" && data.response.trim().length > 0
          ? data.response
          : (mode === "pv"
            ? "Er ging iets mis bij het verwerken van uw PV. Probeer het opnieuw."
            : "Ik kon geen antwoord genereren. Probeer uw vraag te herformuleren."),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: mode === "pv"
          ? "Technische storing bij het opnemen van de aangifte. Probeert u later opnieuw."
          : "Technische storing bij het opzoeken van verkeersregels. Probeert u later opnieuw.",
      }
      setMessages((prev) => [...prev, assistantMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[450px]">
      {/* Messages with enhanced styling */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
                message.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md",
              )}
            >
              <p className="text-sm leading-relaxed">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 p-3 bg-muted/50 rounded-xl border border-border">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Typ uw bericht..."
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          className="rounded-lg shadow-md hover:shadow-lg transition-shadow"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
