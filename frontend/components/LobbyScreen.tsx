'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Book, Check, ChevronDown, Copy, Crown, Edit3, Flag, GraduationCap, LogOut, Play, PlayCircle, Shuffle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useGame } from './GameContext'
import { WORD_PACKS } from './RoomScreen'

export default function LobbyScreen() {
  const { roomCode, players, isHost, isAdmin, myTeam, joinTeam, startGame, playerName, leaveGame, teamSwitchingLocked, roomJoiningLocked, socket, lobbyTeamCount, tabooReporting, tabooVoting, setTabooSettings, playAgainDefaulted, gameState, setNotification, selectedWordPack, changeWordPack } = useGame()
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [selectedRounds, setSelectedRounds] = useState<number>(12)
  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null)
  const [editingTeamName, setEditingTeamName] = useState<string>('')
  const [showWordPackDropdown, setShowWordPackDropdown] = useState(false)

  useEffect(() => {
    try {
      if (gameState?.maxRounds) setSelectedRounds(gameState.maxRounds)
    } catch (e) { }
  }, [gameState?.maxRounds])

  // Clear old team names from localStorage when joining OR leaving a room
  useEffect(() => {
    if (!roomCode) {
      // Clear all team names when not in a room
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('teamName_')) {
          localStorage.removeItem(key)
        }
      })
      return
    }

    // Clear team names for this specific room when joining
    for (let i = 0; i < 3; i++) {
      const key = `teamName_${roomCode}_${i}`
      localStorage.removeItem(key)
    }
  }, [roomCode]) // Runs when room code changes (join/leave)

  // Debug: Log lobbyTeamCount changes
  useEffect(() => {
    console.log('LobbyScreen - lobbyTeamCount changed to:', lobbyTeamCount)
  }, [lobbyTeamCount])

  // Socket listeners for captain draft flow
  // Buffer incoming draft events while showing coin result so UI doesn't auto-advance
  const pendingDraftEventsRef = useRef<any[]>([])
  const faceoffShownRef = useRef(false)
  const viewingCoinResultRef = useRef(false) // Track if we're viewing coin result

  useEffect(() => {
    if (!socket) return

    const onStart = (data: any) => {
      // open the same selection modal for everyone; non-hosts will see it read-only
      setSelectedCaptains(Array(lobbyTeamCount).fill(null))
      setCaptainModalOpen(true)
      if (!isHost) {
        setPreviewCaptains(Array(lobbyTeamCount).fill(null))
        setNotification({ message: 'Team Division started by host.', type: 'info' })
        setTimeout(() => setNotification(null), 2500)
      }
    }

    const onCaptainsConfirmed = (data: any) => {
      // show an animated faceoff to everyone, then move to draft state
      setCaptainModalOpen(false)
      setPreviewCaptains([])
      // if we've already shown faceoff locally (host pressed confirm), don't re-render it
      if (!faceoffShownRef.current) {
        setFaceoff({ captains: data.captainNames || [], teams: data.teams })
      }
      // after short animation, show draft
      setTimeout(() => {
        setDraftState(data)
        setFaceoff(null)
        faceoffShownRef.current = false
      }, 2400)
    }

    const onCaptainPickTurn = (data: any) => {
      // If we're viewing the coin result, this means the host clicked Continue
      // Clear the flag and process the event so everyone advances together
      if (viewingCoinResultRef.current) {
        viewingCoinResultRef.current = false
      }
      // Preserve the coinResult when transitioning to picking phase
      setDraftState((prev: any) => ({ ...prev, ...data, coinResult: prev?.coinResult }))
    }

    const onCaptainPicked = (data: any) => {
      // If we're viewing the coin result, buffer this event
      if (viewingCoinResultRef.current) {
        pendingDraftEventsRef.current.push({ type: 'captain-picked', data })
        return
      }
      // Preserve coinResult when updating draft state
      setDraftState((prev: any) => ({ ...(prev || {}), ...data, coinResult: prev?.coinResult }))
    }

    const onLastPlayerChoice = (data: any) => {
      // If this client is the last player, server sends this event to that client only
      if (viewingCoinResultRef.current) {
        pendingDraftEventsRef.current.push({ type: 'last-player-choice', data })
        return
      }
      setDraftState((prev: any) => ({ ...(prev || {}), lastPlayerChoice: data }))
    }

    const onCaptainSelectionComplete = (data: any) => {
      setDraftState(null)
      setCaptainModalOpen(false)
      // server will emit team updates; show notification
      setNotification({ message: 'Team Division complete. Teams assigned.', type: 'success' })
      setTimeout(() => setNotification(null), 3000)
    }

    socket.on('captain-selection-started', onStart)
    socket.on('captains-confirmed', onCaptainsConfirmed)
    socket.on('captain-pick-turn', onCaptainPickTurn)
    socket.on('captain-picked', onCaptainPicked)
    socket.on('last-player-choice', onLastPlayerChoice)
    socket.on('captain-preview', (d: any) => {
      // preview updates from host (use name for display)
      try {
        setPreviewCaptains((prev: any) => {
          const copy = prev ? [...prev] : Array(lobbyTeamCount).fill(null)
          copy[d.index] = d.playerName || null
          return copy
        })
      } catch (e) { }
    })
    socket.on('captain-waiting-ready', (d: any) => {
      // ensure draft state contains captains list
      setDraftState((prev: any) => ({ ...(prev || {}), captains: d.captains }))
    })
    socket.on('captain-ready-update', (d: any) => {
      setDraftState((prev: any) => ({ ...(prev || {}), ready: d.ready }))
    })
    socket.on('coin-flip', (d: any) => {
      // optional: could show animation; for now attach to draftState
      setDraftState((prev: any) => ({ ...(prev || {}), coinFlipInProgress: true }))
    })
    socket.on('coin-result', (d: any) => {
      // Immediately record result - it will show on the same coin flip screen
      setDraftState((prev: any) => ({ ...(prev || {}), coinFlipInProgress: false, coinResult: d.winningTeamIndex }))
      viewingCoinResultRef.current = true // Mark that we're viewing the result
    })
    socket.on('captain-selection-complete', onCaptainSelectionComplete)
    const onCaptainSelectionCancelled = (d: any) => {
      // close the captain selection/draft UI for everyone
      try {
        setDraftState(null)
        setCaptainModalOpen(false)
        setPreviewCaptains([])
        setFaceoff(null)
        faceoffShownRef.current = false
        viewingCoinResultRef.current = false
        pendingDraftEventsRef.current = []
      } catch (e) { }
    }
    socket.on('captain-selection-cancelled', onCaptainSelectionCancelled)

    // Handle new player added during draft
    const onDraftPlayerAdded = (data: any) => {
      setDraftState((prev: any) => {
        if (!prev) return prev
        return { ...prev, availablePlayers: data.availablePlayers }
      })
    }
    socket.on('draft-player-added', onDraftPlayerAdded)

    return () => {
      socket.off('captain-selection-started', onStart)
      socket.off('captains-confirmed', onCaptainsConfirmed)
      socket.off('captain-pick-turn', onCaptainPickTurn)
      socket.off('captain-picked', onCaptainPicked)
      socket.off('last-player-choice', onLastPlayerChoice)
      socket.off('captain-waiting-ready')
      socket.off('captain-ready-update')
      socket.off('coin-flip')
      socket.off('coin-result')
      socket.off('captain-selection-complete', onCaptainSelectionComplete)
      socket.off('captain-selection-cancelled', onCaptainSelectionCancelled)
      socket.off('captain-preview')
      socket.off('draft-player-added', onDraftPlayerAdded)
    }
  }, [socket, lobbyTeamCount])

  // preview captains visible to non-hosts
  const [previewCaptains, setPreviewCaptains] = useState<(string | null)[]>([])
  // faceoff animation state
  const [faceoff, setFaceoff] = useState<any>(null)

  // Admin confirms selected captains
  const confirmCaptains = () => {
    if (!isHost || !socket || !roomCode) return
    // validate
    const picks = selectedCaptains.filter(Boolean) as string[]
    if (picks.length !== lobbyTeamCount) {
      setNotification({ message: 'Please select a captain for each team.', type: 'warning' })
      setTimeout(() => setNotification(null), 3000)
      return
    }
    const unique = Array.from(new Set(picks))
    if (unique.length !== picks.length) {
      setNotification({ message: 'Cannot select the same player as captain for multiple teams.', type: 'warning' })
      setTimeout(() => setNotification(null), 3000)
      return
    }
    // selectedCaptains contains player ids
    socket.emit('admin-set-captains', { roomCode, captains: selectedCaptains })
    setCaptainModalOpen(false)
    // immediately show faceoff transition locally so host sees VS right away
    try {
      const captainNames = (selectedCaptains || []).map((id) => players.find(p => p.id === id)?.name || previewCaptains?.[selectedCaptains.indexOf(id)] || null)
      faceoffShownRef.current = true
      setPreviewCaptains([])
      setFaceoff({ captains: captainNames, teams: null })
    } catch (e) { }
  }

  // Player (captain) picks a player during draft
  const pickPlayer = (playerId: string) => {
    if (!socket || !roomCode) return
    socket.emit('captain-picked', { roomCode, playerId })
  }

  // Captain ready for coin flip
  const captainReady = (setTo?: boolean) => {
    if (!socket || !roomCode || !draftState || !socket.id) return
    const desired = typeof setTo === 'boolean' ? setTo : !(draftState.ready?.[socket.id])
    socket.emit('captain-ready', { roomCode, ready: desired })
  }

  // Last remaining player chooses a team
  const chooseTeamAsLastPlayer = (teamIndex: number) => {
    if (!socket || !roomCode) return
    socket.emit('last-player-choose', { roomCode, teamIndex })
  }

  // Update team count and broadcast to all players (host only)
  const handleTeamCountChange = (newTeamCount: number) => {
    console.log('handleTeamCountChange called with:', newTeamCount)
    if (socket && roomCode) {
      socket.emit('set-team-count', { roomCode, teamCount: newTeamCount })
    }
  }

  // Toggle taboo settings (host only)
  const handleTabooReportingToggle = () => {
    const newReporting = !tabooReporting
    // If turning off reporting, also turn off voting
    const newVoting = newReporting ? tabooVoting : false
    setTabooSettings(newReporting, newVoting)
  }

  const handleTabooVotingToggle = () => {
    // Can only toggle voting if reporting is enabled
    if (tabooReporting) {
      setTabooSettings(tabooReporting, !tabooVoting)
    }
  }

  const team1 = players.filter(p => p.team === 0)
  const team2 = players.filter(p => p.team === 1)
  const team3 = players.filter(p => p.team === 2)
  // Only show players who have opted back into the waiting list.
  // Treat undefined as true so new joiners (without an explicit flag) are visible by default.
  const unassigned = players.filter(p => p.team === null && (p.showInWaiting !== false))

  // Use team names from gameState when available so lobby reflects admin-renamed names
  const teamName = (idx: number, fallback: string) => {
    try {
      return gameState?.teams?.[idx]?.name || fallback
    } catch (e) {
      return fallback
    }
  }

  const canStart = team1.length > 0 && team2.length > 0 && (lobbyTeamCount === 2 || team3.length > 0)

  const handleSaveEdit = (teamIndex: number) => {
    const isCaptain = players.find(p => p.name === playerName)?.isCaptain
    if (!isAdmin && !(isCaptain && myTeam === teamIndex)) return
    const newName = (editingTeamName || '').trim()
    if (!newName) return
    socket?.emit('rename-team', { roomCode, teamIndex, newName })
    setEditingTeamIndex(null)
    setEditingTeamName('')
  }

  const handleRandomizeTeams = () => {
    if (!isAdmin) return
    socket?.emit('admin-randomize-teams', { roomCode })
  }

  // Captain selection / draft states (admin only)
  const [captainModalOpen, setCaptainModalOpen] = useState(false)
  const [selectedCaptains, setSelectedCaptains] = useState<(string | null)[]>([])
  const [draftState, setDraftState] = useState<any>(null)

  // Handle coin result display and auto-transition
  useEffect(() => {
    // No auto-transition needed anymore - result stays until host clicks continue
  }, [draftState?.coinResult])

  // Continue to draft after coin result
  const continueToDraft = () => {
    // Mark that we're no longer viewing the coin result
    viewingCoinResultRef.current = false

    try {
      const pending = pendingDraftEventsRef.current || []
      if (pending.length > 0) {
        // Play events in order
        pending.forEach((evt: any) => {
          if (evt.type === 'captain-pick-turn') setDraftState(evt.data)
          if (evt.type === 'captain-picked') setDraftState((prev: any) => ({ ...(prev || {}), ...evt.data }))
          if (evt.type === 'last-player-choice') setDraftState((prev: any) => ({ ...(prev || {}), lastPlayerChoice: evt.data }))
        })
        pendingDraftEventsRef.current = []
      } else {
        // Request the server to start the picking phase
        if (socket && roomCode && draftState) {
          socket.emit('start-captain-picking', { roomCode })
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Start captain selection (host/admin)
  const handleStartCaptainSelection = () => {
    if (!isAdmin) return

    if (players.length < 4) {
      setNotification({ message: 'Need at least 4 players for Team Division.', type: 'warning' })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    if (lobbyTeamCount !== 2) {
      // For now only support 2-team Team Division
      setNotification({ message: 'Team Division currently supports 2 teams only.', type: 'warning' })
      setTimeout(() => setNotification(null), 3000)
      return
    }
    socket?.emit('start-captain-selection', { roomCode })
  }

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode)
    }
  }

  const handleLeaveGame = () => {
    setShowLeaveConfirm(false)
    leaveGame()
  }

  return (
    <div className="py-6 md:py-8 relative px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6 md:mb-8"
      >
        <h1 className="text-3xl md:text-4xl font-bold mb-4">Game Lobby</h1>
        <div className="flex items-center justify-center gap-3 relative">
          <div className="glass rounded-xl px-4 md:px-6 py-2 md:py-3 flex items-center gap-2 md:gap-3">
            <span className="text-gray-400 text-sm md:text-base">Room Code:</span>
            <span className="text-xl md:text-2xl font-mono font-bold tracking-wider">{roomCode}</span>
            <button
              onClick={copyRoomCode}
              className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
          {/* Leave Button */}
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="absolute right-0 p-2 md:p-2.5 glass-strong rounded-lg hover:bg-red-500/20 transition-colors text-red-400 border border-red-500/30 hover:border-red-500/50"
          >
            <LogOut className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>

        {/* Host controls: Number of Teams (left) + Randomize (center) + Taboo Features (right) */}
        {isHost && (
          <div className="mt-3 w-full flex justify-center">
            {/* Mobile layout: show Taboo features, 2x2 controls, then word pack */}
            <div className="w-full max-w-4xl md:hidden flex flex-col items-center gap-4">
              {/* Taboo features (mobile) */}
              <div className="w-full flex flex-col items-center">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 whitespace-nowrap">Taboo Features:</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" checked={tabooReporting} onChange={handleTabooReportingToggle} className="sr-only peer" />
                        <div className="w-10 h-6 bg-gray-700 rounded-full peer peer-checked:bg-orange-500 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                      </div>
                      <span className={`text-sm font-medium ${tabooReporting ? 'text-orange-300' : 'text-gray-500'}`}>
                        <Flag className="w-4 h-4 inline mr-1 text-orange-300" />
                        Reporting
                      </span>
                    </label>

                    <label className={`flex items-center gap-2 ${tabooReporting ? '' : 'opacity-50'}`}>
                      <div className="relative">
                        <input type="checkbox" checked={tabooVoting} onChange={handleTabooVotingToggle} disabled={!tabooReporting} className="sr-only peer" />
                        <div className={`w-10 h-6 rounded-full transition-colors ${tabooReporting ? 'bg-gray-700 peer-checked:bg-green-500' : 'bg-gray-800'}`}></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                      </div>
                      <span className={`text-sm font-medium ${tabooVoting && tabooReporting ? 'text-green-300' : 'text-gray-500'}`}>
                        <Check className="w-4 h-4 inline mr-1 text-green-300" />
                        <X className="w-4 h-4 inline mr-1 text-red-400" />
                        Voting
                      </span>
                    </label>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-2 text-center w-full">
                  {tabooReporting && tabooVoting
                    ? 'Reporting + voting enabled — confirmed taboos deduct points.'
                    : tabooReporting
                      ? 'Reporting enabled — reported words deduct points.'
                      : 'Taboo features disabled.'}
                </p>
              </div>

              {/* 2x2 layout but Number of Teams + Rounds share the top row */}
              <div className="w-full grid grid-cols-2 gap-3">
                <div className="col-span-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">Number of Teams:</span>
                    <div className="flex gap-2">
                      {(() => {
                        const activeCount = playAgainDefaulted ? 2 : lobbyTeamCount
                        return (
                          <>
                            <button
                              onClick={() => handleTeamCountChange(2)}
                              className={`px-3 py-1 rounded-lg font-semibold transition-all ${activeCount === 2 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                            >
                              2
                            </button>
                            <button
                              onClick={() => handleTeamCountChange(3)}
                              className={`px-3 py-1 rounded-lg font-semibold transition-all ${activeCount === 3 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                            >
                              3
                            </button>
                          </>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">Rounds:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => isHost && setSelectedRounds(6)}
                        disabled={!isHost}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all ${selectedRounds === 6 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'} ${!isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        6
                      </button>
                      <button
                        onClick={() => isHost && setSelectedRounds(12)}
                        disabled={!isHost}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all ${selectedRounds === 12 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'} ${!isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        12
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center w-full">
                  <div className="w-full max-w-[200px]">
                    <button
                      onClick={handleRandomizeTeams}
                      className="w-full px-4 py-2 glass-strong rounded-lg hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2 text-purple-400 border border-purple-500/20 whitespace-nowrap text-sm"
                    >
                      <Shuffle className="w-4 h-4" />
                      <span>Randomize Teams</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center w-full">
                  <div className="w-full max-w-[200px]">
                    <button
                      onClick={handleStartCaptainSelection}
                      className="w-full px-4 py-2 glass-strong rounded-lg hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2 text-yellow-300 border border-yellow-500/20 whitespace-nowrap text-sm"
                    >
                      <Crown className="w-4 h-4" />
                      <span>Team Division</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Word pack selector (mobile) */}
              <div className="w-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Selected Word Pack</span>
                  <div className="relative inline-block">
                    <button
                      onClick={() => setShowWordPackDropdown(!showWordPackDropdown)}
                      className={`inline-flex px-4 py-2 glass-strong rounded-lg border border-white/10 hover:border-white/20 transition-all shadow-xl items-center justify-between gap-2 text-sm text-left group`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${WORD_PACKS.find(p => p.key === selectedWordPack)?.color || 'from-blue-500 to-blue-600'} shadow-[0_0_10px_rgba(59,130,246,0.5)]`} />
                        <span className="font-bold whitespace-nowrap">
                          {WORD_PACKS.find(p => p.key === selectedWordPack)?.name || 'Select Pack'}
                        </span>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${showWordPackDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showWordPackDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 5, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute z-50 left-0 right-0 bg-black/70 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-[40vh] overflow-y-auto text-white"
                        >
                          {WORD_PACKS.map((pack) => (
                            <button
                              key={pack.key}
                              onClick={() => {
                                changeWordPack(pack.key)
                                setShowWordPackDropdown(false)
                              }}
                              className={`w-full p-4 text-left hover:bg-white/5 transition-colors flex flex-col gap-1 border-b border-white/5 last:border-0 ${selectedWordPack === pack.key ? 'bg-white/5' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`text-sm font-bold bg-gradient-to-r ${pack.color} bg-clip-text text-transparent`}>
                                  {pack.name}
                                </span>
                                {selectedWordPack === pack.key && (
                                  <Check className="w-4 h-4 text-green-500" />
                                )}
                              </div>
                              <span className="text-xs text-gray-400 leading-tight">{pack.description}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <p className="text-xs text-gray-500 italic max-w-md text-center px-4 truncate whitespace-nowrap">
                    {WORD_PACKS.find(p => p.key === selectedWordPack)?.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full max-w-4xl hidden md:grid grid-cols-1 md:grid-cols-3 items-center gap-6 md:gap-8">
              {/* Left: Number of Teams */}
              <div className="flex flex-col items-center md:items-end gap-3 min-w-0 justify-self-center md:justify-self-end">
                <div className="flex items-center gap-3 min-w-0 md:mt-6">
                  <span className="text-sm text-gray-400 whitespace-nowrap">Number of Teams:</span>
                  <div className="flex gap-2">
                    {(() => {
                      const activeCount = playAgainDefaulted ? 2 : lobbyTeamCount
                      return (
                        <>
                          <button
                            onClick={() => handleTeamCountChange(2)}
                            className={`px-3 py-1 rounded-lg font-semibold transition-all ${activeCount === 2 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                          >
                            2
                          </button>
                          <button
                            onClick={() => handleTeamCountChange(3)}
                            className={`px-3 py-1 rounded-lg font-semibold transition-all ${activeCount === 3 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                          >
                            3
                          </button>
                        </>
                      )
                    })()}
                  </div>
                  {/* Number of Rounds selector */}
                  <div className="ml-4 flex items-center gap-2">
                    <span className="text-sm text-gray-400 whitespace-nowrap">Rounds:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => isHost && setSelectedRounds(6)}
                        disabled={!isHost}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all ${selectedRounds === 6 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'} ${!isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        6
                      </button>
                      <button
                        onClick={() => isHost && setSelectedRounds(12)}
                        disabled={!isHost}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all ${selectedRounds === 12 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'} ${!isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        12
                      </button>
                    </div>
                  </div>
                </div>

                {/* Randomize Teams button moved under Teams/Rounds */}
                <div className="w-full max-w-[200px] mx-auto mt-4 md:mt-6">
                  <button
                    onClick={handleRandomizeTeams}
                    className="w-full px-4 py-2 glass-strong rounded-lg hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2 text-purple-400 border border-purple-500/20 whitespace-nowrap text-sm"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>Randomize Teams</span>
                  </button>
                </div>
              </div>

              {/* Center: Selected Word Pack (moved here) */}
              <div className="flex items-center justify-center justify-self-center">
                {isHost && (
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Selected Word Pack</span>
                    <div className="relative inline-block">
                      <button
                        onClick={() => setShowWordPackDropdown(!showWordPackDropdown)}
                        className={`inline-flex px-4 py-2 glass-strong rounded-lg border border-white/10 hover:border-white/20 transition-all shadow-xl items-center justify-between gap-2 text-sm text-left group`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${WORD_PACKS.find(p => p.key === selectedWordPack)?.color || 'from-blue-500 to-blue-600'} shadow-[0_0_10px_rgba(59,130,246,0.5)]`} />
                          <span className="font-bold whitespace-nowrap">
                            {WORD_PACKS.find(p => p.key === selectedWordPack)?.name || 'Select Pack'}
                          </span>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${showWordPackDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showWordPackDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 5, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute z-50 left-0 right-0 bg-black/70 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-[40vh] overflow-y-auto text-white"
                          >
                            {WORD_PACKS.map((pack) => (
                              <button
                                key={pack.key}
                                onClick={() => {
                                  changeWordPack(pack.key)
                                  setShowWordPackDropdown(false)
                                }}
                                className={`w-full p-4 text-left hover:bg-white/5 transition-colors flex flex-col gap-1 border-b border-white/5 last:border-0 ${selectedWordPack === pack.key ? 'bg-white/5' : ''}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-sm font-bold bg-gradient-to-r ${pack.color} bg-clip-text text-transparent`}>
                                    {pack.name}
                                  </span>
                                  {selectedWordPack === pack.key && (
                                    <Check className="w-4 h-4 text-green-500" />
                                  )}
                                </div>
                                <span className="text-xs text-gray-400 leading-tight">{pack.description}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className="text-xs text-gray-500 italic max-w-md text-center px-4 truncate whitespace-nowrap">
                      {WORD_PACKS.find(p => p.key === selectedWordPack)?.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Right: Taboo Features + description under it */}
              <div className="flex flex-col items-center md:items-start justify-self-center md:justify-self-start">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 whitespace-nowrap">Taboo Features:</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" checked={tabooReporting} onChange={handleTabooReportingToggle} className="sr-only peer" />
                        <div className="w-10 h-6 bg-gray-700 rounded-full peer peer-checked:bg-orange-500 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                      </div>
                      <span className={`text-sm font-medium ${tabooReporting ? 'text-orange-300' : 'text-gray-500'}`}>
                        <Flag className="w-4 h-4 inline mr-1 text-orange-300" />
                        Reporting
                      </span>
                    </label>

                    <label className={`flex items-center gap-2 ${tabooReporting ? '' : 'opacity-50'}`}>
                      <div className="relative">
                        <input type="checkbox" checked={tabooVoting} onChange={handleTabooVotingToggle} disabled={!tabooReporting} className="sr-only peer" />
                        <div className={`w-10 h-6 rounded-full transition-colors ${tabooReporting ? 'bg-gray-700 peer-checked:bg-green-500' : 'bg-gray-800'}`}></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                      </div>
                      <span className={`text-sm font-medium ${tabooVoting && tabooReporting ? 'text-green-300' : 'text-gray-500'}`}>
                        <Check className="w-4 h-4 inline mr-1 text-green-300" />
                        <X className="w-4 h-4 inline mr-1 text-red-400" />
                        Voting
                      </span>
                    </label>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center md:text-right max-w-md mt-1 mx-auto md:mx-0 truncate whitespace-nowrap">
                  {tabooReporting && tabooVoting
                    ? 'Reporting + voting enabled — confirmed taboos deduct points.'
                    : tabooReporting
                      ? 'Reporting enabled — reported words deduct points.'
                      : 'Taboo features disabled.'}
                </p>

                {/* Team Division button moved under Taboo toggles */}
                <div className="w-full mt-4 md:mt-6 max-w-[200px] mx-auto">
                  <button
                    onClick={handleStartCaptainSelection}
                    className="w-full px-4 py-2 glass-strong rounded-lg hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2 text-yellow-300 border border-yellow-500/20 whitespace-nowrap text-sm"
                  >
                    <Crown className="w-4 h-4" />
                    <span>Team Division</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show settings to non-hosts */}
        {!isHost && (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <span>Word Pack:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r ${WORD_PACKS.find(p => p.key === selectedWordPack)?.color || 'from-blue-500 to-blue-600'} text-white shadow-lg inline-block whitespace-nowrap`}>
                {WORD_PACKS.find(p => p.key === selectedWordPack)?.name || 'Standard'}
              </span>
            </div>

            {(tabooReporting || tabooVoting) && (
              <div className="flex items-center gap-3">
                <span>Features:</span>
                {tabooReporting && <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs flex items-center gap-1"><Flag className="w-3 h-3" /> Reporting</span>}
                {tabooVoting && <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs flex items-center gap-1"><Check className="w-3 h-3 text-green-300" /><X className="w-3 h-3 text-red-400" /> Voting</span>}
              </div>
            )}
          </div>
        )}

        {/* (duplicate host word pack removed) */}
      </motion.div>

      {/* Start Game Button (moved above teams) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center mb-6"
      >
        {/* Randomize button removed here (kept in the centered host-controls row) */}

        {isHost && (
          <button
            onClick={() => startGame(lobbyTeamCount, selectedRounds)}
            disabled={!canStart}
            className="px-8 md:px-12 py-3 md:py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-xl font-bold text-base md:text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2 md:gap-3 mx-auto"
          >
            <PlayCircle className="w-5 h-5 md:w-6 md:h-6" />
            Start Game
          </button>
        )}

        {!isHost && !isAdmin && (
          <div className="text-center text-gray-400">Waiting for host to start the game...</div>
        )}

        {!isHost && isHost === false && null}

        {!isHost && isHost === false && null}

      </motion.div>

      <div className={`grid ${lobbyTeamCount === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 md:gap-6 mb-6 md:mb-8`}>
        {/* Team 1 */}
        <motion.div
          key={0}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-strong rounded-2xl p-4 md:p-6 flex flex-col justify-between min-h-[300px] md:min-h-[400px] border-2 border-blue-500/30"
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-1">
                {editingTeamIndex === 0 ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      autoFocus
                      onFocus={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 min-w-0 px-3 py-1 rounded-lg bg-white/5 outline-none text-sm text-blue-400"
                      value={editingTeamName}
                      onChange={(e) => setEditingTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(0) }
                        else if (e.key === 'Escape') { setEditingTeamIndex(null); setEditingTeamName('') }
                      }}
                      placeholder="Team 1"
                    />
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleSaveEdit(0)} className="px-3 py-1 glass-strong rounded-lg text-sm text-green-300">Save</button>
                      <button onClick={() => { setEditingTeamIndex(null); setEditingTeamName('') }} className="px-3 py-1 glass rounded-lg text-sm text-gray-300">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <h2 className="text-xl md:text-2xl font-bold text-blue-400 flex items-center gap-2 min-w-0">
                    <span className="break-words max-w-full">{teamName(0, 'Team 1')}</span>
                    {(isAdmin || (players.find(p => p.name === playerName)?.isCaptain && myTeam === 0)) && <button title="Edit team name" onClick={() => { setEditingTeamIndex(0); setEditingTeamName(teamName(0, 'Team 1')) }} className="ml-1 p-1 rounded-md hover:bg-white/5 flex-shrink-0"><Edit3 className="w-4 h-4 text-gray-300" /></button>}
                  </h2>
                )}
              </div>
              <span className="text-gray-400 text-xs md:text-base flex-shrink-0 whitespace-nowrap">{team1.length} {team1.length === 1 ? 'player' : 'players'}</span>
            </div>

            <div className="space-y-2 md:space-y-3 mb-4">
              {team1.map((player) => (
                <div
                  key={player.id}
                  className={`glass rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3 ${player.name === playerName ? 'ring-2 ring-blue-400' : ''
                    }`}
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500 rounded-full flex items-center justify-center font-bold text-sm md:text-base">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-sm md:text-base flex items-center gap-2">
                    {player.name}
                    {player.isCaptain && <GraduationCap className="w-4 h-4 text-blue-400" />}
                  </span>
                  {player.name === playerName && <span className="text-blue-400 text-xs md:text-sm">(You)</span>}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => joinTeam(0)}
            disabled={myTeam === 0 || (teamSwitchingLocked && myTeam !== null) || (roomJoiningLocked && myTeam === null)}
            className={`w-full py-2.5 md:py-3 px-4 md:px-6 rounded-xl font-semibold transition-all transform text-sm md:text-base ${myTeam === 0
              ? 'bg-blue-500/50 cursor-not-allowed'
              : (teamSwitchingLocked && myTeam !== null)
                ? 'bg-gray-500/50 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 hover:scale-105'
              }`}
          >
            {myTeam === 0 ? 'Current Team' : (teamSwitchingLocked && myTeam !== null) ? 'Locked' : (roomJoiningLocked && myTeam === null) ? 'Room Locked' : `Join ${teamName(0, 'Team 1')}`}
          </button>
        </motion.div>

        {/* Team 2 */}
        <motion.div
          key={1}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-strong rounded-2xl p-4 md:p-6 flex flex-col justify-between min-h-[300px] md:min-h-[400px] border-2 border-red-500/30"
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-1">
                {editingTeamIndex === 1 ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      autoFocus
                      onFocus={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 min-w-0 px-3 py-1 rounded-lg bg-white/5 outline-none text-sm text-red-400"
                      value={editingTeamName}
                      onChange={(e) => setEditingTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(1) }
                        else if (e.key === 'Escape') { setEditingTeamIndex(null); setEditingTeamName('') }
                      }}
                      placeholder="Team 2"
                    />
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleSaveEdit(1)} className="px-3 py-1 glass-strong rounded-lg text-sm text-green-300">Save</button>
                      <button onClick={() => { setEditingTeamIndex(null); setEditingTeamName('') }} className="px-3 py-1 glass rounded-lg text-sm text-gray-300">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <h2 className="text-xl md:text-2xl font-bold text-red-400 flex items-center gap-2 min-w-0">
                    <span className="break-words max-w-full">{teamName(1, 'Team 2')}</span>
                    {(isAdmin || (players.find(p => p.name === playerName)?.isCaptain && myTeam === 1)) && <button title="Edit team name" onClick={() => { setEditingTeamIndex(1); setEditingTeamName(teamName(1, 'Team 2')) }} className="ml-1 p-1 rounded-md hover:bg-white/5 flex-shrink-0"><Edit3 className="w-4 h-4 text-gray-300" /></button>}
                  </h2>
                )}
              </div>
              <span className="text-gray-400 text-xs md:text-base flex-shrink-0 whitespace-nowrap">{team2.length} {team2.length === 1 ? 'player' : 'players'}</span>
            </div>

            <div className="space-y-2 md:space-y-3 mb-4">
              {team2.map((player) => (
                <div
                  key={player.id}
                  className={`glass rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3 ${player.name === playerName ? 'ring-2 ring-red-400' : ''
                    }`}
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500 rounded-full flex items-center justify-center font-bold text-sm md:text-base">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-sm md:text-base flex items-center gap-2">
                    {player.name}
                    {player.isCaptain && <GraduationCap className="w-4 h-4 text-red-400" />}
                  </span>
                  {player.name === playerName && <span className="text-red-400 text-xs md:text-sm">(You)</span>}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => joinTeam(1)}
            disabled={myTeam === 1 || (teamSwitchingLocked && myTeam !== null) || (roomJoiningLocked && myTeam === null)}
            className={`w-full py-2.5 md:py-3 px-4 md:px-6 rounded-xl font-semibold transition-all transform text-sm md:text-base ${myTeam === 1
              ? 'bg-red-500/50 cursor-not-allowed'
              : (teamSwitchingLocked && myTeam !== null)
                ? 'bg-gray-500/50 cursor-not-allowed'
                : 'bg-red-500 hover:bg-red-600 hover:scale-105'
              }`}
          >
            {myTeam === 1 ? 'Current Team' : (teamSwitchingLocked && myTeam !== null) ? 'Locked' : (roomJoiningLocked && myTeam === null) ? 'Room Locked' : `Join ${teamName(1, 'Team 2')}`}
          </button>
        </motion.div>

        {/* Team 3 (Only shown when lobbyTeamCount === 3) */}
        {lobbyTeamCount === 3 && (
          <motion.div
            key={2}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-strong rounded-2xl p-4 md:p-6 flex flex-col justify-between min-h-[300px] md:min-h-[400px] border-2 border-green-500/30"
          >
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-1">
                  {editingTeamIndex === 2 ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        autoFocus
                        onFocus={(e) => (e.target as HTMLInputElement).select()}
                        className="flex-1 min-w-0 px-3 py-1 rounded-lg bg-white/5 outline-none text-sm text-green-400"
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(2) }
                          else if (e.key === 'Escape') { setEditingTeamIndex(null); setEditingTeamName('') }
                        }}
                        placeholder="Team 3"
                      />
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => handleSaveEdit(2)} className="px-3 py-1 glass-strong rounded-lg text-sm text-green-300">Save</button>
                        <button onClick={() => { setEditingTeamIndex(null); setEditingTeamName('') }} className="px-3 py-1 glass rounded-lg text-sm text-gray-300">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <h2 className="text-xl md:text-2xl font-bold text-green-400 flex items-center gap-2 min-w-0">
                      <span className="break-words max-w-full">{teamName(2, 'Team 3')}</span>
                      {(isAdmin || (players.find(p => p.name === playerName)?.isCaptain && myTeam === 2)) && <button title="Edit team name" onClick={() => { setEditingTeamIndex(2); setEditingTeamName(teamName(2, 'Team 3')) }} className="ml-1 p-1 rounded-md hover:bg-white/5 flex-shrink-0"><Edit3 className="w-4 h-4 text-gray-300" /></button>}
                    </h2>
                  )}
                </div>
                <span className="text-gray-400 text-xs md:text-base flex-shrink-0 whitespace-nowrap">{team3.length} {team3.length === 1 ? 'player' : 'players'}</span>
              </div>

              <div className="space-y-2 md:space-y-3 mb-4">
                {team3.map((player) => (
                  <div
                    key={player.id}
                    className={`glass rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3 ${player.name === playerName ? 'ring-2 ring-green-400' : ''
                      }`}
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-green-500 rounded-full flex items-center justify-center font-bold text-sm md:text-base">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm md:text-base flex items-center gap-2">
                      {player.name}
                      {player.isCaptain && <GraduationCap className="w-4 h-4 text-green-400" />}
                    </span>
                    {player.name === playerName && <span className="text-green-400 text-xs md:text-sm">(You)</span>}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => joinTeam(2)}
              disabled={myTeam === 2 || (teamSwitchingLocked && myTeam !== null) || (roomJoiningLocked && myTeam === null)}
              className={`w-full py-2.5 md:py-3 px-4 md:px-6 rounded-xl font-semibold transition-all transform text-sm md:text-base ${myTeam === 2
                ? 'bg-green-500/50 cursor-not-allowed'
                : (teamSwitchingLocked && myTeam !== null)
                  ? 'bg-gray-500/50 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 hover:scale-105'
                }`}
            >
              {myTeam === 2 ? 'Current Team' : (teamSwitchingLocked && myTeam !== null) ? 'Locked' : (roomJoiningLocked && myTeam === null) ? 'Room Locked' : `Join ${teamName(2, 'Team 3')}`}
            </button>
          </motion.div>
        )}
      </div>

      {/* Unassigned Players */}
      {unassigned.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-xl p-4 mb-6"
        >
          <h3 className="text-lg font-semibold mb-3 text-gray-400">Waiting to join:</h3>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((player) => (
              <div key={player.id} className="glass rounded-lg px-4 py-2 text-sm">
                {player.name}
              </div>
            ))}
          </div>
        </motion.div>
      )}



      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="glass-strong rounded-2xl p-6 md:p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl md:text-2xl font-bold mb-4">Leave Lobby?</h3>
            <p className="text-gray-400 mb-6 text-sm md:text-base">
              Are you sure you want to leave? You'll need to rejoin with a new name.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 px-4 md:px-6 py-2.5 md:py-3 glass rounded-xl hover:bg-white/10 transition-colors text-sm md:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveGame}
                className="flex-1 px-4 md:px-6 py-2.5 md:py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-xl transition-colors font-semibold text-sm md:text-base"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Captain selection modal (admin selects captains) */}
      {captainModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="glass-strong rounded-3xl p-4 md:p-10 max-w-4xl w-full shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="inline-block p-4 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mb-4 shadow-lg"
              >
                <Crown className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-2xl md:text-3xl font-bold mb-2 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                Team Division
              </h3>
              <p className="text-gray-400 text-sm md:text-base">
                Choose one captain for each team
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
              {Array.from({ length: lobbyTeamCount }, (_, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`captain-selection-card p-6 rounded-2xl border-2 transition-all duration-300 ${idx === 0
                    ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/30 hover:border-blue-400/50'
                    : 'bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/30 hover:border-red-400/50'
                    }`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm ${idx === 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-red-500 to-red-700'
                      }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${idx === 0 ? 'text-blue-300' : 'text-red-300'}`}>
                        {teamName(idx, `Team ${idx + 1}`)}
                      </div>
                      <div className="text-sm text-gray-400">Captain</div>
                    </div>
                  </div>

                  <div className="selected-captain mb-4">
                    {selectedCaptains[idx] ? (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${idx === 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'
                          }`}
                      >
                        <Crown className="w-4 h-4" />
                        {players.find(p => p.id === selectedCaptains[idx])?.name}
                      </motion.div>
                    ) : previewCaptains?.[idx] ? (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${idx === 0 ? 'bg-blue-500/10 text-blue-300' : 'bg-red-500/10 text-red-300'
                          }`}
                      >
                        <Crown className="w-4 h-4" />
                        {previewCaptains[idx]}
                      </motion.div>
                    ) : (
                      <div className="text-sm text-gray-500 italic">No captain selected</div>
                    )}
                  </div>

                  {isHost ? (
                    <div className="player-buttons grid grid-cols-2 gap-2">
                      {players.map((p) => {
                        const alreadySelected = selectedCaptains.includes(p.id) && selectedCaptains[idx] !== p.id
                        const isSelected = selectedCaptains[idx] === p.id
                        return (
                          <motion.button
                            key={p.id}
                            disabled={alreadySelected}
                            onClick={() => {
                              const newSel = setSelectedCaptains((prev) => {
                                const copy = [...(prev || Array(lobbyTeamCount).fill(null))]
                                copy[idx] = p.id
                                return copy
                              })
                              // emit preview to others
                              try {
                                socket?.emit('admin-preview-captain', { roomCode, index: idx, playerId: p.id })
                              } catch (e) { }
                            }}
                            whileHover={!alreadySelected ? { scale: 1.05 } : {}}
                            whileTap={!alreadySelected ? { scale: 0.95 } : {}}
                            className={`player-btn px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${isSelected
                              ? idx === 0
                                ? 'bg-blue-500 text-white shadow-lg'
                                : 'bg-red-500 text-white shadow-lg'
                              : alreadySelected
                                ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                                : idx === 0
                                  ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20'
                                  : 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20'
                              }`}
                          >
                            {p.name}
                          </motion.button>
                        )
                      })}
                    </div>
                  ) : (
                    // non-hosts should not see selection controls
                    null
                  )}
                </motion.div>
              ))}
            </div>

            {isHost && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex gap-4 justify-center"
              >
                <button
                  onClick={() => {
                    // Emit cancel event so it closes for everyone
                    socket?.emit('admin-cancel-captain-selection', { roomCode })
                    setCaptainModalOpen(false)
                    setSelectedCaptains([])
                  }}
                  className="px-6 py-3 glass rounded-xl hover:bg-white/10 transition-colors font-medium"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={confirmCaptains}
                  disabled={!selectedCaptains.every(Boolean)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`px-8 py-3 rounded-xl font-bold transition-all duration-200 ${selectedCaptains.every(Boolean)
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black shadow-lg'
                    : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                    }`}
                >
                  Confirm Captains
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {/* Preview area for non-hosts to see interim captain picks */}
      {!isHost && !captainModalOpen && previewCaptains && previewCaptains.some(Boolean) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 w-full max-w-2xl mx-auto">
          <div className="glass-strong rounded-2xl p-4 flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-xs text-gray-400">Team 1 Captain</div>
              <div className="font-semibold text-blue-300">{previewCaptains[0] ? previewCaptains[0] : '—'}</div>
            </div>
            <div className="text-center text-gray-400">vs</div>
            <div className="text-center">
              <div className="text-xs text-gray-400">Team 2 Captain</div>
              <div className="font-semibold text-red-300">{previewCaptains[1] ? previewCaptains[1] : '—'}</div>
            </div>
          </div>
        </motion.div>
      )
      }

      {/* Draft modal (active picking) */}
      {/* Faceoff transition when captains are confirmed */}
      {
        faceoff && (
          <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-strong rounded-2xl p-8 md:p-12 text-center max-w-2xl w-full">
              <div className="flex items-center justify-center gap-8">
                <motion.div initial={{ y: -10 }} animate={{ y: [-10, 0, -10] }} transition={{ duration: 1.2, repeat: Infinity }} className="text-center">
                  <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">{faceoff.captains?.[0]?.charAt(0) || 'A'}</div>
                  <div className="text-blue-300 font-bold">{faceoff.captains?.[0] || 'Team 1'}</div>
                </motion.div>

                <motion.div initial={{ scale: 0.8 }} animate={{ scale: [0.9, 1.1, 0.9] }} transition={{ duration: 0.9, repeat: Infinity }} className="text-4xl font-extrabold text-yellow-400">VS</motion.div>

                <motion.div initial={{ y: 10 }} animate={{ y: [10, 0, 10] }} transition={{ duration: 1.2, repeat: Infinity }} className="text-center">
                  <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">{faceoff.captains?.[1]?.charAt(0) || 'B'}</div>
                  <div className="text-red-300 font-bold">{faceoff.captains?.[1] || 'Team 2'}</div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )
      }
      {
        draftState && !faceoff && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-strong rounded-2xl p-4 md:p-6 max-w-5xl w-full relative" onClick={(e) => e.stopPropagation()}>
              {/* Close button - top right, only for host */}
              {isHost && (
                <button
                  onClick={() => {
                    try {
                      socket?.emit('admin-cancel-captain-selection', { roomCode })
                    } catch (e) { }
                    setDraftState(null)
                  }}
                  className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors group z-10"
                  title="Close"
                >
                  <X className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                </button>
              )}
              <h3 className="text-xl md:text-2xl font-bold mb-4 text-center">Team Division</h3>
              {/* Coin flip view will display below; removed duplicate summary block for cleaner UI */}
              {/* Show coin flip UI during toss AND when showing result (until picking starts) */}
              {/* Don't show if lastPlayerChoice is active */}
              {draftState.captains && !draftState.currentCaptainId && !draftState.lastPlayerChoice ? (
                <div className="toss-container flex flex-col items-center gap-6 sm:gap-8 p-4 sm:p-6">
                  <h4 className="text-lg font-semibold text-center mb-4">Captains, get ready for the toss!</h4>

                  <div className="captains-row flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 md:gap-16">
                    <div className="captain-card text-center">
                      <div className="w-20 h-20 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                        {players.find(p => p.id === draftState.captains[0])?.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-blue-300 font-bold text-lg mb-1 break-words max-w-[150px] mx-auto">
                        {players.find(p => p.id === draftState.captains[0])?.name}
                      </div>
                      <div className="text-sm text-gray-400">{teamName(0, 'Team 1')}</div>
                      <div className="ready-status text-xs mb-3">
                        {draftState.ready?.[draftState.captains[0]] ? (
                          <span className="text-green-400 font-medium">✓ Ready</span>
                        ) : (
                          <span className="text-yellow-400">Not Ready</span>
                        )}
                      </div>
                      <button
                        onClick={() => captainReady()}
                        disabled={socket?.id !== draftState.captains[0]}
                        className={`ready-btn px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${draftState.ready?.[draftState.captains[0]]
                          ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                          } ${socket?.id !== draftState.captains[0] ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                      >
                        {draftState.ready?.[draftState.captains[0]] ? 'Unready' : 'Ready'}
                      </button>
                    </div>

                    <div className="coin-scene flex items-center justify-center">
                      <motion.div
                        className="coin"
                        animate={draftState.coinFlipInProgress ? {
                          rotateY: [0, 180, 360, 540, 720, 900, 1080, 1260, 1440, 1620, 1800, 1980, 2160, 2340, 2520],
                          y: [0, -30, -20, -35, -15, -30, -10, -25, -5, -20, 0, -15, 0, -10, 0],
                          x: [0, 5, -5, 8, -8, 5, -5, 3, -3, 2, -2, 1, -1, 0, 0],
                          scale: [1, 1.1, 1, 1.15, 1, 1.1, 1, 1.08, 1, 1.05, 1, 1.03, 1, 1.01, 1]
                        } : draftState.coinResult !== undefined ? {
                          // Ensure coin ends on the correct side: 0 = Blue (0deg), 1 = Red (180deg)
                          rotateY: draftState.coinResult === 0 ? 2520 : 2700, // 2520 = 7 full rotations (Blue), 2700 = 7.5 rotations (Red)
                          y: 0,
                          x: 0,
                          scale: 1
                        } : { rotateY: 0, y: 0, x: 0, scale: 1 }}
                        transition={draftState.coinFlipInProgress ? {
                          duration: 4.5,
                          ease: [0.43, 0.13, 0.23, 0.96], // Custom easing for realistic deceleration
                          times: [0, 0.067, 0.133, 0.2, 0.267, 0.333, 0.4, 0.467, 0.533, 0.6, 0.667, 0.733, 0.8, 0.867, 1]
                        } : draftState.coinResult !== undefined ? {
                          duration: 0.6,
                          ease: 'easeOut'
                        } : { duration: 0 }}
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        <div className="coin-face coin-front">
                          <div className="coin-text">BLUE</div>
                        </div>
                        <div className="coin-face coin-back">
                          <div className="coin-text">RED</div>
                        </div>
                      </motion.div>
                    </div>

                    <div className="captain-card text-center">
                      <div className="w-20 h-20 mx-auto mb-3 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                        {players.find(p => p.id === draftState.captains[1])?.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-red-300 font-bold text-lg mb-1 break-words max-w-[150px] mx-auto">
                        {players.find(p => p.id === draftState.captains[1])?.name}
                      </div>
                      <div className="text-sm text-gray-400">{teamName(1, 'Team 2')}</div>
                      <div className="ready-status text-xs mb-3">
                        {draftState.ready?.[draftState.captains[1]] ? (
                          <span className="text-green-400 font-medium">✓ Ready</span>
                        ) : (
                          <span className="text-yellow-400">Not Ready</span>
                        )}
                      </div>
                      <button
                        onClick={() => captainReady()}
                        disabled={socket?.id !== draftState.captains[1]}
                        className={`ready-btn px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${draftState.ready?.[draftState.captains[1]]
                          ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                          : 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                          } ${socket?.id !== draftState.captains[1] ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                      >
                        {draftState.ready?.[draftState.captains[1]] ? 'Unready' : 'Ready'}
                      </button>
                    </div>
                  </div>

                  <div className="toss-instruction text-center">
                    {draftState.coinFlipInProgress ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-yellow-400 font-medium text-lg"
                      >
                        🪙 Flipping the coin...
                      </motion.div>
                    ) : draftState.coinResult !== undefined ? (
                      <div className="flex flex-col items-center gap-4">
                        {/* Winning Team Banner */}
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                          className={`px-8 py-6 rounded-2xl shadow-2xl ${draftState.coinResult === 0
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 border-2 border-blue-400'
                            : 'bg-gradient-to-r from-red-600 to-red-500 border-2 border-red-400'
                            }`}
                        >
                          <div className="text-2xl md:text-3xl font-bold">
                            {players.find(p => p.id === draftState.captains?.[draftState.coinResult])?.name} WINS!
                          </div>
                        </motion.div>

                        {/* Picks first text - outside the box */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="text-lg text-gray-300 mt-4"
                        >
                          {draftState.coinResult === 0 ? teamName(0, 'Team 1') : teamName(1, 'Team 2')} picks first
                        </motion.div>

                        {/* Continue Button - Only for Host */}
                        {isHost && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 1.2 }}
                            onClick={continueToDraft}
                            className="mt-2 px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
                          >
                            Continue to Team Selection
                          </motion.button>
                        )}

                        {/* Waiting message for non-hosts */}
                        {!isHost && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.2 }}
                            className="text-gray-400 text-sm mt-2"
                          >
                            Waiting for host to continue...
                          </motion.div>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-300 text-sm">
                        Both captains must be ready to flip the coin
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="draft-phase-container">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                  >
                    <h4 className="text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-red-400 bg-clip-text text-transparent">Team Selection</h4>
                    <p className="text-gray-300 text-base md:text-lg">
                      {draftState.currentCaptainName ? (
                        <span>
                          <span className="font-bold text-yellow-400">{draftState.currentCaptainName}</span>
                          <span className="text-gray-400"> is picking...</span>
                        </span>
                      ) : draftState.lastPlayerChoice ? (
                        <span>
                          <span className="font-bold text-purple-400">{draftState.lastPlayerChoice.playerName}</span>
                          <span className="text-gray-400"> is choosing their team...</span>
                        </span>
                      ) : (
                        'Waiting for captains...'
                      )}
                    </p>
                  </motion.div>

                  <div className="draft-content grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Teams Section */}
                    <div className="teams-section">
                      <h5 className="text-lg font-semibold mb-4 text-gray-300">Teams</h5>
                      <div className="space-y-4">
                        {draftState.teams?.map((t: any, i: number) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`team-card p-4 rounded-xl border-2 transition-all duration-300 ${i === 0
                              ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/30'
                              : 'bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/30'
                              } ${draftState.currentCaptainId === draftState.captains?.[i] ? 'ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-400/20' : ''}`}
                          >
                            <div className="flex items-center gap-3 mb-4">
                              <div className="relative">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-lg ${i === 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-red-500 to-red-700'
                                  }`}>
                                  {i + 1}
                                </div>
                                {/* Crown on winning captain's team badge */}
                                {draftState.coinResult === i && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 200 }}
                                    className="absolute -top-2 -right-2"
                                  >
                                    <motion.div
                                      animate={{ scale: [1, 1.15, 1] }}
                                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                      <Crown className="w-6 h-6 text-yellow-400 drop-shadow-lg" style={{ filter: 'drop-shadow(0 0 4px rgba(250, 204, 21, 0.6))' }} />
                                    </motion.div>
                                  </motion.div>
                                )}
                              </div>
                              <div className="flex-1">
                                <div className={`text-lg font-bold ${i === 0 ? 'text-blue-300' : 'text-red-300'}`}>
                                  {teamName(i, `Team ${i + 1}`)}
                                </div>
                                {/* Removed captain name - it's shown in the Captain badge below */}
                              </div>
                            </div>

                            <div className="players-list space-y-2 min-h-[100px]">
                              {t.players.map((playerName: string, idx: number) => (
                                <motion.div
                                  key={playerName}
                                  initial={{ opacity: 0, scale: 0.8, x: -10 }}
                                  animate={{ opacity: 1, scale: 1, x: 0 }}
                                  transition={{ delay: idx * 0.1, type: 'spring', stiffness: 200 }}
                                  className="player-item flex items-center gap-3 p-3 rounded-lg bg-white/10 hover:bg-white/15 transition-all duration-200 border border-white/5"
                                >
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-md ${i === 0 ? 'bg-gradient-to-br from-blue-600 to-blue-800 text-white' : 'bg-gradient-to-br from-red-600 to-red-800 text-white'
                                    }`}>
                                    {playerName.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-sm font-medium text-white">{playerName}</span>
                                  {/* Show if this is the captain */}
                                  {playerName === players.find(p => p.id === draftState.captains?.[i])?.name && (
                                    <span className="ml-auto" title="Captain">
                                      <GraduationCap className={`w-5 h-5 ${i === 0 ? 'text-blue-400' : 'text-red-400'}`} />
                                    </span>
                                  )}
                                </motion.div>
                              ))}
                            </div>

                            {t.players.length === 0 && (
                              <div className="text-sm text-gray-500 italic text-center py-6 font-medium bg-white/5 rounded-lg border border-dashed border-white/10">
                                No players picked yet
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Available Players Section */}
                    <div className="available-players-section">
                      <h5 className="text-lg font-semibold mb-4 text-gray-300">Available Players</h5>

                      {draftState.lastPlayerChoice && draftState.lastPlayerChoice.playerId === socket?.id ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="last-player-choice p-6 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/30"
                        >
                          <div className="text-center mb-4">
                            <div className="text-lg font-bold text-purple-300 mb-2">You're the Last Player!</div>
                            <div className="text-gray-300 font-medium">Choose which team to join:</div>
                          </div>
                          <div className="flex justify-center gap-4">
                            {Array.from({ length: (lobbyTeamCount || 2) }).map((_, ti) => (
                              <motion.button
                                key={ti}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => chooseTeamAsLastPlayer(ti)}
                                className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${ti === 0
                                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
                                  } shadow-lg`}
                              >
                                Join {teamName(ti, `Team ${ti + 1}`)}
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      ) : draftState.lastPlayerChoice ? (
                        <div className="text-center p-6 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/30">
                          <div className="text-lg font-bold text-purple-300 mb-2">Waiting for Last Player</div>
                          <div className="text-gray-300 font-medium">{draftState.lastPlayerChoice.playerName} is choosing their team...</div>
                        </div>
                      ) : (
                        <div className="players-grid grid grid-cols-1 gap-4 max-h-[400px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                          {draftState.availablePlayers?.map((p: any) => (
                            <motion.div
                              key={p.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 200 }}
                              className="player-card flex items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-600/30 hover:border-gray-500/50 transition-all duration-200 shadow-md"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-lg">
                                  {p.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-white text-base">{p.name}</div>
                                  <div className="text-xs text-gray-400">Available</div>
                                </div>
                              </div>

                              {draftState.currentCaptainId === socket?.id ? (
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    pickPlayer(p.id)
                                  }}
                                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-lg transition-all duration-200 shadow-md"
                                >
                                  Pick
                                </motion.button>
                              ) : (
                                <div className="text-xs text-gray-500 px-3 py-1 bg-gray-700/50 rounded-lg font-medium">
                                  {draftState.currentCaptainId ? 'Waiting...' : 'Preparing...'}
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {(!draftState.availablePlayers || draftState.availablePlayers.length === 0) && !draftState.lastPlayerChoice && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center py-8 text-gray-400"
                        >
                          <div className="text-lg mb-2 font-semibold">🎉 Team Division Complete!</div>
                          <div className="font-medium">All players have been assigned to teams.</div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Removed bottom close button - now in top-right corner */}
            </div>
          </div>
        )
      }
    </div >
  )
}
