/**
 * Cosmic Journey & Twin Paradox mission calculator.
 *
 * Uses natural relativistic units where c = 1 light-year per year:
 *   - Distance d in light-years (ly)
 *   - Stationary observer (Earth) time Δt in years
 *   - Moving traveler (Ship) proper time Δt' in years
 */

import { clampBeta, lorentzGamma } from './physics'

export type JourneyMode = 'shipTime' | 'earthTime' | 'distance'
export type DurationUnit = 'hours' | 'days' | 'years'

export interface JourneyInput {
  mode: JourneyMode
  value: number
  unit: DurationUnit
  beta: number
}

export interface JourneyResult {
  shipYears: number
  earthYears: number
  diffYears: number
  distanceLy: number
  gamma: number
}

export interface CosmicDestination {
  name: string
  ly: number
  label: string
}

export const DESTINATIONS: CosmicDestination[] = [
  { name: 'Alpha Centauri', ly: 4.37, label: 'Alpha Centauri (4.37 ly)' },
  { name: 'Sirius', ly: 8.6, label: 'Sirius (8.6 ly)' },
  { name: 'TRAPPIST-1', ly: 39.5, label: 'TRAPPIST-1 (39.5 ly)' },
  { name: 'Galactic Center', ly: 26_000, label: 'Galactic Center (26k ly)' },
  { name: 'Andromeda', ly: 2_537_000, label: 'Andromeda (2.54M ly)' },
]

export function unitToYears(unit: DurationUnit): number {
  if (unit === 'hours') return 1 / (365.25 * 24)
  if (unit === 'days') return 1 / 365.25
  return 1
}

export function solveJourney(input: JourneyInput): JourneyResult {
  const beta = clampBeta(input.beta)
  const gamma = lorentzGamma(beta)
  const rawVal = Math.max(0, Number.isFinite(input.value) ? input.value : 0)
  const toYears = unitToYears(input.unit)

  let shipYears = 0
  let earthYears = 0
  let distanceLy = 0

  if (input.mode === 'shipTime') {
    shipYears = rawVal * toYears
    earthYears = shipYears * gamma
    distanceLy = earthYears * beta
  } else if (input.mode === 'earthTime') {
    earthYears = rawVal * toYears
    shipYears = earthYears / gamma
    distanceLy = earthYears * beta
  } else {
    distanceLy = rawVal
    if (beta > 1e-7) {
      earthYears = distanceLy / beta
      shipYears = earthYears / gamma
    } else {
      earthYears = distanceLy === 0 ? 0 : Infinity
      shipYears = distanceLy === 0 ? 0 : Infinity
    }
  }

  const diffYears =
    Number.isFinite(earthYears) && Number.isFinite(shipYears)
      ? earthYears - shipYears
      : Infinity

  return { shipYears, earthYears, diffYears, distanceLy, gamma }
}

export function formatHumanDuration(years: number): string {
  if (!Number.isFinite(years) || years < 0) return '∞'
  if (years >= 1e6) return `${(years / 1e6).toFixed(2)}M yrs`
  if (years >= 1000) return `${Math.round(years).toLocaleString('en-US')} yrs`
  if (years >= 1) return `${years.toFixed(2)} yrs`
  const days = years * 365.25
  if (days >= 1) return `${days.toFixed(1)} days`
  const hours = days * 24
  if (hours >= 1) return `${hours.toFixed(1)} hrs`
  const mins = hours * 60
  return `${mins.toFixed(1)} min`
}

export function formatDistanceLy(ly: number): string {
  if (!Number.isFinite(ly) || ly < 0) return '∞ ly'
  if (ly >= 1e6) return `${(ly / 1e6).toFixed(2)}M ly`
  if (ly >= 1000) return `${Math.round(ly).toLocaleString('en-US')} ly`
  return `${ly.toFixed(2)} ly`
}

