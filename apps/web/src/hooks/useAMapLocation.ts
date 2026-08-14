// apps/web/src/hooks/useAMapLocation.ts
import AMapLoader from '@amap/amap-jsapi-loader'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

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

interface PublicConfigResponse {
  configs: Record<string, string>
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

const MAP_CONFIG_ERROR = '系统未配置地图密钥，无法获取定位'
let amapPromise: Promise<AMapInstance> | null = null
let amapConfigFingerprint: string | null = null

function loadAMap(key: string, securityJsCode: string) {
  const fingerprint = `${key}:${securityJsCode}`
  if (!amapPromise || amapConfigFingerprint !== fingerprint) {
    window._AMapSecurityConfig = { securityJsCode }
    amapConfigFingerprint = fingerprint
    amapPromise = AMapLoader.load({
      key,
      version: '2.0',
      plugins: ['AMap.Geolocation'],
    }) as Promise<AMapInstance>
  }

  return amapPromise
}

export function useAMapLocation() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configQuery = useQuery({
    queryKey: ['public-configs'],
    queryFn: () => apiFetch<PublicConfigResponse>('/api/configs/public'),
  })
  const amapKey = configQuery.data?.configs.amap_key?.trim() ?? ''
  const securityJsCode = configQuery.data?.configs.amap_security_code?.trim() ?? ''
  const isConfigured = Boolean(amapKey && securityJsCode)

  useEffect(() => {
    if (configQuery.isLoading || configQuery.isError) return
    if (!isConfigured) {
      setError(MAP_CONFIG_ERROR)
      return
    }

    setIsLoading(true)
    void loadAMap(amapKey, securityJsCode)
      .then(() => setError(null))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : '高德地图加载失败')
      })
      .finally(() => setIsLoading(false))
  }, [amapKey, configQuery.isError, configQuery.isLoading, isConfigured, securityJsCode])

  const getLocation = useCallback(async (): Promise<LocationResult> => {
    setIsLoading(true)
    setError(null)

    try {
      if (configQuery.isLoading) {
        throw new Error('正在加载地图配置，请稍后重试')
      }
      if (configQuery.isError) {
        throw new Error('地图配置加载失败，请稍后重试')
      }
      if (!isConfigured) {
        throw new Error(MAP_CONFIG_ERROR)
      }

      const AMap = await loadAMap(amapKey, securityJsCode)
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
  }, [amapKey, configQuery.isError, configQuery.isLoading, isConfigured, securityJsCode])

  return {
    getLocation,
    isLoading,
    isConfigLoading: configQuery.isLoading,
    isConfigured,
    error: error ?? (configQuery.error instanceof Error ? configQuery.error.message : null),
  }
}
