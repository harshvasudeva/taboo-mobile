'use client'

import { GameProvider, useGame } from '@/components/GameContext'
import GameOverScreen from '@/components/GameOverScreen'
import GameScreen from '@/components/GameScreen'
import LobbyScreen from '@/components/LobbyScreen'
import RoomScreen from '@/components/RoomScreen'
import { AnimatePresence, motion } from 'framer-motion'

function GameContent() {
  const { currentScreen, notifications, isReconnecting } = useGame()

  // Show loading screen while attempting to reconnect to a previous session
  if (isReconnecting) {
    return (
      <main className="min-h-screen p-2 sm:p-4 md:p-6 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="glass-strong rounded-2xl p-8 border border-cyan-500/20">
            <div className="animate-spin w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">Reconnecting...</h2>
            <p className="text-gray-400">Returning to your game session</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {currentScreen === 'room' && <RoomScreen />}
        {currentScreen === 'lobby' && <LobbyScreen />}
        {currentScreen === 'game' && <GameScreen />}
        {currentScreen === 'gameover' && <GameOverScreen />}
      </div>

      {/* Global notification display - stacked */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-3 w-11/12 sm:w-auto items-center pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto"
            >
              <div className={`glass-strong rounded-xl px-8 py-4 border-2 shadow-2xl min-w-[300px] md:min-w-[400px] max-w-2xl ${notif.type === 'success' ? 'border-green-500/50 bg-green-500/10' :
                notif.type === 'warning' ? 'border-yellow-500/50 bg-yellow-500/10' :
                  'border-cyan-500/50 bg-cyan-500/10'
                }`}>
                <div className={`text-center font-semibold text-base sm:text-lg whitespace-pre-line ${notif.type === 'success' ? 'text-green-300' :
                  notif.type === 'warning' ? 'text-yellow-300' :
                    'text-cyan-300'
                  }`}>
                  {notif.message}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <GameProvider>
      <GameContent />
    </GameProvider>
  )
}
