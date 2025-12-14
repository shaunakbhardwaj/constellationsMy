import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Renderer] Uncaught error:', error)
    console.error(info)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="lonely-page">
        <div className="panel-stack">
          <div className="drop-box state-error" role="alert">
            <div className="box-title">Something went wrong</div>
            <div className="box-status">The app hit an unexpected error.</div>
            {this.state.error ? <div className="box-message">{this.state.error.message}</div> : null}
            <button type="button" className="view-data-button" onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

