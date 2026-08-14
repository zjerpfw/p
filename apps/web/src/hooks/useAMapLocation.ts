// apps/web/src/hooks/useAMapLocation.ts
import AMapLoader from '@amap/amap-jsapi-loader'
import { useCallback, useEffect, useState } from 'react'

interface AMapPosition {
  lng: number
  lat: number
}

interface AMapGeolocationResult {
  position: AMapPosition
  formattedAddress?: string
}

interface AMapGeolocationPlugin {
  getCurrentPosition(callback: (status: string, result: AMapGeolocationResult) => void): void
}

interface AMapInstance {
  plugin(plugin: string | string[], callback: () => void): void
  Geolocation: new (options: Record<string, unknown>) => AMapGeolocationPlugin
}

interface LocationResult {
  lng: number
  lat: number
  formattedAddress: string
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

let amapPromise: Promise<AMapInstance> | null = null

function loadAMap() {
  if (!amapPromise) {
    const key = import.meta.env.VITE_AMAP_KEY
    const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE

    if (!key || !securityJsCode) {
      return Promise.reject(new Error('请配置高德地图 VITE_AMAP_KEY 和 VITE_AMAP_SECURITY_CODE'))
    }

    window._AMapSecurityConfig = { securityJsCode }
    amapPromise = AMapLoader.load({
      key,
      version: '2.0',
      plugins: ['AMap.Geolocation'],
    }) as Promise<AMapInstance>
  }

  return amapPromise
}

export function useAMapLocation() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadAMap()
      .then(() => setError(null))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : '高德地图加载失败')
      })
      .finally(() => setIsLoading(false))
  }, [])

  const getLocation = useCallback(async (): Promise<LocationResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const AMap = await loadAMap()
      const result = await new Promise<AMapGeolocationResult>((resolve, reject) => {
        AMap.plugin('AMap.Geolocation', () => {
          const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            GeoLocationFirst: true,
            convert: true,
            needAddress: true,
          })
          geolocation.getCurrentPosition((status, positionResult) => {
            if (status === 'complete' && positionResult.position) {
              resolve(positionResult)
              return
            }
            reject(new Error('无法获取当前位置，请检查位置授权后重试'))
          })
        })
      })

      return {
        lng: result.position.lng,
        lat: result.position.lat,
        formattedAddress: result.formattedAddress ?? '已获取坐标，未解析到详细地址',
      }
    } catch (locationError) {
      const message = locationError instanceof Error ? locationError.message : '获取位置失败'
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { getLocation, isLoading, error }
}
