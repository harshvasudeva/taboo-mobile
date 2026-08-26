'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Users, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { useGame } from './GameContext'

// Word pack options for room creation
export const WORD_PACKS = [
  { key: 'standard', name: 'Taboo - Standard', description: 'Easy + Medium + Hard mix', color: 'from-blue-500 to-blue-600', tags: ['EN'] },
  { key: 'difficult', name: 'Taboo - Difficult', description: 'All difficulties including Insane', color: 'from-purple-500 to-purple-600', tags: ['EN'] },
  { key: 'intense', name: 'Taboo - Intense', description: 'Hard + Insane only - Max challenge!', color: 'from-pink-500 to-rose-600', tags: ['EN'] },
  { key: 'easy', name: 'Taboo - Easy', description: 'Easy words only (5-12 pts)', color: 'from-green-500 to-green-600', tags: ['EN'] },
  { key: 'medium', name: 'Taboo - Medium', description: 'Medium words only (13-25 pts)', color: 'from-yellow-500 to-yellow-600', tags: ['EN'] },
  { key: 'hard', name: 'Taboo - Hard', description: 'Hard words only (26-40 pts)', color: 'from-orange-500 to-orange-600', tags: ['EN'] },
  { key: 'insane', name: 'Taboo - Insane', description: 'Insane words only (41-60 pts)', color: 'from-red-500 to-red-600', tags: ['EN'] },

  // Hindi packs (use wordDatabase.json keys: hindi_easy, hindi_medium, hindi_hard)
  { key: 'hindi', name: 'Taboo - Hindi', description: 'Mix of Hindi Easy + Medium + Hard', color: 'from-blue-500 to-red-500', tags: ['HI'] },
  { key: 'hindi_easy', name: 'Taboo - Hindi (Easy)', description: 'Hindi Easy words', color: 'from-green-500 to-green-600', tags: ['HI'] },
  { key: 'hindi_medium', name: 'Taboo - Hindi (Medium)', description: 'Hindi Medium words', color: 'from-yellow-500 to-yellow-600', tags: ['HI'] },
  { key: 'hindi_hard', name: 'Taboo - Hindi (Hard)', description: 'Hindi Hard words', color: 'from-orange-500 to-orange-600', tags: ['HI'] },
]

export default function RoomScreen() {
  const { createRoom, joinRoom, connected } = useGame()
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [selectedWordPack, setSelectedWordPack] = useState('standard')
  const [showWordPackDropdown, setShowWordPackDropdown] = useState(false)

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      createRoom(name.trim(), selectedWordPack)
    }
  }

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && code.trim()) {
      joinRoom(code.trim().toUpperCase(), name.trim())
    }
  }

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center min-h-screen p-4 relative overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="flex justify-center mb-4"
          >
            <img src="/logo.png" alt="Taboo Logo" className="w-32 h-32 md:w-40 md:h-40" />
          </motion.div>
          <motion.h1
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent"
          >
            TABOO
          </motion.h1>
          <p className="text-gray-300 text-base md:text-lg">Made by Ishpreet
          </p>

          {/* Connection Status */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {connected ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">Disconnected</span>
              </>
            )}
          </div>
        </div>

        {/* Mode Selection */}
        {mode === 'select' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-strong rounded-2xl p-6 md:p-8 space-y-4"
          >
            <button
              onClick={() => setMode('create')}
              className="w-full py-3 md:py-4 px-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl font-semibold text-white transition-all transform hover:scale-105 flex items-center justify-center gap-3 text-sm md:text-base"
            >
              <Users className="w-5 h-5" />
              Create New Room
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full py-3 md:py-4 px-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-semibold text-white transition-all transform hover:scale-105 flex items-center justify-center gap-3 text-sm md:text-base"
            >
              <Users className="w-5 h-5" />
              Join Existing Room
            </button>
          </motion.div>
        )}

        {/* Create Room Form */}
        {mode === 'create' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-strong rounded-2xl p-6 md:p-8"
          >
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Create Room</h2>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 text-sm md:text-base"
                  maxLength={20}
                  required
                />
              </div>

              {/* Word Pack Selector */}
              <div>
                <label className="block text-sm font-medium mb-2">Word Pack</label>
                <button
                  type="button"
                  onClick={() => setShowWordPackDropdown(!showWordPackDropdown)}
                  className={`w-full px-4 py-3 bg-gradient-to-r ${WORD_PACKS.find(p => p.key === selectedWordPack)?.color || 'from-blue-500 to-blue-600'} rounded-xl font-semibold text-white transition-all flex items-center justify-between text-sm md:text-base`}
                >
                  <span>{WORD_PACKS.find(p => p.key === selectedWordPack)?.name || 'Taboo - Standard'}</span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${showWordPackDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showWordPackDropdown && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 bg-gray-900/95 backdrop-blur-lg border border-white/20 rounded-xl shadow-xl max-h-[200px] overflow-y-auto"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {WORD_PACKS.map((pack) => (
                      <button
                        key={pack.key}
                        type="button"
                        onClick={() => {
                          setSelectedWordPack(pack.key)
                          setShowWordPackDropdown(false)
                        }}
                        className={`w-full px-4 py-2.5 text-left hover:bg-white/10 transition-all flex flex-col ${selectedWordPack === pack.key ? 'bg-white/15' : ''}`}
                      >
                        <span className={`font-semibold bg-gradient-to-r ${pack.color} bg-clip-text text-transparent text-sm`}>
                          {pack.name}
                        </span>
                        <span className="text-xs text-gray-400">{pack.description}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="flex-1 py-3 px-4 md:px-6 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-all text-sm md:text-base"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!connected}
                  className="flex-1 py-3 px-4 md:px-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm md:text-base"
                >
                  Create
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Join Room Form */}
        {mode === 'join' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-strong rounded-2xl p-6 md:p-8"
          >
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Join Room</h2>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-400 text-sm md:text-base"
                  maxLength={20}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Room Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-400 uppercase tracking-wider text-center text-lg md:text-xl font-mono"
                  maxLength={6}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="flex-1 py-3 px-4 md:px-6 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-all text-sm md:text-base"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!connected}
                  className="flex-1 py-3 px-4 md:px-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm md:text-base"
                >
                  Join
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Version & Copyright */}
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-400">v5.0.0</p>
          <p className="text-xs text-gray-400">Taboo @ 2026. All rights reserved.</p>
        </div>
      </motion.div>
    </div>
  )
}
