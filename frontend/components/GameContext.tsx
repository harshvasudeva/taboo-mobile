'use client'

import { useRouter } from 'next/navigation'
import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

// Temporarily silence noisy client-side console.log output in the browser.
// Keeps console.warn and console.error intact for visibility.
if (typeof window !== 'undefined' && window.console) {
  try {
    window.console.log = () => { }
  } catch (e) {
    // ignore — best-effort
  }
}

interface Player {
  id: string
  name: string
  team: number | null
  showInWaiting?: boolean
  isCaptain?: boolean
}

interface WordObject {
  word: string
  taboo: string[]
  difficulty: string
  points: number
  rare?: string
}

interface Team {
  name: string
  players: string[]
  score: number
}

interface GameState {
  teams: Team[]
  teamCount: number
  currentTeamIndex: number
  currentDescriberIndex: number[]
  round: number
  maxRounds: number
  turnTime: number
  timeRemaining: number
  currentWords: WordObject[]
  guessedWords: WordObject[]
  skippedWords: WordObject[]
  playerContributions: Record<string, { points: number; guessedWords?: string[]; describedWords?: string[]; words?: string[] }>
  coAdmins?: string[] // List of co-admin player names
  tabooReporting?: boolean // Enable taboo reporting feature
  tabooVoting?: boolean // Enable taboo voting feature
  confirmedTaboosByTeam?: Record<number, number> // Track taboo point deductions per team
  gameStarted?: boolean
}

interface Notification {
  message: string
  type: 'info' | 'warning' | 'success'
  id?: string
}

interface GameContextType {
  socket: Socket | null
  roomCode: string | null
  playerName: string | null
  isHost: boolean
  isAdmin: boolean // true if host or co-admin
  isReconnecting: boolean // true while attempting to reconnect to a session
  myTeam: number | null
  currentScreen: 'room' | 'lobby' | 'game' | 'gameover'
  players: Player[]
  gameState: GameState
  connected: boolean
  notification: Notification | null
  notifications: Notification[]
  teamSwitchingLocked: boolean
  roomJoiningLocked: boolean
  lobbyTeamCount: number
  tabooReporting: boolean
  tabooVoting: boolean
  teamStats: { wins: number[]; ties: number[]; losses: number[]; streaks: number[] }
  setTabooSettings: (reporting: boolean, voting: boolean) => void
  setNotification: (notification: Notification | null) => void
  setPlayerName: (name: string) => void
  createRoom: (name: string, wordPack?: string) => void
  joinRoom: (code: string, name: string) => void
  joinTeam: (teamIndex: number) => void
  startGame: (teamCount?: number, maxRounds?: number) => void
  leaveGame: () => void
  setCurrentScreen: (screen: 'room' | 'lobby' | 'game' | 'gameover') => void
  submitWordFeedback: (word: string, feedback: string, difficulty: string) => void
  playAgainProcessing: boolean
  gamesPlayed: number
  playAgainDefaulted: boolean
  localPlayerPlayAgain: () => void
  selectedWordPack: string
  changeWordPack: (pack: string) => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

export function GameProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false) // true if host or co-admin
  const [myTeam, setMyTeam] = useState<number | null>(null)
  const [currentScreen, setCurrentScreen] = useState<'room' | 'lobby' | 'game' | 'gameover'>('room')
  const [isReconnecting, setIsReconnecting] = useState(false) // Show loading during reconnection
  const [players, setPlayers] = useState<Player[]>([])
  const [teamSwitchingLocked, setTeamSwitchingLocked] = useState(false)
  const [roomJoiningLocked, setRoomJoiningLocked] = useState(false)
  const [midTurnJoinData, setMidTurnJoinData] = useState<any>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const notification = notifications.length > 0 ? notifications[0] : null

  // Custom notification setter that supports stacking
  const setNotification = (notif: Notification | null) => {
    if (!notif) return
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
    const newNotif = { ...notif, id }
    setNotifications(prev => [...prev, newNotif])

    // Auto-remove after 4.5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4500)
  }
  const [lobbyTeamCount, setLobbyTeamCount] = useState(2) // Track team count in lobby
  const [tabooReporting, setTabooReporting] = useState(false) // Taboo reporting off by default
  const [tabooVoting, setTabooVoting] = useState(false) // Taboo voting off by default
  const wasKicked = useRef(false)
  const playerNameRef = useRef<string | null>(null)
  useEffect(() => { playerNameRef.current = playerName }, [playerName])

  const router = useRouter()
  const ignoreGameOverUntil = useRef<number>(0)
  const [playAgainProcessing, setPlayAgainProcessing] = useState(false)
  const [gamesPlayed, setGamesPlayed] = useState<number>(0)
  const [playAgainDefaulted, setPlayAgainDefaulted] = useState(false)
  const [selectedWordPack, setSelectedWordPack] = useState('standard')
  const [teamStats, setTeamStats] = useState<{ wins: number[]; ties: number[]; losses: number[]; streaks: number[] }>({ wins: [0, 0], ties: [0, 0], losses: [0, 0], streaks: [0, 0] })
  const [gameState, setGameState] = useState<GameState>({
    teams: [
      { name: 'Team 1', players: [], score: 0 },
      { name: 'Team 2', players: [], score: 0 }
    ],
    teamCount: 2,
    currentTeamIndex: 0,
    currentDescriberIndex: [0, 0],
    round: 1,
    maxRounds: 12,
    turnTime: 60,
    timeRemaining: 60,
    currentWords: [],
    guessedWords: [],
    skippedWords: [],
    playerContributions: {},
    gameStarted: false
  })

  // Helper: reset all local room-scoped state to a fresh default
  const resetLocalRoomState = () => {
    setPlayers([])
    setMyTeam(null)
    setCurrentScreen('room')
    setLobbyTeamCount(2)
    setTeamStats({ wins: [0, 0], ties: [0, 0], losses: [0, 0], streaks: [0, 0] })
    setGameState({
      teams: [
        { name: 'Team 1', players: [], score: 0 },
        { name: 'Team 2', players: [], score: 0 }
      ],
      teamCount: 2,
      currentTeamIndex: 0,
      currentDescriberIndex: [0, 0],
      round: 1,
      maxRounds: 12,
      turnTime: 60,
      timeRemaining: 60,
      currentWords: [],
      guessedWords: [],
      skippedWords: [],
      playerContributions: {},
    } as GameState)
    setRoomJoiningLocked(false)
    setTeamSwitchingLocked(false)
    setTabooReporting(false)
    setTabooVoting(false)
  }

  // When this client initiates a play-again or starts a game, suppress lock/unlock notifications
  // for a short window so the admin/host who triggered the automatic reset doesn't see them.
  const suppressLockNotificationsUntil = useRef<number>(0)

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

    // Keep Render service warm by pinging /health every 3.5 minutes.
    if (!/onrender\.com/i.test(serverUrl)) return

    const pingServer = () => {
      fetch(`${serverUrl}/health`, { cache: 'no-store' }).catch(() => { })
    }

    pingServer()
    const intervalId = window.setInterval(pingServer, 210000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    console.log('Connecting to server:', serverUrl)

    // Generate or retrieve session ID
    let sessionId = localStorage.getItem('taboo_session_id')
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('taboo_session_id', sessionId)
    }

    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true, // Force new connection each time
    })

    // Check if there's a stored session before connecting
    const storedRoomCode = localStorage.getItem('taboo_room_code')
    const storedPlayerName = localStorage.getItem('taboo_player_name')
    const storedSessionId = localStorage.getItem('taboo_session_id')
    const hasStoredSession = storedRoomCode && storedPlayerName && storedSessionId

    // If there's a stored session, show reconnecting state
    if (hasStoredSession) {
      setIsReconnecting(true)
    }

    newSocket.on('connect', () => {
      console.log('✅ Connected to server, Socket ID:', newSocket.id)
      setConnected(true)

      // Attempt auto-reconnect if we have stored session
      if (hasStoredSession) {
        console.log('🔄 Attempting to reconnect to room:', storedRoomCode)
        newSocket.emit('reconnect-session', {
          roomCode: storedRoomCode,
          playerName: storedPlayerName,
          sessionId: storedSessionId
        })
      }
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setConnected(false)
    })

    // Handle successful reconnection
    newSocket.on('reconnect-success', (data) => {
      console.log('✅ Reconnected to room:', data.roomCode)
      wasKicked.current = false
      setRoomCode(data.roomCode)
      setPlayers(data.room.players)
      setIsHost(data.isHost)
      setIsAdmin(data.isHost || data.isCoAdmin)
      setPlayerName(data.playerName)
      setIsReconnecting(false) // Clear reconnecting state

      // Restore team
      const currentPlayer = data.room.players.find((p: any) => p.id === newSocket.id)
      if (currentPlayer) {
        setMyTeam(currentPlayer.team)
      }

      // Restore taboo settings
      if (data.tabooReporting !== undefined) {
        setTabooReporting(data.tabooReporting)
      }
      if (data.tabooVoting !== undefined) {
        setTabooVoting(data.tabooVoting)
      }

      // Restore game state
      if (data.gameState) {
        setGameState(data.gameState)
        setLobbyTeamCount(data.gameState.teamCount || 2)
        setCurrentScreen(data.room.started ? 'game' : 'lobby')

        // Dispatch custom event with full reconnection data for GameScreen (if game is started)
        if (data.room.started) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('session-reconnected', {
              detail: {
                roundHistory: data.roundHistory || [],
                gameState: data.gameState,
                tabooReporting: data.tabooReporting,
                tabooVoting: data.tabooVoting,
                turnInProgress: data.gameState?.turnActive && data.gameState?.currentWords?.length > 0,
                currentWords: data.gameState?.currentWords || [],
                timeRemaining: data.gameState?.timeRemaining,
                currentTurnGuessedWords: data.gameState?.currentTurnGuessedWords || [],
                currentTurnWrongGuesses: data.gameState?.currentTurnWrongGuesses || [],
                guessedByPlayer: data.gameState?.guessedByPlayer || [],
              }
            }))
          }, 100)
        }
      } else {
        setCurrentScreen('lobby')
      }

      setNotification({ message: 'Reconnected to game!', type: 'success' })
      setTimeout(() => setNotification(null), 3000)
      // Restore games played counter if provided
      if (data?.gamesPlayed !== undefined) {
        setGamesPlayed(data.gamesPlayed)
      }
      // Restore team stats if provided
      if (data?.room?.teamStats) {
        setTeamStats(data.room.teamStats)
      }
    })

    // Handle failed reconnection (room no longer exists)
    newSocket.on('reconnect-failed', (data) => {
      console.log('❌ Reconnection failed:', data?.message)
      // Clear stored session
      localStorage.removeItem('taboo_room_code')
      localStorage.removeItem('taboo_player_name')
      setIsReconnecting(false) // Clear reconnecting state

      // Clear local room state
      setRoomCode(null)
      setPlayers([])
      setIsHost(false)
      setIsAdmin(false)
      setMyTeam(null)
      setCurrentScreen('room')

      setNotification({ message: data?.message || 'Could not reconnect to room', type: 'warning' })
      setTimeout(() => setNotification(null), 4000)

      // Redirect user to home to avoid being stuck on a stale screen
      try {
        router.push('/')
      } catch (e) {
        // router may be unavailable in some environments; ignore
      }
    })

    newSocket.on('room-created', (data) => {
      wasKicked.current = false
      console.log(`📦 Room created! Room: ${data.roomCode}, Socket ID: ${newSocket.id}`)
      setRoomCode(data.roomCode)
      setPlayers(data.room.players)
      setIsHost(true)
      setIsAdmin(true) // Host is always admin
      // Save session info
      localStorage.setItem('taboo_room_code', data.roomCode)
      if (playerName) localStorage.setItem('taboo_player_name', playerName)
      // Set initial team count from room
      if (data.room.teamCount) {
        setLobbyTeamCount(data.room.teamCount)
      }
      // Reset gameState team names for a newly created room so previous room names don't persist
      const newTeamCount = data.room.teamCount || 2
      const resetTeams = Array.from({ length: newTeamCount }).map((_, i) => ({ name: `Team ${i + 1}`, players: [], score: 0 }))
      setGameState((prev) => ({
        ...prev,
        teams: resetTeams,
        teamCount: newTeamCount
      } as any))
      // Set games played counter
      if (data.room?.gamesPlayed !== undefined) setGamesPlayed(data.room.gamesPlayed || 0)
      // Set word pack
      if (data.room?.wordPack) setSelectedWordPack(data.room.wordPack)
      // Set team stats
      if (data.room?.teamStats) setTeamStats(data.room.teamStats)
      // Set room joining lock state if provided
      if (data.room?.joiningLocked !== undefined) setRoomJoiningLocked(!!data.room.joiningLocked)
      // Find this player's team assignment
      const currentPlayer = data.room.players.find((p: any) => p.id === newSocket.id)
      if (currentPlayer) {
        setMyTeam(currentPlayer.team)
      }
      setCurrentScreen('lobby')
    })

    newSocket.on('room-joined', (data) => {
      wasKicked.current = false
      console.log(`📦 Joined room! Room: ${data.roomCode}, Socket ID: ${newSocket.id}`)
      setRoomCode(data.roomCode)
      setPlayers(data.room.players)
      setIsHost(false) // Joining player is not the host
      setIsAdmin(data.isCoAdmin || false) // Check if rejoining as co-admin
      // Save session info
      localStorage.setItem('taboo_room_code', data.roomCode)
      if (playerName) localStorage.setItem('taboo_player_name', playerName)
      // Set lobby team count from server
      if (data.teamCount) {
        setLobbyTeamCount(data.teamCount)
      }
      // Set games played counter
      if (data.room?.gamesPlayed !== undefined) setGamesPlayed(data.room.gamesPlayed || 0)
      // Set team stats
      if (data.room?.teamStats) setTeamStats(data.room.teamStats)
      // Set room joining lock state if provided
      if (data.room?.joiningLocked !== undefined) setRoomJoiningLocked(!!data.room.joiningLocked)
      // Set taboo settings from server
      if (data.tabooReporting !== undefined) {
        setTabooReporting(data.tabooReporting)
      }
      if (data.tabooVoting !== undefined) {
        setTabooVoting(data.tabooVoting)
      }
      // Set word pack
      if (data.room?.wordPack) setSelectedWordPack(data.room.wordPack)
      // Find this player's team assignment
      const currentPlayer = data.room.players.find((p: any) => p.id === newSocket.id)
      if (currentPlayer) {
        setMyTeam(currentPlayer.team)
      }
      setCurrentScreen('lobby')
    })

    newSocket.on('room-joined-midgame', (data) => {
      setRoomCode(data.roomCode)
      setPlayers(data.room.players)
      setGameState(data.gameState)
      setIsHost(false)
      setIsAdmin(data.isCoAdmin || false) // Check if rejoining as co-admin
      // Save session info
      localStorage.setItem('taboo_room_code', data.roomCode)
      if (playerName) localStorage.setItem('taboo_player_name', playerName)
      // Set team count from game state or data
      if (data.teamCount) {
        setLobbyTeamCount(data.teamCount)
      } else if (data.gameState?.teamCount) {
        setLobbyTeamCount(data.gameState.teamCount)
      }
      // Set room joining lock state if provided
      if (data.room?.joiningLocked !== undefined) setRoomJoiningLocked(!!data.room.joiningLocked)
      setCurrentScreen('lobby') // Show lobby so they can pick a team
    })

    newSocket.on('room-rejoined', (data) => {
      console.log('[ROOM-REJOINED] Full data received:', data)
      setRoomCode(data.roomCode)
      setPlayers(data.room.players)
      setGameState(data.gameState)
      // Restore games played counter
      if (data.room?.gamesPlayed !== undefined) setGamesPlayed(data.room.gamesPlayed || 0)
      // Restore team stats
      if (data.room?.teamStats) setTeamStats(data.room.teamStats)
      // Set room joining lock state if provided
      if (data.room?.joiningLocked !== undefined) setRoomJoiningLocked(!!data.room.joiningLocked)
      // Find player's team
      const player = data.room.players.find((p: any) => p.id === newSocket.id)
      if (player) {
        setMyTeam(player.team)
      }
      // Sync taboo settings
      if (data.tabooReporting !== undefined) {
        setTabooReporting(data.tabooReporting)
      }
      if (data.tabooVoting !== undefined) {
        setTabooVoting(data.tabooVoting)
      }
      // Set word pack
      if (data.room?.wordPack) setSelectedWordPack(data.room.wordPack)
      setCurrentScreen('game')
      setNotification({ message: 'Reconnected to game!', type: 'success' })
      setTimeout(() => setNotification(null), 3000)

      // Dispatch custom event with full reconnection data for GameScreen
      // Use setTimeout to ensure GameScreen has mounted first
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('session-reconnected', {
          detail: {
            roundHistory: data.roundHistory || [],
            gameState: data.gameState,
            tabooReporting: data.tabooReporting,
            tabooVoting: data.tabooVoting,
            turnInProgress: data.gameState?.turnActive && data.gameState?.currentWords?.length > 0,
            currentWords: data.gameState?.currentWords || [],
            timeRemaining: data.gameState?.timeRemaining,
            currentTurnGuessedWords: data.gameState?.currentTurnGuessedWords || [],
            currentTurnWrongGuesses: data.gameState?.currentTurnWrongGuesses || [],
            guessedByPlayer: data.gameState?.guessedByPlayer || [],
          }
        }))
      }, 100)
    })

    newSocket.on('player-joined', (data) => {
      setPlayers(data.room.players)
      // Sync team count for existing players when someone new joins
      if (data.teamCount) {
        setLobbyTeamCount(data.teamCount)
      }
    })

    newSocket.on('team-count-changed', (data) => {
      console.log('team-count-changed received:', data.teamCount)
      setLobbyTeamCount(data.teamCount)
    })

    newSocket.on('taboo-settings-changed', (data) => {
      console.log('taboo-settings-changed received:', data)
      setTabooReporting(data.tabooReporting)
      setTabooVoting(data.tabooVoting)
    })

    newSocket.on('word-pack-changed', (data) => {
      console.log('word-pack-changed received:', data)
      setSelectedWordPack(data.wordPack)
    })

    newSocket.on('player-joined-midgame', (data) => {
      setPlayers(data.room.players)
      // Notify existing players
      if (data.player.name !== playerName) {
        // Show notification for other players
        console.log(`${data.player.name} joined the game`)
      }
    })

    newSocket.on('player-reconnected', (data) => {
      setPlayers(data.room.players)
      console.log(`${data.playerName} reconnected`)
    })

    newSocket.on('player-left', (data) => {
      setPlayers(data.room.players)
      // Update game state if provided (during active game)
      if (data.gameState) {
        setGameState(data.gameState)
      }
    })

    newSocket.on('host-changed', (data) => {
      setPlayers(data.room.players)
      // Update isHost status for the new host
      const isNewHost = data.hostId === newSocket.id
      setIsHost(isNewHost)
      // Ensure admin state follows host status (host is always admin)
      setIsAdmin(isNewHost)
      console.log(`New host: ${data.newHost}`)
      if (isNewHost) {
        setNotification({ message: 'You are now the host of the room!', type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    newSocket.on('team-updated', (data) => {
      console.log('🔄 team-updated event received:', data)
      setPlayers(data.room.players)
      // Sync lock state from server to avoid UI misalignment
      if (data.room?.joiningLocked !== undefined) setRoomJoiningLocked(!!data.room.joiningLocked)
      if (data.room?.teamSwitchingLocked !== undefined) setTeamSwitchingLocked(!!data.room.teamSwitchingLocked)
      // Update myTeam based on current player's team assignment from server
      const currentPlayer = data.room.players.find((p: any) => p.id === newSocket.id)
      if (currentPlayer) {
        setMyTeam(currentPlayer.team)
      }
      // Show notification if provided
      if (data.message) {
        console.log('Setting notification:', data.message)
        setNotification({ message: data.message, type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    newSocket.on('team-updated-midgame', (data) => {
      console.log('🔄 team-updated-midgame event received:', data)
      // Sync lock state early to keep buttons/UI consistent
      if (data.room?.joiningLocked !== undefined) setRoomJoiningLocked(!!data.room.joiningLocked)
      if (data.room?.teamSwitchingLocked !== undefined) setTeamSwitchingLocked(!!data.room.teamSwitchingLocked)
      setPlayers(data.room.players)
      setGameState(data.gameState)

      // Show notification if provided (for team randomization)
      if (data.message) {
        console.log('Setting notification:', data.message)
        setNotification({ message: data.message, type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }

      // If this is the player who just joined
      const player = data.room.players.find((p: any) => p.id === newSocket.id)
      if (player && player.name === data.joinedPlayer) {
        setMyTeam(player.team)

        // Store mid-turn data if there's an active turn
        if (data.turnInProgress) {
          console.log(`Joined ${data.joinedTeam} mid-turn! Storing turn data...`)
          setMidTurnJoinData(data)

          // Navigate to game screen
          setCurrentScreen('game')

          // After a small delay, dispatch a custom event for GameScreen to catch
          setTimeout(() => {
            console.log('📢 Dispatching midturn-sync event for GameScreen')
            const event = new CustomEvent('midturn-sync', { detail: data })
            window.dispatchEvent(event)
          }, 150)
        } else {
          console.log(`Joined ${data.joinedTeam}. Game in progress.`)
          setCurrentScreen('game')
        }
      } else {
        // Notify other players
        console.log(`${data.joinedPlayer} joined ${data.joinedTeam}`)
      }
    })

    newSocket.on('game-started', (data) => {
      console.log(`🎮 Game started! Socket ID: ${newSocket.id}`)
      // If server provided persisted teamNames, merge them into gameState before setting
      if (data?.room?.teamNames && data.gameState && Array.isArray(data.gameState.teams)) {
        const merged = { ...data.gameState }
        merged.teams = merged.teams.map((t: any, idx: number) => ({ ...t, name: data.room.teamNames[idx] || t.name }))
        setGameState(merged)
      } else {
        setGameState(data.gameState)
      }
      // If server provided room/player info, sync admin/host state immediately
      if (data.room) {
        if (data.room.players) setPlayers(data.room.players)
        if (data.room.teamStats) setTeamStats(data.room.teamStats)
        if (data.room.gamesPlayed !== undefined) setGamesPlayed(data.room.gamesPlayed)
        const isNowHost = data.room.host === newSocket.id
        setIsHost(isNowHost)
        setIsAdmin(isNowHost || (data.room.coAdmins && data.room.coAdmins.includes(newSocket.id)))
      }

      // Only switch screen if we are in the lobby or if we are already assigned to a team in the new game
      // This prevents players still on the GameOverScreen from being forced into the game
      setCurrentScreen(prev => {
        const isPlayerOnAnyTeam = data.gameState.teams.some((t: any) =>
          t.players.some((p: string) => p === playerNameRef.current)
        )
        if (prev === 'lobby' || isPlayerOnAnyTeam) {
          return 'game'
        }
        return prev
      })
    })

    newSocket.on('third-team-added', (data) => {
      console.log('🟢 third-team-added event received:', data)
      setGameState(data.gameState)
      setLobbyTeamCount(3)
      if (data.room) {
        setPlayers(data.room.players)
        if (data.room.teamStats) setTeamStats(data.room.teamStats)
      }
      // Don't set notification here - let the game-state-updated handler do it
      // or handle notification display in the component that needs it
    })

    newSocket.on('third-team-removed', (data) => {
      console.log('🔴 third-team-removed event received:', data)
      setGameState(data.gameState)
      setLobbyTeamCount(2)
      setPlayers(data.room.players)
      if (data.room?.teamStats) setTeamStats(data.room.teamStats)
      // Update myTeam if I was on Team 3
      const currentPlayer = data.room.players.find((p: any) => p.id === newSocket.id)
      if (currentPlayer) {
        console.log('Updating myTeam from', myTeam, 'to', currentPlayer.team)
        setMyTeam(currentPlayer.team)
      }
      // Don't set notification here - let the game-state-updated handler do it
      // or handle notification display in the component that needs it
    })

    // Handle play-again ready event from server: prepare lobby with same team composition
    newSocket.on('play-again-ready', (data) => {
      console.log('[PLAY-AGAIN] Room reset received:', data)
      // Stop processing indicator
      setPlayAgainProcessing(false)
      if (data?.room) {
        // Update games played counter if provided
        if (data.gamesPlayed !== undefined) setGamesPlayed(data.gamesPlayed)
        // Update team stats if present
        if (data.room.teamStats) setTeamStats(data.room.teamStats)
        setPlayers(data.room.players || [])

        const teamsPlayers: string[][] = data.teamsPlayers || []
        const teamNames: string[] = data.teamNames || (data.room && (data.room.teamNames || data.room.gameState?.teams?.map((t: any) => t.name))) || []
        const teams = teamsPlayers.map((players: string[], idx: number) => ({
          name: teamNames[idx] || `Team ${idx + 1}`,
          players: players,
          score: 0
        }))

        const newGameState = {
          teams,
          teamCount: teams.length,
          currentTeamIndex: 0,
          currentDescriberIndex: Array(teams.length).fill(0),
          round: 1,
          maxRounds: 12,
          turnTime: 60,
          timeRemaining: 60,
          currentWords: [],
          guessedWords: [],
          skippedWords: [],
          playerContributions: {}
        }

        setGameState(newGameState as any)
        // Restore the lobby team selector to the preserved team count after play-again
        setLobbyTeamCount(teams.length)
        // Mark that we intentionally defaulted the lobby selector after play-again
        setPlayAgainDefaulted(true)
        setTimeout(() => setPlayAgainDefaulted(false), 3000)
        setCurrentScreen('lobby')
        // Prevent any late 'game-over' from overwriting this transition for a short window
        ignoreGameOverUntil.current = Date.now() + 3000
        setNotification({ message: 'Room reset. Ready to play again!', type: 'success' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    // Server notified that play-again processing has started (e.g., flushing feedback)
    newSocket.on('play-again-processing', (data) => {
      console.log('[PLAY-AGAIN] Processing started:', data)
      setPlayAgainProcessing(true)
      setNotification({ message: data?.message || 'Preparing new game...', type: 'info' })
    })

    newSocket.on('game-state-updated', (data) => {
      setGameState(data.gameState)
    })

    // A player requested an individual play-again; update players list and move requesting client to lobby
    newSocket.on('player-play-again', (data) => {
      if (!data) return
      const { playerId, playerName, room } = data as any
      if (room) {
        if (room.players) setPlayers(room.players)
        if (room.teamStats) setTeamStats(room.teamStats)
        if (room.gamesPlayed !== undefined) setGamesPlayed(room.gamesPlayed)

        // Sync host/admin state if server reassigned host
        const isNowHost = room.host === newSocket.id
        setIsHost(isNowHost)
        setIsAdmin(isNowHost || (room.coAdmins && room.coAdmins.includes(newSocket.id)))
      }

      // If the event concerns this client, move them to lobby and clear their local team
      if (newSocket.id === playerId) {
        setMyTeam(null)
        setCurrentScreen('lobby')
      }
    })

    // Listen for lightweight team name updates (lobby edits)
    newSocket.on('team-name-updated', (payload) => {
      if (!payload) return
      const { teamIndex, newName, gameState, room } = payload as any
      if (gameState) {
        setGameState(gameState)
      } else {
        setGameState((prev) => {
          if (!prev) return prev
          const teams = Array.isArray(prev.teams) ? [...prev.teams] : []
          if (typeof teamIndex === 'number' && teams[teamIndex]) {
            teams[teamIndex] = { ...teams[teamIndex], name: newName }
          }
          return { ...prev, teams }
        })
      }
      if (room && room.teamStats) setTeamStats(room.teamStats)
    })

    newSocket.on('word-guessed-sync', (data) => {
      setGameState(data.gameState)
    })

    newSocket.on('word-skipped-sync', (data) => {
      setGameState(data.gameState)
    })

    newSocket.on('turn-ended', (data) => {
      setGameState(data.gameState)
    })

    newSocket.on('next-turn-sync', (data) => {
      setGameState(data.gameState)
    })

    newSocket.on('describer-skipped', (data) => {
      setGameState(data.gameState)
    })

    newSocket.on('turn-skipped', (data) => {
      setGameState(data.gameState)
      if (data.message) {
        setNotification({ message: data.message, type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    newSocket.on('game-over', (data) => {
      console.log('[GAME-OVER] Received data:', data)
      console.log('[GAME-OVER] confirmedTaboosByTeam:', data.gameState?.confirmedTaboosByTeam)
      // If a play-again was just processed, ignore late game-over messages
      if (Date.now() < (ignoreGameOverUntil.current || 0)) {
        console.log('[GAME-OVER] Ignored due to recent play-again')
        return
      }

      // Only show game over screen if player wasn't kicked
      if (!wasKicked.current) {
        setGameState(data.gameState)
        // Sync team stats if server included them
        if (data.room?.teamStats) setTeamStats(data.room.teamStats)
        setCurrentScreen('gameover')
      }
    })

    newSocket.on('host-left', (data) => {
      setNotification({ message: data.message, type: 'warning' })
      setTimeout(() => setNotification(null), 3000)
      setCurrentScreen('room')
      setRoomCode(null)
      setPlayers([])
      setIsHost(false)
      setIsAdmin(false)
      setMyTeam(null)
      // Clear session data
      localStorage.removeItem('taboo_room_code')
      localStorage.removeItem('taboo_player_name')
    })

    // Listen for co-admin promotion
    newSocket.on('made-co-admin', (data) => {
      setIsAdmin(true)
      setNotification({ message: data.message || 'You are now a co-admin!', type: 'success' })
      setTimeout(() => setNotification(null), 4000)
    })

    // Listen for co-admin demotion
    newSocket.on('removed-co-admin', (data) => {
      setIsAdmin(false)
      setNotification({ message: data.message || 'You are no longer a co-admin.', type: 'info' })
      setTimeout(() => setNotification(null), 4000)
    })

    newSocket.on('player-kicked', (data) => {
      setPlayers(data.room.players)
      if (data.gameState) {
        setGameState(data.gameState)
      }
    })

    newSocket.on('you-were-kicked', (data) => {
      wasKicked.current = true
      setNotification({ message: data.message, type: 'warning' })
      setTimeout(() => setNotification(null), 4000)
      setCurrentScreen('room')
      setRoomCode(null)
      // Fully reset local room-scoped state when explicitly removed
      setIsHost(false)
      setIsAdmin(false)
      resetLocalRoomState()
      // Clear session data
      localStorage.removeItem('taboo_room_code')
      localStorage.removeItem('taboo_player_name')
    })

    newSocket.on('you-left-game', (data) => {
      setNotification({ message: data.message, type: 'info' })
      setTimeout(() => setNotification(null), 4000)
      setCurrentScreen('room')
      setRoomCode(null)
      setIsHost(false)
      setIsAdmin(false)
      // Fully reset local room-scoped state when leaving
      resetLocalRoomState()
      // Clear session data
      localStorage.removeItem('taboo_room_code')
      localStorage.removeItem('taboo_player_name')
    })

    newSocket.on('team-switching-locked', (data) => {
      // Defensive: server may emit without payload (or client may receive undefined)
      const locked = data?.locked === true
      setTeamSwitchingLocked(locked)
      // If this client recently initiated a play-again/start, suppress lock notifications
      if (Date.now() < suppressLockNotificationsUntil.current) return
      // Only show notification when this change was manual (not an automatic reset)
      if (!data?.silent) {
        const message = locked ? 'Team switching has been locked by the host' : 'Team switching has been unlocked'
        setNotification({ message, type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    newSocket.on('room-joining-locked', (data) => {
      const locked = data?.locked === true
      setRoomJoiningLocked(locked)
      // If this client recently initiated a play-again/start, suppress lock notifications
      if (Date.now() < suppressLockNotificationsUntil.current) return
      // Only notify players when this was a manual toggle by admin/host
      if (!data?.silent) {
        const message = locked ? 'Room joining has been locked by the host' : 'Room joining has been unlocked'
        setNotification({ message, type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    newSocket.on('describer-changed', (data) => {
      setGameState(data.gameState)
      if (data.message) {
        setNotification({ message: data.message, type: 'info' })
        setTimeout(() => setNotification(null), 3000)
      }
    })

    // Consolidated error handler: show notification and redirect on room-not-found errors
    newSocket.on('error', (data) => {
      const msg = (data?.message || '').toString()
      setNotification({ message: msg || 'An error occurred', type: 'warning' })
      setTimeout(() => setNotification(null), 3000)
      const isRoomNotFound = /room not found|room no longer exists|room does not exist|Room not found/i.test(msg)
      // Expected lock/permission messages that should not trigger console.error
      const isExpectedLock = /team switching is currently locked|team switching is currently locked by the host|room is currently locked|Room is currently locked|Room is locked/i.test(msg)
      if (isRoomNotFound) {
        // Clear stored session and local state
        localStorage.removeItem('taboo_room_code')
        localStorage.removeItem('taboo_player_name')
        setRoomCode(null)
        setPlayers([])
        setIsHost(false)
        setIsAdmin(false)
        setMyTeam(null)
        setCurrentScreen('room')

        try { router.push('/') } catch (e) { }
      }
      // Known, user-facing socket errors (like Room not found) are warnings, not internal errors
      if (isRoomNotFound || isExpectedLock) {
        console.warn('Socket warning:', msg)
      } else {
        console.error('Socket error:', msg)
      }
    })

    setSocket(newSocket)

    // Handle tab/window close - DON'T emit leave-game, let grace period handle reconnection
    const handleBeforeUnload = () => {
      // Don't emit leave-game here - allow reconnection via grace period
      // The socket will disconnect naturally and the server will wait before removing player
    }

    // Handle page visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Page is hidden but not closed yet, keep connection alive
        // Socket.IO will handle disconnection if page is actually closed
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Don't emit leave-game on cleanup - allow reconnection
      newSocket.close()
    }
  }, [])

  const createRoom = (name: string, wordPack: string = 'standard') => {
    // Prepare a fresh local state for the new room to avoid leftover data
    resetLocalRoomState()
    setPlayerName(name)
    localStorage.setItem('taboo_player_name', name)
    socket?.emit('create-room', { playerName: name, sessionId: localStorage.getItem('taboo_session_id'), wordPack })
  }

  const joinRoom = (code: string, name: string) => {
    // Prepare a fresh local state for joining another room
    resetLocalRoomState()
    setPlayerName(name)
    localStorage.setItem('taboo_player_name', name)
    socket?.emit('join-room', { roomCode: code, playerName: name, sessionId: localStorage.getItem('taboo_session_id') })
  }

  const joinTeam = (teamIndex: number) => {
    setMyTeam(teamIndex)
    socket?.emit('join-team', { roomCode, teamIndex })
  }

  const startGame = (teamCount: number = 2, maxRounds?: number) => {
    if (!isHost) return

    // Build teams array based on teamCount, preserving any custom team names in current gameState
    const teams: Array<{ name: string; players: string[]; score: number }> = []
    for (let i = 0; i < teamCount; i++) {
      const name = gameState?.teams?.[i]?.name || `Team ${i + 1}`
      const teamPlayers = players.filter(p => p.team === i).map(p => p.name)
      teams.push({ name, players: teamPlayers, score: 0 })
    }

    // Reset game state to initial values for a fresh game
    const newGameState: GameState = {
      teams,
      currentTeamIndex: 0,
      currentDescriberIndex: teamCount === 3 ? [0, 0, 0] : [0, 0],
      round: 1,
      maxRounds: typeof maxRounds === 'number' ? maxRounds : (gameState?.maxRounds || 12),
      turnTime: 60,
      timeRemaining: 60,
      currentWords: [],
      guessedWords: [],
      skippedWords: [],
      playerContributions: {},
      teamCount
    }

    // Suppress lock notifications briefly for the initiating client
    suppressLockNotificationsUntil.current = Date.now() + 2500
    socket?.emit('start-game', { roomCode, gameState: newGameState })
  }

  const leaveGame = () => {
    socket?.emit('leave-game', { roomCode })
    // Clear session data when explicitly leaving
    localStorage.removeItem('taboo_room_code')
    localStorage.removeItem('taboo_player_name')
    setMyTeam(null)
    // Reset taboo toggles to default (off)
    setTabooReporting(false)
    setTabooVoting(false)
    // Reset room state
    setRoomCode(null)
    setIsHost(false)
    setIsAdmin(false)
    // Fully reset local room-scoped state for a fresh start
    resetLocalRoomState()
  }

  // Function to update taboo settings (host only)
  const setTabooSettings = (reporting: boolean, voting: boolean) => {
    console.log('[SET-TABOO-SETTINGS] Called with:', { reporting, voting, hasSocket: !!socket, roomCode })
    if (socket && roomCode) {
      console.log('[SET-TABOO-SETTINGS] Emitting set-taboo-settings event')
      socket.emit('set-taboo-settings', { roomCode, tabooReporting: reporting, tabooVoting: voting })
    }
  }

  // Function to submit word feedback
  const submitWordFeedback = (word: string, feedback: string, difficulty: string) => {
    if (socket && roomCode && playerName) {
      socket.emit('submit-word-feedback', {
        roomCode,
        playerName,
        word,
        difficulty,
        feedback,
        timestamp: new Date().toISOString()
      })
    }
  }

  // Function to change word pack (host only)
  const changeWordPack = (pack: string) => {
    if (socket && roomCode && isAdmin) {
      socket.emit('change-word-pack', { roomCode, wordPack: pack })
    }
  }

  // Optimistic local update for an individual Play Again action
  const localPlayerPlayAgain = () => {
    try {
      // Update players array locally so current client appears in waiting list immediately
      setPlayers((prev) => prev.map((p) => (p.id === socket?.id ? { ...p, team: null, showInWaiting: true } : p)))
      setMyTeam(null)
      setCurrentScreen('lobby')
      // Suppress lock notifications for the initiating client
      suppressLockNotificationsUntil.current = Date.now() + 2500
    } catch (e) {
      console.error('localPlayerPlayAgain error', e)
    }
  }

  return (
    <GameContext.Provider
      value={{
        socket,
        roomCode,
        playerName,
        isHost,
        isAdmin,
        isReconnecting,
        myTeam,
        currentScreen,
        players,
        gameState,
        connected,
        notification,
        notifications,
        teamSwitchingLocked,
        roomJoiningLocked,
        lobbyTeamCount,
        tabooReporting,
        tabooVoting,
        setTabooSettings,
        setNotification,
        setPlayerName,
        createRoom,
        joinRoom,
        joinTeam,
        startGame,
        leaveGame,
        setCurrentScreen,
        submitWordFeedback,
        playAgainProcessing,
        gamesPlayed,
        playAgainDefaulted,
        localPlayerPlayAgain,
        teamStats,
        selectedWordPack,
        changeWordPack
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
