export interface PVRecord {
  id: string
  name: string
  description: string
  location: string
  municipality: string
  datetime: string
  suspectKnown: boolean
  zoneLabel: string
  email: string
  phone: string
  confirmed: boolean
  createdAt: Date
}
