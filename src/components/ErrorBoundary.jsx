import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false, error: null, showDetails: false })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg)] p-6">
          <div className="flex flex-col items-center gap-5 max-w-md w-full bg-[var(--surface)] rounded-[var(--r-lg)] p-8 border border-[var(--border)]">
            <div className="text-4xl select-none" aria-hidden="true">
              &#x26A0;
            </div>

            <h1 className="text-xl font-semibold text-[var(--text)] text-center m-0">
              Something went wrong
            </h1>

            <p className="text-sm text-[var(--text-dim)] text-center m-0">
              An unexpected error occurred. You can try reloading the page.
            </p>

            <button
              onClick={this.reset}
              className="px-5 py-2.5 rounded-[var(--r-md)] bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium border-none cursor-pointer transition-opacity hover:opacity-85"
            >
              Try again
            </button>

            <button
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              className="bg-transparent border-none text-[var(--text-mute)] text-xs cursor-pointer underline p-0 hover:text-[var(--text-dim)]"
            >
              {this.state.showDetails ? 'Hide details' : 'Show details'}
            </button>

            {this.state.showDetails && this.state.error && (
              <pre className="w-full overflow-auto text-xs text-[var(--error)] bg-[var(--bg)] rounded-[var(--r-md)] p-4 border border-[var(--border-soft)] max-h-48 m-0 font-[var(--font-mono)]">
                {this.state.error.toString()}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
