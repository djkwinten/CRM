export type PhotoConsentState = 'allowed' | 'denied' | 'unknown'

export type PhotoConsentPolicy = {
  state: PhotoConsentState
  dashboardLabel: string
  gigTitle: string
  gigText: string
}

export function getPhotoConsentPolicy(value: unknown): PhotoConsentPolicy {
  if (value === 1 || value === '1') {
    return {
      state: 'allowed',
      dashboardLabel: 'Beeld toegestaan',
      gigTitle: "FOTO'S & VIDEO'S TOEGESTAAN",
      gigText: 'De klant heeft hiervoor toestemming gegeven in de vragenlijst.',
    }
  }

  if (value === 0 || value === '0') {
    return {
      state: 'denied',
      dashboardLabel: 'Geen beeld',
      gigTitle: "GEEN FOTO'S OF VIDEO'S",
      gigText: "De klant geeft geen toestemming: niets filmen of fotograferen.",
    }
  }

  return {
    state: 'unknown',
    dashboardLabel: 'Geen keuze',
    gigTitle: 'FOTO- & VIDEOTOESTEMMING NIET INGEVULD',
    gigText: "Vraag eerst uitdrukkelijk toestemming; tot dan geen foto's of video's maken.",
  }
}
