'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-96">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
        <h2 className="text-xl font-bold text-red-600 mb-3">Erro no Dashboard</h2>
        <p className="text-gray-700 mb-3">
          Não foi possível carregar esta página. Tente novamente.
        </p>
        {error.message && (
          <p className="text-xs text-gray-500 mb-3 font-mono bg-gray-100 p-2 rounded">
            {error.message}
          </p>
        )}
        <button
          onClick={reset}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}
