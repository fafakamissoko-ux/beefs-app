'use client';

import { useState, useEffect } from 'react';
import { DailyVideo } from '@/components/DailyVideo';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

export default function DailyTestPage() {
  const { toast } = useToast();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('Testeur');

  // Get user name
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('display_name, username')
          .eq('id', user.id)
          .single();
        
        if (userData) {
          setUserName(userData.display_name || userData.username || 'User');
        }
      }
    };
    getUser();
  }, []);

  const createRoom = async () => {
    setIsCreatingRoom(true);
    setError(null);

    try {
      const response = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: `test-${Date.now()}`,
          privacy: 'public',
          maxParticipants: 10,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      console.log('✅ Room created:', data.room.url);
      setRoomUrl(data.room.url);
    } catch (err: any) {
      console.error('❌ Error creating room:', err);
      setError(err.message || 'Erreur lors de la création de la room');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  return (
    <div className="min-h-screen bg-black p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              🎥 Test Daily.co - Vidéo/Audio
            </h1>
            <p className="text-gray-400">
              Test de l'intégration Daily.co pour les débats en live
            </p>
          </div>
          <Link
            href="/feed"
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            ← Retour
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        {!roomUrl ? (
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <div className="text-8xl mb-6">📹</div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Créer une Room de Test
            </h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Crée une room Daily.co temporaire pour tester la vidéo et l'audio.
              Tu pourras ouvrir la même URL dans un autre onglet (ou mode incognito) pour tester avec 2 participants.
            </p>

            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-6 text-red-200">
                <p className="font-semibold">❌ Erreur</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={createRoom}
              disabled={isCreatingRoom}
              className="brand-gradient hover:opacity-90 disabled:opacity-50 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-lg text-lg"
            >
              {isCreatingRoom ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  Création...
                </span>
              ) : (
                '🚀 Créer une Room de Test'
              )}
            </button>

            {/* Instructions */}
            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-left max-w-2xl mx-auto">
              <h3 className="text-blue-400 font-bold mb-2">📝 Instructions de test:</h3>
              <ul className="text-sm text-gray-300 space-y-2">
                <li>1. Clique sur "Créer une Room de Test"</li>
                <li>2. Autorise l'accès à ta caméra et ton micro</li>
                <li>3. Tu devrais te voir en vidéo!</li>
                <li>4. Pour tester avec 2 participants:
                  <ul className="ml-4 mt-1 space-y-1">
                    <li>• Copie l'URL de la page</li>
                    <li>• Ouvre un nouvel onglet en mode incognito (Ctrl+Shift+N)</li>
                    <li>• Colle l'URL</li>
                    <li>• Tu verras 2 vidéos (toi dans les 2 fenêtres)</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Video Container */}
            <div className="bg-gray-900 rounded-xl p-4" style={{ height: '600px' }}>
              <DailyVideo roomUrl={roomUrl} userName={userName} />
            </div>

            {/* Info Card */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-white font-bold mb-3">🔗 URL de la Room:</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomUrl}
                  readOnly
                  className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg font-mono text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(roomUrl);
                    toast('URL copiée!', 'success');
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold"
                >
                  📋 Copier
                </button>
              </div>
              <p className="text-gray-400 text-sm mt-3">
                💡 Ouvre cette URL dans un autre onglet (mode incognito) pour tester avec 2 participants
              </p>
            </div>

            {/* New Room Button */}
            <button
              onClick={() => {
                setRoomUrl(null);
                setError(null);
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              🔄 Créer une Nouvelle Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
