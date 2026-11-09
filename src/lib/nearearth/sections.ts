export type SectionId = 'past' | 'now' | 'future'

export function scrollToSection(id: SectionId) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}
