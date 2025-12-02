"use client"

import type React from "react"

import { useState } from "react"
import type { PVRecord } from "@/lib/types"
import { X, Save, User, Mail, Phone, MapPin, FileText, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

interface PVEditModalProps {
  pv: PVRecord
  onClose: () => void
  onSave: (pv: PVRecord) => void
}

export function PVEditModal({ pv, onClose, onSave }: PVEditModalProps) {
  const [formData, setFormData] = useState<PVRecord>(pv)

  const handleChange = (field: keyof PVRecord, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div>
            <h2 className="font-semibold text-lg text-foreground">PV Bewerken</h2>
            <p className="text-sm text-muted-foreground">{pv.id}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Personal Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Persoonlijke gegevens
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Naam
                </Label>
                <Input id="name" value={formData.name} onChange={(e) => handleChange("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Telefoon
                </Label>
                <Input id="phone" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Location Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Locatie & Tijd</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Locatie
                </Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleChange("location", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="municipality">Gemeente</Label>
                <Input
                  id="municipality"
                  value={formData.municipality}
                  onChange={(e) => handleChange("municipality", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="datetime" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Datum & Tijd
                </Label>
                <Input
                  id="datetime"
                  type="datetime-local"
                  value={formData.datetime}
                  onChange={(e) => handleChange("datetime", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zoneLabel">Zone</Label>
                <Input
                  id="zoneLabel"
                  value={formData.zoneLabel}
                  onChange={(e) => handleChange("zoneLabel", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Beschrijving</h3>
            <div className="space-y-2">
              <Label htmlFor="description" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Omschrijving
              </Label>
              <Textarea
                id="description"
                rows={4}
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status</h3>
            <div className="flex items-center justify-between p-4 bg-accent/50 rounded-xl">
              <div>
                <p className="font-medium text-foreground">Verdachte bekend</p>
                <p className="text-sm text-muted-foreground">Is de verdachte geïdentificeerd?</p>
              </div>
              <Switch
                checked={formData.suspectKnown}
                onCheckedChange={(checked) => handleChange("suspectKnown", checked)}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-accent/50 rounded-xl">
              <div>
                <p className="font-medium text-foreground">Bevestigd</p>
                <p className="text-sm text-muted-foreground">Is dit PV bevestigd en afgerond?</p>
              </div>
              <Switch checked={formData.confirmed} onCheckedChange={(checked) => handleChange("confirmed", checked)} />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border bg-accent/30">
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={handleSubmit} className="gap-2">
            <Save className="h-4 w-4" />
            Opslaan
          </Button>
        </div>
      </div>
    </div>
  )
}
