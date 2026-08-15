// apps/web/src/pages/LoginPage.tsx
import { LockKeyhole, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch, getAccessToken, setAccessToken } from '@/lib/api'

interface LoginResponse {
  token: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (getAccessToken()) {
    return <Navigate replace to="/" />
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin_code: pinCode }),
      })
      setAccessToken(response.token)
      navigate('/deals', { replace: true })
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 p-5 text-foreground">
      <Card className="w-full max-w-sm border-border shadow-sm">
        <CardHeader className="items-center pb-3 text-center">
          <div className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <LockKeyhole aria-hidden="true" className="size-6" />
          </div>
          <CardTitle className="mt-4 text-xl">客户关系管理工作台</CardTitle>
          <CardDescription>使用内部用户名和登录口令进入系统</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <div className="relative">
                <UserRound aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input autoComplete="username" autoFocus className="pl-9" id="username" onChange={(event) => setUsername(event.target.value)} required value={username} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin-code">登录口令</Label>
              <Input autoComplete="current-password" id="pin-code" inputMode="numeric" onChange={(event) => setPinCode(event.target.value)} required type="password" value={pinCode} />
            </div>
            {error && <p aria-live="polite" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={isSubmitting || !username || !pinCode} type="submit">
              {isSubmitting ? '正在登录' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
