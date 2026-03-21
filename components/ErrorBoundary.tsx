'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-arena-darker flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-arena-gray border-2 border-arena-red rounded-xl p-8 text-center">
            <AlertTriangle className="w-16 h-16 text-arena-red mx-auto mb-4" />
            
            <h1 className="text-2xl font-bold mb-2">Oups ! Quelque chose a planté</h1>
            
            <p className="text-gray-400 mb-6">
              Une erreur inattendue s'est produite. L'équipe technique a été notifiée.
            </p>

            {this.state.error && (
              <details className="text-left mb-6">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-white mb-2">
                  Détails techniques
                </summary>
                <pre className="text-xs bg-arena-darker p-3 rounded overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-arena-blue hover:bg-arena-blue/80 text-arena-dark font-bold py-3 rounded-lg transition-all"
            >
              Retour à l'Accueil
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
