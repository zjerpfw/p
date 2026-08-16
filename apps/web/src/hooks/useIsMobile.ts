// apps/web/src/hooks/useIsMobile.ts
import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 768px)'

function getInitialValue() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getInitialValue)

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY)
    const updateValue = (event: MediaQueryListEvent) => setIsMobile(event.matches)

    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateValue)
    return () => mediaQuery.removeEventListener('change', updateValue)
  }, [])

  return isMobile
}
