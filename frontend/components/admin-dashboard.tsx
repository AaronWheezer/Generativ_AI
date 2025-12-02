"use client"

import { useEffect, useState } from "react"
import type { PVRecord } from "@/lib/types"
import { PVList } from "@/components/pv-list"
import { PVEditModal } from "@/components/pv-edit-modal"
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE as string) || "http://localhost:3000"

export function AdminDashboard() {
  const [records, setRecords] = useState<PVRecord[]>([])
  const [selectedPV, setSelectedPV] = useState<PVRecord | null>(null)

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/dossiers`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const mapped: PVRecord[] = (data.records || []).map((r: any) => ({
          id: r.id,
          name: r.name || "-",
          description: r.description || "",
          municipality: r.location || "",
          datetime: r.datetime || new Date().toISOString(),
          zoneLabel: r.zoneLabel || "",
          confirmed: (r.status || "").toLowerCase() === "closed" || (r.status || "").toLowerCase() === "bevestigd",
          email: r.email || "",
          phone: r.phone || "",
          prioriteit: r.prioriteit || "MIDDEN",
          status: r.status || "open",
        }))
        setRecords(mapped)
      } catch (e) {
        console.error("Admin fetch error:", e)
      }
    }
    fetchRecords()
  }, [])

  const handleSelectPV = (pv: PVRecord) => {
    setSelectedPV(pv)
  }

  const handleCloseModal = () => {
    setSelectedPV(null)
  }

  const handleSavePV = async (updatedPV: PVRecord) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dossiers/${updatedPV.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updatedPV.name,
          email: updatedPV.email,
          phone: updatedPV.phone,
          location: updatedPV.municipality,
          datetime: updatedPV.datetime,
          description: updatedPV.description,
          prioriteit: updatedPV.prioriteit,
          zoneLabel: updatedPV.zoneLabel,
          status: updatedPV.status,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRecords((prev) => prev.map((pv) => (pv.id === updatedPV.id ? updatedPV : pv)))
    } catch (e) {
      console.error("Admin update error:", e)
    } finally {
      setSelectedPV(null)
    }
  }

  const stats = {
    total: records.length,
    confirmed: records.filter((r) => r.confirmed).length,
    pending: records.filter((r) => !r.confirmed).length,
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Totaal PV's</p>
          <p className="text-3xl font-semibold text-foreground mt-1">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Bevestigd</p>
          <p className="text-3xl font-semibold text-green-600 mt-1">{stats.confirmed}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">In behandeling</p>
          <p className="text-3xl font-semibold text-amber-600 mt-1">{stats.pending}</p>
        </div>
      </div>

      {/* Title */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">Proces-Verbalen</h2>
        <p className="text-sm text-muted-foreground mt-1">Klik op een PV om de gegevens aan te passen</p>
      </div>

      {/* PV List */}
      <PVList records={records} onSelect={handleSelectPV} />

      {/* Edit Modal */}
      {selectedPV && <PVEditModal pv={selectedPV} onClose={handleCloseModal} onSave={handleSavePV} />}
    </div>
  )
}
