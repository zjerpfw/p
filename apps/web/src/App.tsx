// apps/web/src/App.tsx
import { useCustomers } from './hooks/useCustomers'
import { getAccessToken } from './lib/api'
import LoginPage from './pages/LoginPage'
import WeChatCallbackPage from './pages/WeChatCallbackPage'

function CustomersPage() {
  const { data, error, isLoading } = useCustomers()

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-emerald-700">Serverless CRM</p>
        <h1 className="mt-2 text-2xl font-semibold">客户</h1>
        {isLoading && <p className="mt-6 text-slate-600">正在加载客户数据...</p>}
        {error && <p className="mt-6 text-red-700">{error.message}</p>}
        {data && (
          <ul className="mt-6 divide-y border-y border-slate-200 bg-white">
            {data.customers.map((customer) => (
              <li className="flex items-center justify-between gap-4 p-4" key={customer.id}>
                <span className="font-medium">{customer.name}</span>
                <span className="text-sm text-slate-600">{customer.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default function App() {
  if (window.location.pathname === '/auth/wechat/callback') {
    return <WeChatCallbackPage />
  }

  if (window.location.pathname === '/login' || !getAccessToken()) {
    return <LoginPage />
  }

  return (
    <CustomersPage />
  )
}
