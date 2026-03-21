import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, UserPlus, Check } from 'lucide-react';

interface User {
  id: string;
  name: string;
  avatar?: string;
  isOnline?: boolean;
}

interface InviteParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (userId: string) => void;
  currentParticipants: string[]; // IDs of people already on the ring
}

export function InviteParticipantModal({
  isOpen,
  onClose,
  onInvite,
  currentParticipants,
}: InviteParticipantModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);

  // Mock users - Replace with real data from database/witnesses
  const availableUsers: User[] = [
    { id: 'user1', name: 'Marc', avatar: '👤', isOnline: true },
    { id: 'user2', name: 'Sophie', avatar: '👩', isOnline: true },
    { id: 'user3', name: 'Thomas', avatar: '👨', isOnline: false },
    { id: 'user4', name: 'Julie', avatar: '👩‍💼', isOnline: true },
    { id: 'user5', name: 'Alex', avatar: '🧑', isOnline: true },
  ].filter(user => !currentParticipants.includes(user.id));

  const filteredUsers = availableUsers.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInvite = (userId: string) => {
    if (!invitedUsers.includes(userId)) {
      setInvitedUsers([...invitedUsers, userId]);
      onInvite(userId);
      
      // Auto-close after short delay
      setTimeout(() => {
        onClose();
        setInvitedUsers([]);
        setSearchQuery('');
      }, 1000);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full border-2 border-orange-500/50 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-orange-500" />
              Inviter sur le ring
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Info */}
          <p className="text-gray-400 text-sm mb-4">
            Invite un témoin ou une personne impliquée à monter sur le ring pour s'exprimer.
          </p>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un utilisateur..."
              className="w-full bg-black/40 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto space-y-2 mb-4">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Aucun utilisateur disponible</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isInvited = invitedUsers.includes(user.id);
                
                return (
                  <motion.button
                    key={user.id}
                    onClick={() => handleInvite(user.id)}
                    disabled={isInvited}
                    whileHover={!isInvited ? { scale: 1.02 } : {}}
                    whileTap={!isInvited ? { scale: 0.98 } : {}}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                      isInvited
                        ? 'bg-green-500/20 border-green-500 cursor-not-allowed'
                        : 'bg-black/40 border-gray-700 hover:border-orange-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                          {user.avatar}
                        </div>
                        {user.isOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="text-left">
                        <p className="text-white font-bold">{user.name}</p>
                        <p className="text-gray-400 text-sm">
                          {user.isOnline ? '🟢 En ligne' : '⚫ Hors ligne'}
                        </p>
                      </div>
                    </div>

                    {/* Action */}
                    {isInvited ? (
                      <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                        <Check className="w-5 h-5" />
                        Invité
                      </div>
                    ) : (
                      <UserPlus className="w-5 h-5 text-orange-500" />
                    )}
                  </motion.button>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-orange-400 text-xs">
              💡 <strong>Astuce:</strong> La personne invitée recevra une notification et pourra accepter ou refuser de monter sur le ring.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
