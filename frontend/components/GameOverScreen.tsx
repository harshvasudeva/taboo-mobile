'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, Home, Medal, RotateCw, Star, Trophy } from 'lucide-react'
import { useGame } from './GameContext'

interface PlayerContribution {
  name: string
  points: number
  guessedWords?: string[]
  describedWords?: string[]
  tabooWords?: { word: string; points: number }[]
  words?: string[]
}

export default function GameOverScreen() {
  const { gameState, leaveGame, socket, roomCode, localPlayerPlayAgain } = useGame()

  // Get taboo deductions per team
  const tabooDeductionsByTeam = gameState.confirmedTaboosByTeam || {}

  // Debug logging
  console.log('[GAME-OVER] gameState.confirmedTaboosByTeam:', gameState.confirmedTaboosByTeam)
  console.log('[GAME-OVER] tabooDeductionsByTeam:', tabooDeductionsByTeam)

  // Calculate effective scores (original - taboo deductions)
  const teamsWithEffectiveScores = gameState.teams.map((team, index) => {
    const tabooDeduction = tabooDeductionsByTeam[index] || 0
    console.log(`[GAME-OVER] Team ${index} (${team.name}): score=${team.score}, tabooDeduction=${tabooDeduction}`)
    return {
      ...team,
      originalIndex: index,
      tabooDeduction: tabooDeduction,
      effectiveScore: team.score - tabooDeduction
    }
  })

  // Find winner by comparing effective scores
  const sortedTeams = [...teamsWithEffectiveScores].sort((a, b) => b.effectiveScore - a.effectiveScore);
  const winner = sortedTeams[0].effectiveScore > sortedTeams[1].effectiveScore ? sortedTeams[0] : null;
  const winnerIndex = winner ? winner.originalIndex : null;

  // Get all contributors sorted by points
  const contributions: PlayerContribution[] = Object.entries(gameState.playerContributions)
    .map(([name, data]: [string, any]) => ({ name, ...data }))
    .sort((a, b) => b.points - a.points)

  return (
    <div className="py-8 max-w-4xl mx-auto">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="text-center mb-12"
      >
        {winner ? (
          <>
            <motion.div
              initial={{ rotate: -180 }}
              animate={{ rotate: 0 }}
              transition={{ type: 'spring', stiffness: 100 }}
              className="text-8xl mb-6"
            >
              🏆
            </motion.div>
            <h1 className="text-3xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent break-words px-4">
              {winner.name} Wins!
            </h1>
            <p className="text-2xl text-gray-300">{winner.effectiveScore} Points</p>
            {winner.tabooDeduction > 0 && (
              <p className="text-sm text-orange-400 mt-1">
                ({winner.score} - {winner.tabooDeduction} taboo penalty)
              </p>
            )}
          </>
        ) : (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-6xl sm:text-8xl mb-6"
            >
              🤝
            </motion.div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              It's a Tie!
            </h1>
            <p className="text-xl sm:text-2xl text-gray-300 px-4 break-words">
              {sortedTeams.map(t => t.effectiveScore).join(' - ')}
            </p>
          </>
        )}
      </motion.div>

      {/* Final Scores */}
      <div className={`grid ${gameState.teamCount === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 mb-12`}>
        {teamsWithEffectiveScores.map((team, index) => {
          const teamColors = ['blue', 'red', 'green'];
          const teamColorName = teamColors[team.originalIndex];
          const isWinner = winnerIndex === team.originalIndex;

          return (
            <motion.div
              key={team.name}
              initial={{ x: team.originalIndex % 2 === 0 ? -50 : 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`glass-strong rounded-2xl p-4 sm:p-8 border-2 ${isWinner ? 'border-yellow-500 bg-yellow-500/10' : `border-${teamColorName}-500/30`
                }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-2xl font-bold text-${teamColorName}-400`}>{team.name}</h2>
                {isWinner && <Trophy className="w-8 h-8 text-yellow-400" />}
              </div>

              {/* Score Display - Always show both raw and final */}
              <div className="flex items-end gap-3 sm:gap-4 mb-3">
                <div>
                  <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Final Score</div>
                  <div className="text-3xl sm:text-5xl font-bold text-white">{team.effectiveScore}</div>
                </div>
                <div className="pb-1">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Raw</div>
                  <div className={`text-2xl font-semibold ${team.tabooDeduction > 0 ? 'text-gray-400' : 'text-gray-300'}`}>
                    {team.score}
                  </div>
                </div>
              </div>

              {/* Taboo Penalty */}
              {team.tabooDeduction > 0 ? (
                <div className="flex items-center gap-2 text-sm bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <span className="text-orange-400">Taboo Penalty: -{team.tabooDeduction} pts</span>
                </div>
              ) : (
                <div className="text-sm text-gray-500 mb-4">No taboo penalties</div>
              )}
              <div className="space-y-2">
                {team.players.map((player) => (
                  <div key={player} className="glass rounded-lg p-2 flex items-center gap-2">
                    <div className={`w-8 h-8 bg-${teamColorName}-500 rounded-full flex items-center justify-center text-sm font-bold`}>
                      {player.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm">{player}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* All Player Stats */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="glass-strong rounded-2xl p-8 mb-8"
      >
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Star className="w-6 h-6 text-yellow-400" />
          Player Stats
        </h2>
        <div className="space-y-4">
          {contributions.map((player, index) => {
            const tabooCount = player.tabooWords?.length || 0
            const tabooPoints = player.tabooWords?.reduce((sum, t) => sum + t.points, 0) || 0

            return (
              <motion.div
                key={player.name}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.05 }}
                className="glass rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex items-center gap-2">
                    {index === 0 && <Medal className="w-6 h-6 text-yellow-400" />}
                    {index === 1 && <Medal className="w-6 h-6 text-gray-400" />}
                    {index === 2 && <Medal className="w-6 h-6 text-orange-600" />}
                    {index > 2 && <span className="w-6 text-center text-gray-400">#{index + 1}</span>}
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold">{player.name}</div>
                    <div className="text-sm text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="text-green-400">
                        {(player.guessedWords?.length || player.words?.length || 0)} guessed
                      </span>
                      <span className="text-blue-400">
                        {player.describedWords?.length || 0} described
                      </span>
                      {tabooCount > 0 && (
                        <span className="text-orange-400">
                          {tabooCount} taboo{tabooCount !== 1 ? 's' : ''} ({tabooPoints}pts)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-yellow-400">{player.points}</div>
              </motion.div>
            )
          })}
          {contributions.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No player stats available
            </div>
          )}
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-center"
      >
        <div className="flex items-center justify-center gap-4">
          {/* Individual Play Again available to all players */}
          <button
            onClick={() => {
              try {
                socket?.emit('player-play-again', { roomCode })
                // Optimistically update local UI so the player shows up in the waiting list immediately
                localPlayerPlayAgain()
              } catch (e) {
                console.error('Failed to emit player-play-again', e)
              }
            }}
            className="px-12 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-xl font-bold text-xl transition-all transform hover:scale-105 flex items-center gap-3"
          >
            <RotateCw className="w-6 h-6" />
            <span>Play Again</span>
          </button>

          {/* admin-play-again removed: individual Play Again handles per-player flow and assigns first requester as host */}

          <button
            onClick={() => {
              leaveGame()
            }}
            className="px-12 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-xl font-bold text-xl transition-all transform hover:scale-105 flex items-center gap-3"
          >
            <Home className="w-6 h-6" />
            Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  )
}
