"use client"

import type { PVRecord } from "@/lib/types"
import { FileText, MapPin, Calendar, ChevronRight, CheckCircle, Clock, Trash2, Check } from "lucide-react"

interface PVListProps {
  records: PVRecord[]
  onSelect: (pv: PVRecord) => void
  onDelete?: (pvId: number) => void
  onComplete?: (pvId: number) => void
}

export function PVList({ records, onSelect, onDelete, onComplete }: PVListProps) {
  return (
    <div className="space-y-3">
      {records.map((pv) => (
        <div
          key={pv.id}
          className="w-full group bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer"
          onClick={() => onSelect(pv)}
        >
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-semibold text-foreground">{pv.name}</h3>
                {pv.confirmed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                    <CheckCircle className="h-3 w-3" />
                    Afgerond
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                    <Clock className="h-3 w-3" />
                    In behandeling
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground line-clamp-1 mb-3">{pv.description}</p>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {pv.municipality}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(pv.datetime).toLocaleDateString("nl-BE")}
                </span>
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">{pv.zoneLabel}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Complete button - only show if not confirmed yet */}
              {!pv.confirmed && onComplete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onComplete(pv.id)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors"
                  title="Markeer als afgerond"
                >
                  <Check className="h-3 w-3" />
                  Afronden
                </button>
              )}
              
              {/* Delete button */}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(pv.id)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
                  title="PV verwijderen"
                >
                  <Trash2 className="h-3 w-3" />
                  Verwijderen
                </button>
              )}
              
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
