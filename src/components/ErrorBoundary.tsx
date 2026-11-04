import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error in ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    const isChunkError =
      this.state.error?.message &&
      /dynamically imported module|failed to fetch|chunk/i.test(this.state.error.message);

    if (isChunkError) {
      window.location.reload();
      return;
    }

    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message &&
        /dynamically imported module|failed to fetch|chunk/i.test(this.state.error.message);

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                {isChunkError
                  ? 'Actualización detectada en el sistema'
                  : this.props.fallbackTitle || 'Ocurrió un problema al cargar esta sección.'}
              </h2>
              <p className="text-sm text-slate-400">
                {isChunkError
                  ? 'Se ha desplegado una nueva versión de los componentes o hubo un cambio en la conexión. Haz clic en "Recargar sistema" para sincronizar la versión más reciente.'
                  : 'Se detectó una excepción en la vista. Puedes intentar recargar el componente o reiniciar la aplicación para recuperar el estado normal.'}
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-left font-mono text-xs text-rose-300 max-h-32 overflow-y-auto break-all">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                id="btn-error-boundary-retry"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isChunkError ? 'Recargar y Sincronizar' : 'Intentar nuevamente'}</span>
              </button>

              <button
                id="btn-error-boundary-reload"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recargar sistema</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
