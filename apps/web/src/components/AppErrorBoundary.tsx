// apps/web/src/components/AppErrorBoundary.tsx
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application render failed', error, errorInfo)
  }

  private retry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return <main className="grid min-h-dvh place-items-center bg-slate-50 p-4 text-slate-900">
      <section className="w-full max-w-md border border-slate-200 bg-white p-6 shadow-sm">
        <AlertTriangle aria-hidden="true" className="size-7 text-amber-600" />
        <h1 className="mt-4 text-xl font-semibold">页面暂时无法加载</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">刚才的页面出现异常，当前数据没有丢失。请重试或返回仪表盘继续工作。</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={this.retry} type="button"><RotateCcw aria-hidden="true" />重新加载</Button>
          <Button asChild type="button" variant="outline"><a href="/dashboard"><Home aria-hidden="true" />返回仪表盘</a></Button>
        </div>
        {import.meta.env.DEV && <pre className="mt-5 overflow-auto border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">{this.state.error.message}</pre>}
      </section>
    </main>
  }
}
