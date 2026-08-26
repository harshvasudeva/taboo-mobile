'use client'

import { Clock, Copy, Edit3, GraduationCap, Handshake, Info, Lock, LogOut, MessageSquare, RefreshCw, Settings, Shield, Shuffle, SkipForward, Trophy as TrophyIcon, Unlock, UserCheck, Users, UserX, X, XCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useGame } from './GameContext'
import { WORD_PACKS } from './RoomScreen'

export default function GameScreen() {
  const { gameState, socket, roomCode, playerName, leaveGame, isHost, isAdmin, setCurrentScreen, myTeam, joinTeam, teamSwitchingLocked, roomJoiningLocked, setNotification: setGlobalNotification, tabooReporting, tabooVoting, setTabooSettings, submitWordFeedback, gamesPlayed, teamStats, players, selectedWordPack } = useGame()
  const [gamePhase, setGamePhase] = useState<'turn-start' | 'playing' | 'turn-end'>('turn-start')
  const [currentWords, setCurrentWords] = useState<any[]>([])
  const [guessedWords, setGuessedWords] = useState<any[]>([])
  const [guessedByPlayer, setGuessedByPlayer] = useState<{ word: string, guesser: string, points: number, isDuplicate?: boolean }[]>([])
  const [wrongGuesses, setWrongGuesses] = useState<{ word: string, guesser: string }[]>([])
  const [playerWordAttempts, setPlayerWordAttempts] = useState<Map<string, Set<string>>>(new Map()) // Map of playerName -> Set of words they've guessed
  const [previousRoundWords, setPreviousRoundWords] = useState<any[]>([])
  const [guess, setGuess] = useState('')
  const [timeRemaining, setTimeRemaining] = useState(60)
  const [turnActive, setTurnActive] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null)
  const [editingTeamName, setEditingTeamName] = useState<string>('')
  const [showBonusNotification, setShowBonusNotification] = useState(false)
  const [bonusWordCount, setBonusWordCount] = useState(0)
  const [bonusMilestones, setBonusMilestones] = useState<number[]>([6, 10, 14, 18, 22]) // Next bonus at 6, then 10, 14, 18, 22...
  const [showHostMenu, setShowHostMenu] = useState<{ teamIndex: number; playerIndex: number } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [showTeamSelectModal, setShowTeamSelectModal] = useState(false)
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(30)
  const [coAdmins, setCoAdmins] = useState<string[]>([]) // Track co-admin player names
  const [roundHistory, setRoundHistory] = useState<{ round: number; teamIndex: number; describer: string; teamName: string; tabooWords?: { word: string; points: number; confirmed?: boolean }[] }[]>([]) // Track which player described in each round
  const [tabooVotes, setTabooVotes] = useState<{ [word: string]: string[] }>({}) // Track who voted for each word as taboo
  const [confirmedTaboos, setConfirmedTaboos] = useState<string[]>([]) // Words confirmed as taboo by majority vote
  const [myTabooVotes, setMyTabooVotes] = useState<Set<string>>(new Set()) // Words I've voted as taboo
  const [turnTabooWords, setTurnTabooWords] = useState<{ word: string; points: number }[]>([]) // Taboo words for current turn with their points
  const [showTabooVotingOverlay, setShowTabooVotingOverlay] = useState(false) // Show voting overlay at round end
  const [pendingTabooWords, setPendingTabooWords] = useState<{ word: string; points: number; teamIndex: number; describer: string; finalized?: boolean }[]>([]) // Words pending vote
  const [roundEndVotes, setRoundEndVotes] = useState<{ [word: string]: { yes: string[]; no: string[] } }>({}) // Yes/No votes for each pending word
  const [myRoundEndVotes, setMyRoundEndVotes] = useState<Map<string, 'yes' | 'no'>>(new Map()) // My vote for each word (yes = taboo, no = not taboo)
  const [votingTimeRemaining, setVotingTimeRemaining] = useState(30) // Countdown for voting
  const [showGracePeriod, setShowGracePeriod] = useState(false) // Show grace period transition
  const [feedbackModal, setFeedbackModal] = useState<{ word: string; difficulty: string } | null>(null) // Word feedback modal state
  const [feedbackText, setFeedbackText] = useState('') // Feedback text input
  const [feedbackOptions, setFeedbackOptions] = useState<{
    changeDifficultyTo: string | null
    wordTooDifficult: boolean
  }>({ changeDifficultyTo: null, wordTooDifficult: false })
  // Suggestion modal state
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false)
  const [suggestionText, setSuggestionText] = useState('')
  const [suggestionChecking, setSuggestionChecking] = useState(false)
  const [suggestionCheckResult, setSuggestionCheckResult] = useState<{ exists: boolean; word: string } | null>(null)
  const [suggestionDifficulty, setSuggestionDifficulty] = useState<'easy' | 'medium' | 'hard' | null>(null)
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false)
  const [suggestionSubmitted, setSuggestionSubmitted] = useState(false)

  const currentTeam = gameState.teams[gameState.currentTeamIndex]
  const currentDescriberIndex = gameState.currentDescriberIndex?.[gameState.currentTeamIndex] ?? 0
  const currentDescriber = currentTeam?.players?.[currentDescriberIndex]
  const isMyTurn = currentDescriber === playerName

  // Check if player is on the current team and not the describer
  const isOnCurrentTeam = playerName ? currentTeam?.players?.includes(playerName) : false
  const isGuesser = isOnCurrentTeam && !isMyTurn

  // Check if taboo features are enabled - use context values which are synced from server
  // tabooReporting/tabooVoting from context are the source of truth
  const tabooReportingEnabled = tabooReporting === true
  const tabooVotingEnabled = tabooVoting === true

  // Debug: Track overlay state changes
  useEffect(() => {
    console.log('[DEBUG-OVERLAY] showTabooVotingOverlay changed:', showTabooVotingOverlay, 'playerName:', playerName, 'pendingTabooWords:', pendingTabooWords.length)
  }, [showTabooVotingOverlay, pendingTabooWords, playerName])

  // Listen for sync events
  useEffect(() => {
    if (!socket) return

    console.log('[DEBUG-SOCKET] Setting up socket listeners for player:', playerName, 'socket.id:', socket.id)

    const handleWordGuessed = (data: any) => {
      // Sync from server gameState to ensure all players have same data
      if (data.gameState && data.gameState.guessedByPlayer) {
        setGuessedByPlayer(data.gameState.guessedByPlayer)
      }

      // Sync guessedWords from server's currentTurnGuessedWords to prevent duplicate counting
      if (data.gameState && data.gameState.currentTurnGuessedWords && data.gameState.currentWords) {
        // Build guessedWords array from server's non-duplicate list
        const serverGuessedWords = data.gameState.currentTurnGuessedWords.map((word: string) => {
          const wordObj = data.gameState.currentWords.find((w: any) => w.word === word)
          return wordObj || { word, points: 0, difficulty: 'medium' }
        })
        setGuessedWords(serverGuessedWords)

        // Sync currentWords from server to stay consistent
        if (data.gameState.currentWords) {
          setCurrentWords(data.gameState.currentWords)
        }
      }
    }

    const handleTurnStarted = (data: any) => {
      // When describer starts turn, all players switch to playing phase
      setGamePhase('playing')
      setTurnActive(true)
      setTimeRemaining(60)
      setGuessedWords([])
      setGuessedByPlayer([])
      setWrongGuesses([])
      setPlayerWordAttempts(new Map())
      // Reset taboo tracking for new turn
      setTabooVotes({})
      setConfirmedTaboos([])
      setMyTabooVotes(new Set())
      setTurnTabooWords([])
      // Set the words for all players (including guessers)
      if (data.words) {
        setCurrentWords(data.words)
      }
    }

    const handleTurnEnded = (data: any) => {
      console.log('[TURN-ENDED] Received turn-ended event. Player:', playerName, 'pendingTabooWords:', data.pendingTabooWords, 'length:', data.pendingTabooWords?.length)
      // Hide grace period overlay when turn ends
      setShowGracePeriod(false)
      setTurnActive(false)
      setGamePhase('turn-end')
      // Store all words from this turn for display to everyone
      if (data.allWords) {
        setPreviousRoundWords(data.allWords)
      }
      // Sync guessed words from the server - normalize to ensure they are objects with word, points, difficulty
      if (data.guessedWords && Array.isArray(data.guessedWords)) {
        // Normalize guessedWords: handle both string arrays and object arrays
        const normalizedGuessedWords = data.guessedWords.map((w: any) => {
          if (typeof w === 'string') {
            // If it's a string, find the full object from allWords or guessedByPlayer
            const fullObj = data.allWords?.find((aw: any) => aw.word === w)
            const guessInfo = data.guessedByPlayer?.find((g: any) => g.word === w)
            return fullObj || { word: w, points: guessInfo?.points || 0, difficulty: 'medium' }
          }
          return w // Already an object
        })
        setGuessedWords(normalizedGuessedWords)
        console.log('[TURN-ENDED] Normalized guessedWords:', normalizedGuessedWords)
      }
      // Ensure guessedByPlayer has valid data
      if (data.guessedByPlayer && Array.isArray(data.guessedByPlayer)) {
        setGuessedByPlayer(data.guessedByPlayer)
      }
      console.log('Turn ended - guessedWords:', data.guessedWords, 'guessedByPlayer:', data.guessedByPlayer)

      // Check for pending taboo words and open voting overlay
      if (data.pendingTabooWords && Array.isArray(data.pendingTabooWords) && data.pendingTabooWords.length > 0) {
        console.log('[TURN-ENDED] Setting voting overlay state for player:', playerName)
        // Force state updates
        setPendingTabooWords([...data.pendingTabooWords])
        setRoundEndVotes({})
        setMyRoundEndVotes(new Map())
        setVotingTimeRemaining(30)
        // Use setTimeout to ensure state is updated before showing overlay
        setTimeout(() => {
          console.log('[TURN-ENDED] Showing voting overlay now for player:', playerName)
          setShowTabooVotingOverlay(true)
        }, 50)
      } else {
        console.log('[TURN-ENDED] No pending taboo words for player:', playerName, 'data.pendingTabooWords:', data.pendingTabooWords)
      }

      // Add to round history log
      if (data.gameState) {
        const currentTeam = data.gameState.teams[data.gameState.currentTeamIndex]
        if (currentTeam) {
          const currentDescriberIndex = data.gameState.currentDescriberIndex[data.gameState.currentTeamIndex]
          const describer = currentTeam.players?.[currentDescriberIndex] || 'Unknown'
          // Include taboo words from this turn
          const tabooDetails = data.gameState.confirmedTabooDetails || []
          setRoundHistory(prev => [...prev, {
            round: data.gameState.round,
            teamIndex: data.gameState.currentTeamIndex,
            describer: describer,
            teamName: currentTeam.name,
            tabooWords: tabooDetails.length > 0 ? tabooDetails : undefined
          }])
        }
      }
    }

    const handleNextTurn = (data: any) => {
      setGamePhase('turn-start')
      setGuessedWords([])
      setGuessedByPlayer([])
      setWrongGuesses([])
      setPlayerWordAttempts(new Map())
      setPreviousRoundWords([]) // Clear previous round words when starting new turn
      setTimeRemaining(60)
      // Reset taboo tracking for new turn
      setTabooVotes({})
      setConfirmedTaboos([])
      setMyTabooVotes(new Set())
      setTurnTabooWords([])
    }

    const handleDescriberSkipped = (data: any) => {
      // Update game state when describer is skipped
      if (data.gameState) {
        // The gameState will be updated through GameContext
        const newDescriber = data.gameState.teams[data.gameState.currentTeamIndex].players[
          data.gameState.currentDescriberIndex[data.gameState.currentTeamIndex]
        ]
        setGlobalNotification({ message: `${data.message}\nNext describer: ${newDescriber}`, type: 'info' })
        setTimeout(() => setGlobalNotification(null), 4000)
      }
      // Reset to turn-start phase for the new describer
      setGamePhase('turn-start')
      setGuessedWords([])
      setGuessedByPlayer([])
      setWrongGuesses([])
      setTimeRemaining(60)
      setTurnActive(false)
    }

    const handleTimerSync = (data: any) => {
      setTimeRemaining(data.timeRemaining)
    }

    const handleWrongGuess = (data: any) => {
      if (data.wrongGuesses) {
        setWrongGuesses(data.wrongGuesses)
      }
    }

    const handleDescriberLeft = (data: any) => {
      setGlobalNotification({ message: data.message, type: 'warning' })
      setTimeout(() => setGlobalNotification(null), 4000)
      // Reset to turn-start phase for new describer
      setGamePhase('turn-start')
      setGuessedWords([])
      setGuessedByPlayer([])
      setWrongGuesses([])
      setTimeRemaining(60)
      setTurnActive(false)
    }

    const handleHostLeft = () => {
      setGlobalNotification({ message: 'Host has left. Room is closing.', type: 'warning' })
      setTimeout(() => leaveGame(), 2000)
    }

    const handleBonusWords = (data: any) => {
      if (data.words) {
        setCurrentWords(prev => [...prev, ...data.words])
        setBonusWordCount(data.count || data.words.length)
        setShowBonusNotification(true)
        setTimeout(() => setShowBonusNotification(false), 3000)
      }
    }

    const handleTeamEmptySkip = (data: any) => {
      setGlobalNotification({ message: data.message, type: 'info' })
      setTimeout(() => setGlobalNotification(null), 4000)
      // Game continues with the other team
      setGamePhase('turn-start')
      setGuessedWords([])
      setGuessedByPlayer([])
      setWrongGuesses([])
      setTimeRemaining(60)
      setTurnActive(false)
    }

    const handleThirdTeamAdded = (data: any) => {
      console.log('🟢 GameScreen: Third team added event received')
      // Use GameContext notification (displayed globally in page.tsx) to avoid duplicates
      setGlobalNotification({ message: data.message || 'Team 3 has been added!', type: 'info' })
      setTimeout(() => setGlobalNotification(null), 3000)
    }

    const handleThirdTeamRemoved = (data: any) => {
      console.log('🔴 GameScreen: Third team removed event received')
      // Use GameContext notification (displayed globally in page.tsx) to avoid duplicates
      setGlobalNotification({ message: data.message || 'Team 3 has been removed!', type: 'warning' })
      setTimeout(() => setGlobalNotification(null), 3000)
    }

    const handleTeamUpdatedMidgame = (data: any) => {
      console.log('Team updated midgame received:', data)
      console.log('My playerName:', playerName)
      console.log('Joined player:', data.joinedPlayer)
      console.log('Names match?', data.joinedPlayer === playerName)

      // Only sync state if this is the player who just joined
      if (data.joinedPlayer === playerName) {
        console.log('✅ I am the player who joined! Syncing my state.')

        // If a turn is in progress and there are words, sync the new player
        if (data.turnInProgress && data.currentWords && data.currentWords.length > 0) {
          console.log('✅ Syncing turn state - words:', data.currentWords.length, 'time:', data.timeRemaining)
          console.log('Setting gamePhase to playing...')
          setCurrentWords(data.currentWords)
          setGamePhase('playing')
          setTurnActive(true)
          setTimeRemaining(data.timeRemaining || 60)
          setGuessedWords(data.currentTurnGuessedWords || [])
          setWrongGuesses(data.currentTurnWrongGuesses || [])
          setGuessedByPlayer(data.guessedByPlayer || [])
          console.log('✅ State synced successfully! Game phase should be playing now.')
        } else {
          console.log('⚠️ No active turn, staying at turn-start phase')
          console.log('turnInProgress:', data.turnInProgress)
          console.log('currentWords length:', data.currentWords?.length)
        }
      } else {
        console.log('❌ Not me, just updating for other player:', data.joinedPlayer)
      }
    }

    // Listen for window custom event for mid-turn sync
    const handleMidturnSync = (event: any) => {
      console.log('🔄 Received midturn-sync event!', event.detail)
      handleTeamUpdatedMidgame(event.detail)
    }

    const handleGuessRejected = (data: any) => {
      // Show notification when guess is rejected due to timing
      setGlobalNotification({ message: data.message || "Your guess arrived too late!", type: 'warning' })
      setTimeout(() => setGlobalNotification(null), 3000)
    }

    const handleGracePeriodStart = () => {
      // Show grace period transition overlay
      setShowGracePeriod(true)
    }

    const handleMadeCoAdmin = (data: any) => {
      // Show notification when promoted to co-admin
      setGlobalNotification({ message: data.message || "You are now a co-admin!", type: 'success' })
      setTimeout(() => setGlobalNotification(null), 5000)
    }

    // Update local co-admin list when someone is promoted
    const handlePlayerPromoted = (data: any) => {
      if (data.playerName) {
        setCoAdmins(prev => [...prev.filter(n => n !== data.playerName), data.playerName])
      }
    }

    // Update local co-admin list when someone is demoted
    const handlePlayerDemoted = (data: any) => {
      if (data.playerName) {
        setCoAdmins(prev => prev.filter(n => n !== data.playerName))
      }
    }

    // Handle taboo vote sync from server
    const handleTabooVoteSync = (data: any) => {
      if (data.tabooVotes) {
        setTabooVotes(data.tabooVotes)
      }
      if (data.confirmedTaboos) {
        setConfirmedTaboos(data.confirmedTaboos)
        // Show notification when a word is reported as potential taboo - but NOT to the team whose turn it is
        // Use currentTeamPlayers from server data for accurate check
        const currentTeamPlayers = data.currentTeamPlayers || []
        const isPlayerOnCurrentTeam = currentTeamPlayers.includes(playerName)

        console.log('[TABOO-VOTE-SYNC] Player:', playerName, 'currentTeamPlayers:', currentTeamPlayers, 'isPlayerOnCurrentTeam:', isPlayerOnCurrentTeam)

        // Only show notification to watching teams (NOT to describer's team)
        if (data.newlyConfirmed && !isPlayerOnCurrentTeam) {
          setGlobalNotification({ message: `"${data.newlyConfirmed}" reported as potential TABOO! 🚫`, type: 'warning' })
          setTimeout(() => setGlobalNotification(null), 3000)
        }
        // Track the taboo word with its points for turn-end voting
        if (data.newlyConfirmed && data.wordPoints !== undefined) {
          setTurnTabooWords(prev => [...prev, { word: data.newlyConfirmed, points: data.wordPoints }])
        }
      }
    }

    // Handle round-end voting overlay
    const handleTabooVotingStart = (data: any) => {
      console.log('[TABOO-VOTING-START] Received event for player:', playerName, 'words:', data.pendingTabooWords)
      // Only show voting overlay if voting is enabled
      if (gameState.tabooVoting === false) {
        console.log('[TABOO-VOTING-START] Voting disabled, ignoring event')
        return
      }
      if (data.pendingTabooWords && data.pendingTabooWords.length > 0) {
        console.log('[TABOO-VOTING-START] Opening voting overlay for player:', playerName)
        setPendingTabooWords(data.pendingTabooWords)
        setRoundEndVotes({})
        setMyRoundEndVotes(new Map())
        setVotingTimeRemaining(30)
        setShowTabooVotingOverlay(true)
      }
    }

    // Handle round-end vote sync
    const handleRoundEndVoteSync = (data: any) => {
      if (data.votes) {
        setRoundEndVotes(data.votes)
      }
      if (data.timeRemaining !== undefined) {
        setVotingTimeRemaining(data.timeRemaining)
      }
      // Update pending words with finalized status
      if (data.pendingTabooWords) {
        setPendingTabooWords(data.pendingTabooWords)
      }
    }

    // Handle voting complete
    const handleTabooVotingComplete = (data: any) => {
      setShowTabooVotingOverlay(false)
      setPendingTabooWords([])
      setRoundEndVotes({})
      setMyRoundEndVotes(new Map())

      // Get confirmed and failed words
      const confirmedWords = data.confirmedTabooWords || []
      const failedWords = data.failedTabooWords || []
      const confirmedWordNames = confirmedWords.map((w: any) => w.word)
      const failedWordNames = failedWords.map((w: any) => w.word)

      // Update round history - mark confirmed words and remove failed words
      setRoundHistory(prev => {
        return prev.map(entry => {
          if (!entry.tabooWords || entry.tabooWords.length === 0) return entry

          // Filter out failed words and mark confirmed ones
          const updatedTabooWords = entry.tabooWords
            .filter(t => !failedWordNames.includes(t.word)) // Remove failed words
            .map(t => ({
              ...t,
              confirmed: confirmedWordNames.includes(t.word) ? true : t.confirmed // Mark confirmed
            }))

          return {
            ...entry,
            tabooWords: updatedTabooWords.length > 0 ? updatedTabooWords : undefined
          }
        })
      })

      // Show notification
      if (confirmedWords.length > 0) {
        setGlobalNotification({
          message: `${confirmedWords.length} word${confirmedWords.length !== 1 ? 's' : ''} confirmed as TABOO! 🚫`,
          type: 'warning'
        })
        setTimeout(() => setGlobalNotification(null), 3000)
      } else if (failedWords.length > 0) {
        setGlobalNotification({
          message: `${failedWords.length} taboo report${failedWords.length !== 1 ? 's' : ''} dismissed by vote`,
          type: 'info'
        })
        setTimeout(() => setGlobalNotification(null), 3000)
      }
    }

    window.addEventListener('midturn-sync', handleMidturnSync)

    // Handle reconnection with round history
    const handleRoomRejoined = (data: any) => {
      console.log('[ROOM-REJOINED] Received roundHistory:', data.roundHistory?.length || 0, 'entries')
      if (data.roundHistory && Array.isArray(data.roundHistory)) {
        setRoundHistory(data.roundHistory)
      }
    }

    // Handle session reconnection from custom event (fired by GameContext after room-rejoined)
    const handleSessionReconnected = (event: CustomEvent) => {
      const data = event.detail
      console.log('[SESSION-RECONNECTED] Full reconnection data:', data)

      // Restore round history (describers and taboo logs)
      if (data.roundHistory && Array.isArray(data.roundHistory)) {
        console.log('[SESSION-RECONNECTED] Restoring roundHistory:', data.roundHistory.length, 'entries')
        setRoundHistory(data.roundHistory)
      }

      // Restore turn state if a turn is in progress
      if (data.turnInProgress && data.currentWords?.length > 0) {
        console.log('[SESSION-RECONNECTED] Restoring mid-turn state')
        setCurrentWords(data.currentWords)
        setTurnActive(true)
        setGamePhase('playing')

        // Restore timer
        if (data.timeRemaining !== undefined && data.timeRemaining > 0) {
          setTimeRemaining(data.timeRemaining)
        }

        // Restore guessed words for this turn
        if (data.currentTurnGuessedWords?.length > 0) {
          const restoredGuessedWords = data.currentTurnGuessedWords.map((word: string) => {
            const wordObj = data.currentWords.find((w: any) => w.word === word)
            return wordObj || { word, points: 0, difficulty: 'medium' }
          })
          setGuessedWords(restoredGuessedWords)
        }

        // Restore wrong guesses
        if (data.currentTurnWrongGuesses?.length > 0) {
          setWrongGuesses(data.currentTurnWrongGuesses)
        }

        // Restore guessed by player
        if (data.guessedByPlayer?.length > 0) {
          setGuessedByPlayer(data.guessedByPlayer)
        }
      } else {
        // No active turn - reset to turn-start phase
        console.log('[SESSION-RECONNECTED] No active turn, setting to turn-start phase')
        setGamePhase('turn-start')
        setTurnActive(false)
        setCurrentWords([])
        setGuessedWords([])
        setWrongGuesses([])
        setGuessedByPlayer([])
      }
    }

    window.addEventListener('session-reconnected', handleSessionReconnected as EventListener)

    socket.on('word-guessed-sync', handleWordGuessed)
    socket.on('turn-started', handleTurnStarted)
    socket.on('turn-ended', handleTurnEnded)
    socket.on('grace-period-start', handleGracePeriodStart)
    socket.on('next-turn-sync', handleNextTurn)
    socket.on('timer-sync', handleTimerSync)
    socket.on('host-left', handleHostLeft)
    socket.on('bonus-words-sync', handleBonusWords)
    socket.on('describer-skipped', handleDescriberSkipped)
    socket.on('wrong-guess-sync', handleWrongGuess)
    socket.on('describer-left', handleDescriberLeft)
    socket.on('team-empty-skip', handleTeamEmptySkip)
    socket.on('third-team-added', handleThirdTeamAdded)
    socket.on('third-team-removed', handleThirdTeamRemoved)
    socket.on('team-updated-midgame', handleTeamUpdatedMidgame)
    socket.on('guess-rejected', handleGuessRejected)
    socket.on('made-co-admin', handleMadeCoAdmin)
    socket.on('player-promoted', handlePlayerPromoted)
    socket.on('player-demoted', handlePlayerDemoted)
    socket.on('taboo-vote-sync', handleTabooVoteSync)
    socket.on('taboo-voting-start', handleTabooVotingStart)
    socket.on('round-end-vote-sync', handleRoundEndVoteSync)
    socket.on('taboo-voting-complete', handleTabooVotingComplete)
    socket.on('room-rejoined', handleRoomRejoined)

    return () => {
      window.removeEventListener('midturn-sync', handleMidturnSync)
      window.removeEventListener('session-reconnected', handleSessionReconnected as EventListener)
      socket.off('word-guessed-sync', handleWordGuessed)
      socket.off('turn-started', handleTurnStarted)
      socket.off('turn-ended', handleTurnEnded)
      socket.off('grace-period-start', handleGracePeriodStart)
      socket.off('next-turn-sync', handleNextTurn)
      socket.off('timer-sync', handleTimerSync)
      socket.off('host-left', handleHostLeft)
      socket.off('bonus-words-sync', handleBonusWords)
      socket.off('describer-skipped', handleDescriberSkipped)
      socket.off('wrong-guess-sync', handleWrongGuess)
      socket.off('describer-left', handleDescriberLeft)
      socket.off('team-empty-skip', handleTeamEmptySkip)
      socket.off('third-team-added', handleThirdTeamAdded)
      socket.off('third-team-removed', handleThirdTeamRemoved)
      socket.off('team-updated-midgame', handleTeamUpdatedMidgame)
      socket.off('made-co-admin', handleMadeCoAdmin)
      socket.off('guess-rejected', handleGuessRejected)
      socket.off('player-promoted', handlePlayerPromoted)
      socket.off('player-demoted', handlePlayerDemoted)
      socket.off('taboo-vote-sync', handleTabooVoteSync)
      socket.off('taboo-voting-start', handleTabooVotingStart)
      socket.off('round-end-vote-sync', handleRoundEndVoteSync)
      socket.off('taboo-voting-complete', handleTabooVotingComplete)
      socket.off('room-rejoined', handleRoomRejoined)
    }
  }, [socket, playerName])

  // Close host menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showHostMenu) {
        setShowHostMenu(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showHostMenu])

  // 30-second auto-advance timer for turn-end phase
  useEffect(() => {
    let autoAdvanceTimer: NodeJS.Timeout
    let countdownInterval: NodeJS.Timeout

    if (gamePhase === 'turn-end' && isMyTurn) {
      // Reset countdown
      setAutoAdvanceCountdown(30)

      // Countdown interval
      countdownInterval = setInterval(() => {
        setAutoAdvanceCountdown(prev => {
          if (prev <= 1) {
            return 0
          }
          return prev - 1
        })
      }, 1000)

      // Auto-advance after 30 seconds if describer hasn't clicked next turn
      autoAdvanceTimer = setTimeout(() => {
        console.log('Auto-advancing to next turn after 30 seconds')
        handleNextTurnButton()
      }, 30000) // 30 seconds
    }

    return () => {
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer)
      }
      if (countdownInterval) {
        clearInterval(countdownInterval)
      }
    }
  }, [gamePhase, isMyTurn])

  // Timer
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (turnActive && timeRemaining > 0 && isMyTurn) {
      timer = setTimeout(() => {
        const newTime = timeRemaining - 1
        setTimeRemaining(newTime)
        // Broadcast timer to all players
        socket?.emit('timer-update', { roomCode, timeRemaining: newTime })

        // Check if time is up after update
        if (newTime === 0) {
          handleEndTurn()
        }
      }, 1000)
    }
    return () => clearTimeout(timer)
  }, [turnActive, timeRemaining, isMyTurn, socket, roomCode])

  // Fisher-Yates shuffle algorithm for better randomization
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // NOTE: Word selection happens ONLY on the server to prevent client-side data leakage
  // Words are sent to clients via socket events when a turn starts

  const startTurn = () => {
    // Don't generate words on client - server will do it
    setGuessedWords([])
    setBonusMilestones([6, 10, 14, 18, 22]) // Reset bonus milestones
    setTimeRemaining(60)
    setTurnActive(true)
    setGamePhase('playing')

    // Request server to generate and send words to all players
    socket?.emit('start-turn', { roomCode })
  }

  const handleGuess = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.toUpperCase()
    setGuess(input)
  }

  // Calculate Levenshtein distance (edit distance) between two strings
  const calculateSimilarity = (str1: string, str2: string): number => {
    const len1 = str1.length
    const len2 = str2.length
    const matrix: number[][] = []

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        }
      }
    }

    const distance = matrix[len1][len2]
    const maxLen = Math.max(len1, len2)
    const similarity = ((maxLen - distance) / maxLen) * 100
    return similarity
  }

  const submitGuess = () => {
    // Only allow guesses from team members who are guessing
    if (!isGuesser) return

    // Allow guesses even at timeRemaining = 0 - server has a grace period for network latency
    // Only block if time is negative (should never happen but safety check)
    if (timeRemaining < 0) return

    const input = guess.trim().toUpperCase()
    if (input.length === 0) return

    let foundMatch = false
    let partialMatch: { wordObj: any; similarity: number } | null = null
    let alreadyGuessed = false
    let isSecondDuplicate = false

    for (const wordObj of currentWords) {
      // Check for exact match first (before checking if already guessed)
      if (input === wordObj.word) {
        // Check if already guessed
        if (guessedWords.some(w => w.word === wordObj.word)) {
          // Check if this specific player has already guessed this word
          const playerAttempts = playerWordAttempts.get(playerName || '') || new Set()
          if (!playerAttempts.has(wordObj.word)) {
            // First time THIS player guesses this duplicate: allow it (shows green)
            alreadyGuessed = true
            const newAttempts = new Set(playerAttempts).add(wordObj.word)
            setPlayerWordAttempts(prev => new Map(prev).set(playerName || '', newAttempts))
          } else {
            // This player already guessed this word once: treat as wrong guess
            isSecondDuplicate = true
          }
          break
        }

        foundMatch = true
        setGuess('')

        // Track this player's guess for future duplicate detection
        const playerAttempts = playerWordAttempts.get(playerName || '') || new Set()
        const newAttempts = new Set(playerAttempts).add(wordObj.word)
        setPlayerWordAttempts(prev => new Map(prev).set(playerName || '', newAttempts))

        // Emit to server with full wordObj and full points
        // Server will handle duplicate detection and update all clients
        socket?.emit('word-guessed', {
          roomCode,
          word: wordObj.word,
          wordObj: wordObj,
          guesser: playerName,
          points: wordObj.points
        })
        break
      }

      // Skip already guessed words for partial matching
      if (guessedWords.some(w => w.word === wordObj.word)) continue

      // Check for partial match (90% or more similarity)
      const similarity = calculateSimilarity(input, wordObj.word)
      if (similarity >= 90 && (!partialMatch || similarity > partialMatch.similarity)) {
        partialMatch = { wordObj, similarity }
      }
    }

    // If exact match was found, we're done
    if (foundMatch) return

    // If first duplicate, emit as word-guessed (server handles it, shows green with 0 points)
    if (alreadyGuessed && !isSecondDuplicate) {
      setGuess('')
      const matchedWord = currentWords.find(w => w.word === input)
      if (matchedWord) {
        socket?.emit('word-guessed', {
          roomCode,
          word: matchedWord.word,
          wordObj: matchedWord,
          guesser: playerName,
          points: matchedWord.points
        })
      }
      return
    }

    // If partial match found (90%+ similarity), award partial points
    if (partialMatch) {
      const partialPoints = Math.ceil(partialMatch.wordObj.points * 0.7) // 70% of points for partial match
      setGuess('')

      // Emit to server with partial points
      socket?.emit('word-guessed', {
        roomCode,
        word: partialMatch.wordObj.word,
        wordObj: { ...partialMatch.wordObj, points: partialPoints },
        guesser: playerName,
        points: partialPoints,
        partial: true,
        actualGuess: input
      })

      // Show notification about partial match
      setGlobalNotification({ message: `Close enough! "${input}" → "${partialMatch.wordObj.word}" (${partialPoints} points)`, type: 'success' })
      setTimeout(() => setGlobalNotification(null), 3000)
      return
    }

    // If no match found at all or second duplicate, it's a wrong guess
    if ((!foundMatch || isSecondDuplicate) && input.length > 0) {
      setGuess('')
      socket?.emit('wrong-guess', {
        roomCode,
        word: input,
        guesser: playerName
      })
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitGuess()
    }
  }

  // Report a word as taboo (for watchers only)
  const reportTaboo = (word: string) => {
    if (!socket || !playerName || isOnCurrentTeam || myTabooVotes.has(word)) return

    // Add to local tracking
    setMyTabooVotes(prev => new Set(prev).add(word))

    // Send to server
    socket.emit('report-taboo', {
      roomCode,
      word,
      voter: playerName,
      voterTeam: myTeam
    })
  }

  // Vote on taboo word in round-end voting overlay (everyone can vote yes or no)
  const voteTabooRoundEnd = (word: string, voteType: 'yes' | 'no') => {
    if (!socket || !playerName || myRoundEndVotes.has(word)) return

    // Add to local tracking
    setMyRoundEndVotes(prev => new Map(prev).set(word, voteType))

    // Send to server
    socket.emit('round-end-taboo-vote', {
      roomCode,
      word,
      voter: playerName,
      voteType
    })
  }

  const handleEndTurn = () => {
    setTurnActive(false)
    // Don't set gamePhase here - let the socket event handle it for everyone

    const totalPoints = guessedWords.reduce((sum, w) => sum + w.points, 0)
    socket?.emit('end-turn', {
      roomCode,
      guessedCount: guessedWords.length,
      skippedCount: 0,
      totalPoints,
      guessedWords: guessedWords,
      guessedByPlayer: guessedByPlayer,
      allWords: currentWords // Send all words from this turn for display
    })
  }

  const handleNextTurnButton = () => {
    socket?.emit('next-turn', { roomCode })
  }

  const handleSkipDescribing = () => {
    // Describer can skip their turn. Allow skip as long as this client
    // is the current describer to avoid requiring a stale/extra click.
    if (isMyTurn) {
      socket?.emit('skip-turn', { roomCode, playerName })
      // Alert will be shown when server responds with describer-skipped event
    }
  }

  const handleSkipTurn = () => {
    if (isMyTurn) {
      if (currentWords.length > 0) {
        socket?.emit('skip-word', { roomCode, playerName })
      } else {
        setGlobalNotification({ message: "No more words to skip!", type: 'warning' })
        setTimeout(() => setGlobalNotification(null), 3000)
      }
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'border-green-500/50 bg-green-500/10 hover:border-green-500/70'
      case 'medium': return 'border-yellow-500/50 bg-yellow-500/10 hover:border-yellow-500/70'
      case 'hard': return 'border-red-500/50 bg-red-500/10 hover:border-red-500/70'
      default: return 'border-gray-500/50 bg-gray-500/10 hover:border-gray-500/70'
    }
  }

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return { label: 'E', color: 'text-green-400 bg-green-500/20' }
      case 'medium': return { label: 'M', color: 'text-yellow-400 bg-yellow-500/20' }
      case 'hard': return { label: 'H', color: 'text-red-400 bg-red-500/20' }
      default: return { label: '?', color: 'text-gray-400 bg-gray-500/20' }
    }
  }

  const handleLeaveGame = () => {
    setShowLeaveConfirm(false)
    leaveGame()
  }

  const handleKickPlayer = (playerName: string, ban: boolean = false) => {
    if (!isHost) return
    socket?.emit('kick-player', { roomCode, playerName, ban })
    setShowHostMenu(null)
  }

  const handleMakeDescriber = (teamIndex: number, playerIndex: number) => {
    const isCaptain = players.find(p => p.name === playerName)?.isCaptain
    if (!isAdmin && !(isCaptain && myTeam === teamIndex)) return
    socket?.emit('set-describer', { roomCode, teamIndex, playerIndex })
    setShowHostMenu(null)
  }

  const handleSaveEdit = (teamIndex: number) => {
    const isCaptain = players.find(p => p.name === playerName)?.isCaptain
    if (!isAdmin && !(isCaptain && myTeam === teamIndex)) return
    if (editingTeamName === '' || editingTeamName.trim() === '') {
      setGlobalNotification({ message: 'Please enter a team name.', type: 'warning' })
      setTimeout(() => setGlobalNotification(null), 3000)
      return
    }
    socket?.emit('rename-team', { roomCode, teamIndex, newName: editingTeamName })
    setGlobalNotification({ message: `Team name updated to ${editingTeamName}`, type: 'success' })
    setTimeout(() => setGlobalNotification(null), 3000)
    setEditingTeamIndex(null)
    setEditingTeamName('')
  }

  const handleEndGame = () => {
    if (!isHost) return
    setConfirmDialog({
      message: 'Are you sure you want to end the game for everyone?',
      onConfirm: () => {
        socket?.emit('admin-end-game', { roomCode })
        setShowAdminPanel(false)
        setConfirmDialog(null)
      }
    })
  }

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode)
      setGlobalNotification({ message: 'Room code copied to clipboard!', type: 'success' })
      setTimeout(() => setGlobalNotification(null), 2000)
    }
  }

  const handleChangeTeam = () => {
    // If this player is the describer and the turn is not active (i.e. they've finished
    // but didn't press "Next"), automatically advance to the next turn when they
    // change teams. This avoids leaving the game stuck if the describer switches team.
    if (isMyTurn && !turnActive) {
      handleNextTurnButton()
    }

    if (gameState.teamCount === 2) {
      // Simple toggle for 2 teams
      const newTeam = myTeam === 0 ? 1 : 0
      joinTeam(newTeam)
      setGlobalNotification({ message: `Switched to Team ${newTeam + 1}`, type: 'success' })
      setTimeout(() => setGlobalNotification(null), 2000)
    } else {
      setShowTeamSelectModal(true)
    }
  }

  const handleSelectTeam = (teamIndex: number) => {
    joinTeam(teamIndex)
    setShowTeamSelectModal(false)
    setGlobalNotification({ message: `Joined Team ${teamIndex + 1}`, type: 'success' })
    setTimeout(() => setGlobalNotification(null), 2000)
  }

  const handleAdminSkipTurn = () => {
    if (!isAdmin) return
    setConfirmDialog({
      message: 'Skip the current turn and move to the next team?',
      onConfirm: () => {
        socket?.emit('admin-skip-turn', { roomCode })
        setShowAdminPanel(false)
        setConfirmDialog(null)
      }
    })
  }

  const handlePauseTimer = () => {
    if (!isAdmin) return
    socket?.emit('admin-pause-timer', { roomCode })
  }

  const handleResumeTimer = () => {
    if (!isAdmin) return
    socket?.emit('admin-resume-timer', { roomCode })
  }

  const handleOpenFeedbackModal = (word: string, difficulty: string) => {
    setFeedbackModal({ word, difficulty })
    setFeedbackText('')
    setFeedbackOptions({ changeDifficultyTo: null, wordTooDifficult: false })
  }

  const handleSubmitFeedback = () => {
    if (feedbackModal && (feedbackOptions.changeDifficultyTo || feedbackOptions.wordTooDifficult || feedbackText.trim())) {
      // Build feedback message from options
      const feedbackParts: string[] = []

      if (feedbackOptions.changeDifficultyTo) {
        feedbackParts.push(`Suggested difficulty: ${feedbackOptions.changeDifficultyTo}`)
      }
      if (feedbackOptions.wordTooDifficult) {
        feedbackParts.push('Word too difficult')
      }
      if (feedbackText.trim()) {
        feedbackParts.push(feedbackText.trim())
      }

      const fullFeedback = feedbackParts.join(' | ')
      // Parameters order: word, feedback, difficulty (current word difficulty)
      submitWordFeedback(feedbackModal.word, fullFeedback, feedbackModal.difficulty)
      setGlobalNotification({ message: 'Feedback submitted! Thank you.', type: 'success' })
      setTimeout(() => setGlobalNotification(null), 3000)
      setFeedbackModal(null)
      setFeedbackText('')
      setFeedbackOptions({ changeDifficultyTo: null, wordTooDifficult: false })
    }
  }

  // Suggestions: open/close modal, check existence, and submit
  const openSuggestionModal = () => {
    setSuggestionModalOpen(true)
    setSuggestionText('')
    setSuggestionCheckResult(null)
    setSuggestionSubmitting(false)
    setSuggestionSubmitted(false)
    setSuggestionDifficulty(null)
  }

  const closeSuggestionModal = () => {
    setSuggestionModalOpen(false)
    setSuggestionText('')
    setSuggestionCheckResult(null)
    setSuggestionChecking(false)
    setSuggestionSubmitting(false)
    setSuggestionSubmitted(false)
  }

  const submitSuggestion = () => {
    if (!suggestionText.trim()) return
    // Prevent double-submits
    if (suggestionSubmitting || suggestionSubmitted) return
    // If we've already checked and the word exists, block submit
    if (suggestionCheckResult && suggestionCheckResult.exists) {
      setGlobalNotification({ message: `"${suggestionCheckResult.word}" already exists in the dictionary!`, type: 'warning' })
      setTimeout(() => setGlobalNotification(null), 4000)
      return
    }
    setSuggestionSubmitting(true)
    socket?.emit('suggest-word', { roomCode, playerName, word: suggestionText.trim(), difficulty: suggestionDifficulty ?? undefined, timestamp: new Date().toISOString() })
  }

  useEffect(() => {
    if (!socket) return
    const onCheck = (payload: { exists: boolean; word: string }) => {
      setSuggestionChecking(false)
      setSuggestionCheckResult(payload)
    }
    const onSuggest = (payload: { success: boolean; exists: boolean; word: string }) => {
      // Mark result and show confirmation on success
      if (payload.success) {
        setSuggestionCheckResult({ exists: payload.exists, word: payload.word })
        setSuggestionSubmitting(false)
        setSuggestionSubmitted(true)
        setGlobalNotification({ message: 'Word suggestion submitted successfully!', type: 'success' })
        setTimeout(() => setGlobalNotification(null), 4000)
      } else {
        setSuggestionSubmitting(false)
      }
    }
    socket.on('check-word-result', onCheck)
    socket.on('suggest-word-result', onSuggest)
    return () => {
      socket.off('check-word-result', onCheck)
      socket.off('suggest-word-result', onSuggest)
    }
  }, [socket])

  // Debounced word existence check for suggestion modal
  useEffect(() => {
    if (!socket || !suggestionModalOpen) return
    const trimmed = suggestionText.trim()
    if (!trimmed || trimmed.length < 2) {
      // Reset check result if input is too short
      setSuggestionCheckResult(null)
      setSuggestionChecking(false)
      return
    }

    // Set checking state and debounce the actual check
    setSuggestionChecking(true)
    const debounceTimer = setTimeout(() => {
      socket.emit('check-word-exists', { roomCode, word: trimmed })
    }, 300)

    return () => {
      clearTimeout(debounceTimer)
    }
  }, [socket, suggestionText, suggestionModalOpen, roomCode])

  const handleToggleCoAdmin = (targetPlayerName: string) => {
    if (!isHost) return
    socket?.emit('toggle-co-admin', { roomCode, playerName: targetPlayerName })
  }

  const handleRandomizeTeams = () => {
    if (!isAdmin) return
    socket?.emit('admin-randomize-teams', { roomCode })
    setShowAdminPanel(false)
  }

  const handleToggleThirdTeam = () => {
    if (!isAdmin) return
    const addTeam = gameState.teamCount !== 3 // Add if currently 2 teams, remove if 3 teams
    socket?.emit('admin-toggle-third-team', { roomCode, addTeam })
    setShowAdminPanel(false)
  }
  const handleToggleTeamSwitching = () => {
    if (!isAdmin) return
    socket?.emit('admin-toggle-team-switching', { roomCode })
    setShowAdminPanel(false)
  }

  const handleToggleTeamLock = () => {
    if (!isAdmin) return
    socket?.emit('admin-toggle-team-lock', { roomCode })
    setShowAdminPanel(false)
  }

  const getOtherDifficulties = (currentDifficulty: string): string[] => {
    const difficulties = ['easy', 'medium', 'hard']
    return difficulties.filter(d => d !== currentDifficulty)
  }

  return (
    <>
      <div className="space-y-3 md:space-y-4 lg:space-y-6 px-2 sm:px-0">
        {/* Top Header Bar - Fixed Position */}
        <div className="fixed top-0 left-0 right-0 z-40 pb-4 pt-4 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            {/* Left - Room Code and Change Team */}
            <div className="hidden sm:flex gap-2">
              <div className="glass-strong rounded-xl px-3 sm:px-4 py-2.5 flex items-center gap-2 border border-cyan-500/30 shadow-lg h-10 sm:h-11">
                <span className="text-gray-400 text-xs sm:text-sm">Room Code:</span>
                <span className="text-sm sm:text-base font-mono font-bold tracking-wider text-cyan-300">{roomCode}</span>
                <button
                  onClick={copyRoomCode}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  title="Copy room code"
                >
                  <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              {/* Change Team Button - Disabled during active turn or when teams are locked */}
              <button
                onClick={handleChangeTeam}
                disabled={turnActive || teamSwitchingLocked}
                className={`px-3 sm:px-4 py-2.5 glass-strong rounded-xl transition-colors flex items-center gap-2 text-sm font-medium border shadow-lg h-10 sm:h-11 ${turnActive || teamSwitchingLocked
                  ? 'border-gray-500/30 text-gray-500 cursor-not-allowed opacity-50'
                  : 'border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/50'
                  }`}
                title={
                  turnActive
                    ? 'Cannot change teams during an active turn'
                    : teamSwitchingLocked
                      ? 'Team switching is locked by the host'
                      : 'Shuffle teams / switch team assignment'
                }
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Change Team</span>
              </button>
              {/* Suggestion Button - open suggestion modal with gamesPlayed badge in its own container */}
              <div className="flex items-center gap-2">
                <button
                  onClick={openSuggestionModal}
                  title="Suggest a word"
                  className="px-3 sm:px-4 py-2.5 glass-strong rounded-xl transition-colors flex items-center gap-2 text-sm font-medium border shadow-lg h-10 sm:h-11 text-amber-400 hover:bg-amber-500/10 border-amber-500/20"
                >
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Suggest</span>
                </button>
                <div className="h-10 sm:h-11 px-3 sm:px-4 flex items-center gap-2 glass-strong rounded-xl border border-gray-600/20 text-sm">
                  <span className="text-[18px] sm:text-[20px] text-orange-400">⚔️</span>
                  <span className="ml-1 text-sm text-orange-400">{gamesPlayed}</span>
                </div>
              </div>
            </div>

            {/* Mobile compact header (icons only) */}
            <div className="flex sm:hidden items-center justify-evenly gap-2 px-2 w-full">
              <div className="glass-strong rounded-xl px-2 py-2 flex items-center gap-1 border shadow-lg h-10 min-w-[56px] justify-center">
                <span className="text-xs font-mono font-bold tracking-wider">{roomCode}</span>
                <button onClick={copyRoomCode} className="p-1 hover:bg-white/10 rounded-lg transition-colors" title="Copy room code">
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleChangeTeam}
                disabled={turnActive || teamSwitchingLocked}
                className={`p-2 glass-strong rounded-xl transition-colors flex items-center justify-center h-10 ${turnActive || teamSwitchingLocked
                  ? 'border border-gray-500/30 text-gray-500 cursor-not-allowed opacity-50'
                  : 'border border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/50'
                  }`}
                title="Change Team"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button onClick={openSuggestionModal} title="Suggest a word" className="glass-strong p-2 rounded-xl text-amber-400 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </button>

              <div className="glass-strong px-3 py-2 rounded-xl flex items-center justify-center gap-1 min-w-[56px] h-10">
                <span className="text-[16px] text-orange-400">⚔️</span>
                <span className="text-xs text-orange-400">{gamesPlayed}</span>
              </div>

              {isAdmin && (
                <button onClick={() => setShowAdminPanel(true)} className="p-2 glass-strong rounded-xl hover:bg-purple-500/20 transition-colors flex items-center justify-center text-purple-400 border border-purple-500/30 hover:border-purple-500/50 shadow-lg h-10" title="Admin Panel">
                  <Settings className="w-4 h-4" />
                </button>
              )}

              <button onClick={() => setShowLeaveConfirm(true)} className="p-2 glass-strong rounded-xl flex items-center justify-center text-red-400 border border-red-500/30 hover:bg-red-500/10 shadow-lg h-10" title="Leave Game">
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Right - Control Buttons (desktop) */}
            <div className="hidden sm:flex gap-2">
              {/* Admin Panel Button (Host or Co-Admin) */}
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="px-3 sm:px-4 py-2.5 glass-strong rounded-xl hover:bg-purple-500/20 transition-colors flex items-center gap-2 text-purple-400 text-sm font-medium border border-purple-500/30 hover:border-purple-500/50 shadow-lg h-10 sm:h-11"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}

              {/* Leave Game Button */}
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="px-3 sm:px-4 py-2.5 glass-strong rounded-xl hover:bg-red-500/20 transition-colors flex items-center gap-2 text-red-400 text-sm font-medium border border-red-500/30 hover:border-red-500/50 shadow-lg h-10 sm:h-11"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Leave</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content - Add top padding to account for fixed header */}
        <div className="pt-14 sm:pt-2"></div>

        {/* Leave Confirmation Modal */}
        {showLeaveConfirm && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setShowLeaveConfirm(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          >
            <div
              className="glass-strong rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold mb-4">Leave Game?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to leave the game? You'll return to the lobby.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 px-6 py-3 glass rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeaveGame}
                  className="flex-1 px-6 py-3 glass-strong hover:bg-white/5 border border-white/10 rounded-xl transition-colors font-semibold"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Panel Modal */}
        {showAdminPanel && isAdmin && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setShowAdminPanel(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          >
            <div
              className="glass-strong rounded-2xl p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Shield className="w-7 h-7 text-purple-400" />
                  <h3 className="text-2xl md:text-3xl font-bold">Admin Panel</h3>
                </div>
                <button onClick={() => setShowAdminPanel(false)} className="p-2 glass-strong rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center text-gray-300" title="Close Admin Panel">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Player Management Section */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" />
                  Player Management
                </h4>
                <div className="space-y-2">
                  {gameState.teams.map((team, teamIndex) => {
                    const teamColors = ['text-blue-400', 'text-red-400', 'text-green-400'];
                    const teamColor = teamColors[teamIndex];

                    return (
                      <div key={teamIndex} className="glass rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          {editingTeamIndex === teamIndex ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                autoFocus
                                onFocus={(e) => (e.target as HTMLInputElement).select()}
                                className={`w-full px-3 py-1 rounded-lg bg-white/5 outline-none text-sm ${teamColor}`}
                                value={editingTeamName}
                                onChange={(e) => setEditingTeamName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleSaveEdit(teamIndex)
                                  } else if (e.key === 'Escape') {
                                    setEditingTeamIndex(null)
                                    setEditingTeamName('')
                                  }
                                }}
                                placeholder={`Team ${teamIndex + 1}`}
                              />
                              <button
                                onClick={() => handleSaveEdit(teamIndex)}
                                className="px-3 py-1 glass-strong rounded-lg text-sm text-green-300"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingTeamIndex(null); setEditingTeamName('') }}
                                className="px-3 py-1 glass rounded-lg text-sm text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <h5 className={`font-semibold mb-0 text-sm ${teamColor}`}>{team.name}</h5>
                          )}

                          {(isAdmin || (players.find(p => p.name === playerName)?.isCaptain && myTeam === teamIndex)) && editingTeamIndex !== teamIndex && (
                            <button
                              onClick={() => { setEditingTeamIndex(teamIndex); setEditingTeamName(team.name) }}
                              title="Edit team name"
                              className="ml-3 p-1 rounded-md hover:bg-white/5"
                            >
                              <Edit3 className="w-4 h-4 text-gray-300" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {team.players.map((player, playerIndex) => {
                            const isPlayerCoAdmin = coAdmins.includes(player)
                            return (
                              <div
                                key={playerIndex}
                                className="flex items-center justify-between glass-strong rounded-lg p-3"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                  <span className="text-sm">{player}</span>
                                  {gameState.currentDescriberIndex?.[teamIndex] === playerIndex && (
                                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                                      Describer
                                    </span>
                                  )}
                                  {player === playerName && isHost && (
                                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
                                      You (Host)
                                    </span>
                                  )}
                                  {player === playerName && !isHost && isAdmin && (
                                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
                                      You (Co-admin)
                                    </span>
                                  )}
                                  {isPlayerCoAdmin && player !== playerName && (
                                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <Shield className="w-2.5 h-2.5" />
                                      Co-Admin
                                    </span>
                                  )}
                                  {players.find(p => p.name === player)?.isCaptain && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${teamIndex === 0 ? 'bg-blue-500/20 text-blue-400' : teamIndex === 1 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                      <GraduationCap className="w-2.5 h-2.5" />
                                      Captain
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-row items-center gap-1 justify-end flex-shrink-0 ml-2">
                                  {/* Don't show make describer button if already the describer */}
                                  {gameState.currentDescriberIndex?.[teamIndex] !== playerIndex && (
                                    <button
                                      onClick={() => handleMakeDescriber(teamIndex, playerIndex)}
                                      className="w-9 h-9 sm:w-auto sm:h-auto px-2 py-1 sm:px-3 text-xs glass rounded-lg hover:bg-yellow-500/20 transition-colors text-yellow-400 border border-yellow-500/30 flex items-center justify-center gap-1"
                                    >
                                      <UserCheck className="w-3 h-3" />
                                      <span className="hidden sm:inline">Make Describer</span>
                                    </button>
                                  )}
                                  {/* Host can toggle co-admin status for other players */}
                                  {player !== playerName && isHost && (
                                    <>
                                      <button
                                        onClick={() => handleToggleCoAdmin(player)}
                                        className={`w-9 h-9 sm:w-auto sm:h-auto px-2 py-1 sm:px-3 text-xs glass rounded-lg transition-colors flex items-center justify-center gap-1 ${isPlayerCoAdmin
                                          ? 'bg-purple-500/30 text-purple-300 border border-purple-400/50'
                                          : 'hover:bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                          }`}
                                        title={isPlayerCoAdmin ? 'Remove co-admin' : 'Make co-admin'}
                                      >
                                        <Shield className="w-3 h-3" />
                                        <span className="hidden sm:inline">{isPlayerCoAdmin ? 'Admin ✓' : 'Admin'}</span>
                                      </button>
                                      <button
                                        onClick={() => handleKickPlayer(player, false)}
                                        className="w-9 h-9 sm:w-auto sm:h-auto px-2 py-1 sm:px-3 text-xs glass rounded-lg hover:bg-orange-500/20 transition-colors text-orange-400 border border-orange-500/30 flex items-center justify-center gap-1"
                                        title="Kick player (can rejoin)"
                                      >
                                        <UserX className="w-3 h-3" />
                                        <span className="hidden sm:inline">Kick</span>
                                      </button>
                                      <button
                                        onClick={() => handleKickPlayer(player, true)}
                                        className="w-9 h-9 sm:w-auto sm:h-auto px-2 py-1 sm:px-3 text-xs glass rounded-lg hover:bg-red-500/20 transition-colors text-red-400 border border-red-500/30 flex items-center justify-center gap-1"
                                        title="Ban player (cannot rejoin)"
                                      >
                                        <UserX className="w-3 h-3" />
                                        <span className="hidden sm:inline">Ban</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Game Controls Section */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Game Controls
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleAdminSkipTurn}
                    className="px-4 py-3 glass-strong rounded-lg hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2 text-blue-400 border border-blue-500/30"
                  >
                    <SkipForward className="w-5 h-5" />
                    Skip Turn
                  </button>
                  <button
                    onClick={handleEndGame}
                    className="px-4 py-3 glass-strong rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 text-red-400 border border-red-500/30"
                  >
                    <TrophyIcon className="w-5 h-5" />
                    End Game
                  </button>
                </div>
              </div>

              {/* Team Management Section */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  Team Management
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleToggleTeamSwitching}
                    className={`px-3 py-2 h-12 glass-strong rounded-lg transition-colors flex items-center justify-center gap-2 border text-sm ${teamSwitchingLocked
                      ? 'hover:bg-green-500/20 text-green-400 border-green-500/30'
                      : 'hover:bg-orange-500/20 text-orange-400 border-orange-500/30'
                      }`}
                  >
                    {teamSwitchingLocked ? (
                      <>
                        <Unlock className="w-5 h-5" />
                        Unlock Teams
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        Lock Teams
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleToggleTeamLock}
                    className={`px-3 py-2 h-12 glass-strong rounded-lg transition-colors flex items-center justify-center gap-2 border text-sm ${roomJoiningLocked
                      ? 'hover:bg-green-500/20 text-green-400 border-green-500/30'
                      : 'hover:bg-orange-500/20 text-orange-400 border-orange-500/30'
                      }`}
                  >
                    {roomJoiningLocked ? (
                      <>
                        <Unlock className="w-5 h-5" />
                        Unlock Room
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        Lock Room
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleRandomizeTeams}
                    className="px-3 py-2 h-12 glass-strong rounded-lg hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2 text-purple-400 border border-purple-500/30 text-sm"
                  >
                    <Shuffle className="w-5 h-5" />
                    Randomize Teams
                  </button>
                  <button
                    onClick={handleToggleThirdTeam}
                    className={`px-3 py-2 h-12 glass-strong rounded-lg transition-colors flex items-center justify-center gap-2 border text-sm ${gameState.teamCount === 3
                      ? 'hover:bg-red-500/20 text-red-400 border-red-500/30'
                      : 'hover:bg-green-500/20 text-green-400 border-green-500/30'
                      }`}
                  >
                    <Users className="w-5 h-5" />
                    {gameState.teamCount === 3 ? 'Remove Team 3' : 'Add Team 3'}
                  </button>
                </div>
              </div>

              {/* Taboo Settings Section */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="text-orange-400">🚫</span>
                  Taboo Settings
                </h4>
                <div className="space-y-3">
                  {/* Taboo Reporting Toggle */}
                  <div className="flex items-center justify-between glass rounded-lg p-4">
                    <div>
                      <div className="text-sm font-medium">Taboo Reporting</div>
                      <div className="text-xs text-gray-500">Allow watching team to report taboo words</div>
                    </div>
                    <label className="relative cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tabooReporting}
                        onChange={() => {
                          const newReporting = !tabooReporting
                          const newVoting = newReporting ? tabooVoting : false
                          console.log('[ADMIN-PANEL] Setting taboo settings:', { newReporting, newVoting })
                          setTabooSettings(newReporting, newVoting)
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:bg-orange-500 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                    </label>
                  </div>

                  {/* Taboo Voting Toggle */}
                  <div className={`flex items-center justify-between glass rounded-lg p-4 ${!tabooReporting ? 'opacity-50' : ''}`}>
                    <div>
                      <div className="text-sm font-medium">Taboo Voting</div>
                      <div className="text-xs text-gray-500">
                        {tabooReporting ? 'All players vote on reported taboos' : 'Enable reporting first'}
                      </div>
                    </div>
                    <label className={`relative ${tabooReporting ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                      <input
                        type="checkbox"
                        checked={tabooVoting}
                        onChange={() => {
                          if (tabooReporting) {
                            setTabooSettings(tabooReporting, !tabooVoting)
                          }
                        }}
                        disabled={!tabooReporting}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors ${tabooReporting ? 'bg-gray-700 peer-checked:bg-green-500' : 'bg-gray-800'}`}></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                    </label>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    {tabooReporting && tabooVoting
                      ? 'Reported words go to vote. 60% yes confirms taboo penalty.'
                      : tabooReporting
                        ? 'Reported words are auto-confirmed as taboos.'
                        : 'Taboo features are disabled.'}
                  </p>
                </div>
              </div>


            </div>
          </div>
        )}

        {/* Main Content - Full Width */}
        <div className="space-y-4 mt-8 sm:mt-0">
          {/* Header - Scores and Team Players */}
          <div className={`grid grid-cols-1 ${gameState.teamCount === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3 md:gap-4`}>
            {gameState.teams.map((team, teamIndex) => {
              const teamColors = ['blue', 'red', 'green'];
              const teamColor = teamColors[teamIndex];

              return (
                <div key={teamIndex} className={`glass-strong rounded-lg p-3 md:p-4 border border-${teamColor}-500/20 relative ${showHostMenu?.teamIndex === teamIndex ? 'z-50' : 'z-10'}`}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs md:text-sm text-gray-400 font-medium uppercase tracking-wide">
                        {editingTeamIndex === teamIndex ? (
                          <div className="flex items-center gap-2 w-full">
                            <input
                              autoFocus
                              onFocus={(e) => (e.target as HTMLInputElement).select()}
                              className={`flex-1 min-w-0 px-2 py-1 rounded-lg bg-white/5 outline-none text-xs ${teamColor}`}
                              value={editingTeamName}
                              onChange={(e) => setEditingTeamName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(teamIndex) }
                                else if (e.key === 'Escape') { setEditingTeamIndex(null); setEditingTeamName('') }
                              }}
                              placeholder={`Team ${teamIndex + 1}`}
                            />
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => handleSaveEdit(teamIndex)} className="px-2 py-1 glass-strong rounded-lg text-xs text-green-300">Save</button>
                              <button onClick={() => { setEditingTeamIndex(null); setEditingTeamName('') }} className="px-2 py-1 glass rounded-lg text-xs text-gray-300">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="break-words line-clamp-2">{team.name}</div>
                            {(isAdmin || (players.find(p => p.name === playerName)?.isCaptain && myTeam === teamIndex)) && (
                              <button
                                title="Edit team name"
                                onClick={() => { setEditingTeamIndex(teamIndex); setEditingTeamName(team.name) }}
                                className="flex-shrink-0 p-1 rounded-md hover:bg-white/5"
                              >
                                <Edit3 className="w-4 h-4 text-gray-300" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={`text-2xl md:text-3xl font-bold text-${teamColor}-400 mt-1`}>
                        {team.score}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 text-gray-300 flex-shrink-0">
                      <div className="flex items-center gap-1 text-xs md:text-base">
                        <TrophyIcon className={`w-4 h-4 md:w-6 md:h-6 text-yellow-300 opacity-80`} />
                        <span className={`font-semibold text-${teamColor}-300`}>{teamStats?.wins?.[teamIndex] ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs md:text-base">
                        <Handshake className={`w-4 h-4 md:w-6 md:h-6 text-gray-300 opacity-80`} />
                        <span className={`font-semibold text-${teamColor}-300`}>{teamStats?.ties?.[teamIndex] ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs md:text-base">
                        <XCircle className={`w-4 h-4 md:w-6 md:h-6 text-red-400 opacity-80`} />
                        <span className={`font-semibold text-${teamColor}-300`}>{teamStats?.losses?.[teamIndex] ?? 0}</span>
                      </div>
                      {(teamStats?.streaks?.[teamIndex] ?? 0) > 1 && (
                        <div className="glare-badge ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 bg-yellow-400/10 text-yellow-300 rounded-full text-[10px] md:text-xs font-semibold flex items-center gap-0.5 md:gap-1 ring-1 ring-yellow-300/20">
                          <span className="text-xs md:text-sm">🔥</span>
                          <span>{teamStats?.streaks?.[teamIndex]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Team Players */}
                  <div className={`mt-2 pt-2 border-t border-${teamColor}-500/20`}>
                    <div className="text-xs text-gray-500 mb-1">Players:</div>
                    <div className="flex flex-wrap gap-1">
                      {team.players.map((player, idx) => {
                        const isDescriber = gameState.currentTeamIndex === teamIndex &&
                          gameState.currentDescriberIndex[teamIndex] === idx;
                        const isMenuOpen = showHostMenu?.teamIndex === teamIndex && showHostMenu?.playerIndex === idx;
                        const isCaptain = players.find(p => p.name === playerName)?.isCaptain;
                        const canManageTeam = isHost || (isCaptain && myTeam === teamIndex);
                        return (
                          <div key={player} className={`relative ${isMenuOpen ? 'z-50' : 'z-auto'}`}>
                            <button
                              onClick={() => (canManageTeam && player !== playerName) ? setShowHostMenu(isMenuOpen ? null : { teamIndex, playerIndex: idx }) : null}
                              disabled={!canManageTeam || player === playerName}
                              className={`text-xs px-2 py-0.5 rounded ${isDescriber
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : `bg-${teamColor}-500/10 text-${teamColor}-300`
                                } ${canManageTeam && player !== playerName ? 'cursor-pointer hover:brightness-125' : ''} ${player === playerName ? 'opacity-60' : ''}`}
                            >
                              <div className="flex items-center gap-1">
                                {player}
                                {players.find(p => p.name === player)?.isCaptain && <GraduationCap className={`w-3 h-3 ${isDescriber ? 'text-purple-300' : `text-${teamColor}-400`}`} />}
                                {isDescriber ? ' 📢' : ''}
                                {player === playerName ? ' (you)' : ''}
                              </div>
                            </button>

                            {/* Host Menu */}
                            {(isHost || (isCaptain && myTeam === teamIndex)) && isMenuOpen && player !== playerName && (
                              <div className="absolute top-full left-0 mt-1 z-50 glass-strong rounded-lg border border-white/20 overflow-hidden shadow-xl min-w-[140px]">
                                <button
                                  onClick={() => handleMakeDescriber(teamIndex, idx)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-purple-500/20 text-purple-300 transition-colors"
                                >
                                  📢 Make Describer
                                </button>
                                {isHost && (
                                  <>
                                    <button
                                      onClick={() => handleKickPlayer(player, false)}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-orange-500/20 text-orange-400 transition-colors"
                                    >
                                      ⚠️ Kick Player
                                    </button>
                                    <button
                                      onClick={() => handleKickPlayer(player, true)}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/20 text-red-400 transition-colors"
                                    >
                                      🚫 Ban Player
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Role Indicator */}
          {gamePhase === 'playing' && (
            <div className={`glass-strong rounded-lg p-3 md:p-4 text-center border ${isMyTurn
              ? 'border-purple-500/30 bg-purple-500/5'
              : isGuesser
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-gray-500/30 bg-gray-500/5'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-5 h-5 opacity-60" />
                <span className="font-semibold text-lg tracking-wide">
                  {isMyTurn
                    ? 'DESCRIBING'
                    : isGuesser
                      ? 'GUESSING'
                      : 'WATCHING'}
                </span>
              </div>
            </div>
          )
          }
          {/* Turn Start */}
          {
            gamePhase === 'turn-start' && (
              <div className="glass-strong rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center border border-white/10">
                <div className="flex items-center justify-center mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r ${WORD_PACKS.find(p => p.key === selectedWordPack)?.color || 'from-blue-500 to-blue-600'} text-white shadow-lg`}>
                    {WORD_PACKS.find(p => p.key === selectedWordPack)?.name || 'Standard'}
                  </span>
                </div>

                <div className={`text-3xl sm:text-4xl md:text-6xl mb-3 sm:mb-4 font-extrabold px-2 break-words ${gameState.currentTeamIndex === 0 ? 'text-blue-400' :
                  gameState.currentTeamIndex === 1 ? 'text-red-400' :
                    'text-green-400'
                  }`}>
                  {currentTeam?.name || 'Team'}'s Turn
                </div>
                <div className="text-lg sm:text-xl md:text-2xl mb-4 sm:mb-6 flex items-center justify-center gap-2">
                  Describer: <span className="font-bold text-purple-400">{currentDescriber}</span>
                  {players.find(p => p.name === currentDescriber)?.isCaptain && (
                    <GraduationCap className={`w-5 h-5 ${gameState.currentTeamIndex === 0 ? 'text-blue-400' : gameState.currentTeamIndex === 1 ? 'text-red-400' : 'text-green-400'}`} />
                  )}
                </div>
                <div className="text-gray-400 mb-4 sm:mb-6 md:mb-8 text-xs sm:text-sm md:text-base flex items-center justify-center gap-1.5 sm:gap-2">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Round {gameState.round} of {gameState.maxRounds}
                </div>
                {isMyTurn && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4 justify-center items-stretch sm:items-center">
                    <button
                      onClick={startTurn}
                      className="w-full sm:w-auto px-6 sm:px-8 md:px-12 py-3 md:py-4 glass-strong hover:bg-white/5 rounded-lg sm:rounded-xl font-bold text-base sm:text-lg md:text-xl transition-colors border border-white/10"
                    >
                      Start Turn
                    </button>
                    <button
                      onClick={handleSkipDescribing}
                      className="w-full sm:w-auto px-6 sm:px-8 md:px-12 py-3 md:py-4 glass-strong hover:bg-white/5 rounded-lg sm:rounded-xl font-bold text-base sm:text-lg md:text-xl transition-colors border border-white/10"
                    >
                      Skip Turn
                    </button>
                  </div>
                )}
                {!isMyTurn && (
                  <div className="text-gray-400 text-xs sm:text-sm md:text-base opacity-70">
                    Waiting for {currentDescriber} to start...
                  </div>
                )}
              </div>
            )
          }

          {/* Playing */}
          {
            gamePhase === 'playing' && (
              <>
                {/* Timer */}
                <div className={`glass-strong rounded-lg md:rounded-xl p-3 sm:p-4 md:p-6 text-center border transition-colors ${timeRemaining <= 10
                  ? 'border-red-500/40 bg-red-500/5'
                  : 'border-blue-500/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4">
                    <Clock className={`w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 ${timeRemaining <= 10 ? 'text-red-500' : 'text-blue-400'}`} />
                    <div className={`text-3xl sm:text-4xl md:text-5xl font-bold ${timeRemaining <= 10 ? 'text-red-500' : 'text-blue-400'}`}>
                      {timeRemaining}
                    </div>
                  </div>
                </div>

                {/* Words Grid - Only visible to describer */}
                {isMyTurn && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 sm:gap-2 md:gap-3">
                      {currentWords.map((wordObj, index) => {
                        const isGuessed = guessedWords.some(w => w.word === wordObj.word)

                        return (
                          <div
                            key={`${wordObj.word}-${index}`}
                            className={isGuessed
                              ? 'rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border transition-all bg-green-900 border-green-500'
                              : `glass-strong rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border transition-all ${getDifficultyColor(wordObj.difficulty)}`
                            }
                          >
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getDifficultyBadge(wordObj.difficulty).color}`}>
                                  {getDifficultyBadge(wordObj.difficulty).label}
                                </span>
                                <span className={`text-[10px] font-semibold ${getDifficultyBadge(wordObj.difficulty).color.split(' ')[0]}`}>
                                  {wordObj.difficulty.toUpperCase()}
                                </span>
                              </div>
                              <div className="font-bold text-sm sm:text-base md:text-lg lg:text-xl mb-1 sm:mb-2 break-words">{wordObj.word}</div>
                              <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs md:text-sm font-semibold flex items-center justify-center gap-0.5 sm:gap-1">
                                <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-60" />
                                {wordObj.points}pts
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Wrong Guesses Display for Describer */}
                    {(wrongGuesses.length > 0 || guessedByPlayer.length > 0) && (
                      <div className="glass-strong rounded-lg sm:rounded-xl p-3 sm:p-4 border border-white/20">
                        <div className="text-xs sm:text-sm text-gray-300 font-semibold mb-2">Player Guesses:</div>
                        <div className="space-y-2">
                          {/* Group guesses by player */}
                          {Array.from(new Set([...wrongGuesses.map(w => w.guesser), ...guessedByPlayer.map(g => g.guesser)])).map(guesser => {
                            const playerWrong = wrongGuesses.filter(w => w.guesser === guesser)
                            const playerCorrect = guessedByPlayer.filter(g => g.guesser === guesser)

                            return (
                              <div key={guesser} className="glass-strong rounded-lg p-2">
                                <div className="text-xs font-bold text-blue-300 mb-1.5">{guesser}:</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {playerCorrect.map((correct, idx) => (
                                    <span
                                      key={`correct-${idx}`}
                                      className="px-2 py-1 bg-green-500/20 border border-green-500/40 rounded text-xs text-green-300 font-medium"
                                    >
                                      {correct.word}
                                    </span>
                                  ))}
                                  {playerWrong.map((wrong, idx) => (
                                    <span
                                      key={`wrong-${idx}`}
                                      className="px-2 py-1 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-300 font-medium"
                                    >
                                      {wrong.word}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Guess Input - Only for team members who are guessing */}
                {isGuesser && (
                  <div className="glass-strong rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 space-y-2 sm:space-y-3 border border-green-500/30">
                    <div className="flex gap-2 sm:gap-3">
                      <input
                        type="text"
                        value={guess}
                        onChange={handleGuess}
                        onKeyPress={handleKeyPress}
                        placeholder={timeRemaining <= 0 ? "Time's up!" : "Type your guess..."}
                        disabled={timeRemaining <= 0}
                        className="flex-1 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 bg-white/10 border border-white/20 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-white placeholder-gray-400 text-base sm:text-lg md:text-xl text-center font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        autoFocus
                      />
                      <button
                        onClick={submitGuess}
                        disabled={timeRemaining <= 0}
                        className="px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 glass-strong hover:bg-white/5 border border-white/10 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm md:text-base transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        Submit
                      </button>
                    </div>

                    {/* Guesses Display */}
                    {(wrongGuesses.length > 0 || guessedByPlayer.length > 0) && (
                      <div className="mt-3">
                        <div className="text-xs sm:text-sm text-gray-300 font-semibold mb-1.5">Player Guesses:</div>
                        <div className="space-y-2">
                          {/* Group guesses by player */}
                          {Array.from(new Set([...wrongGuesses.map(w => w.guesser), ...guessedByPlayer.map(g => g.guesser)])).map(guesser => {
                            const playerWrong = wrongGuesses.filter(w => w.guesser === guesser)
                            const playerCorrect = guessedByPlayer.filter(g => g.guesser === guesser)

                            return (
                              <div key={guesser} className="glass-strong rounded-lg p-2">
                                <div className="text-xs font-bold text-blue-300 mb-1.5 flex items-center gap-1">
                                  {guesser}:
                                  {players.find(p => p.name === guesser)?.isCaptain && (
                                    <GraduationCap className={`w-3 h-3 ${players.find(p => p.name === guesser)?.team === 0 ? 'text-blue-400' : players.find(p => p.name === guesser)?.team === 1 ? 'text-red-400' : 'text-green-400'}`} />
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {playerCorrect.map((correct, idx) => (
                                    <span
                                      key={`correct-${idx}`}
                                      className="px-2 py-1 bg-green-500/20 border border-green-500/40 rounded text-xs text-green-300 font-medium"
                                    >
                                      {correct.word}
                                    </span>
                                  ))}
                                  {playerWrong.map((wrong, idx) => (
                                    <span
                                      key={`wrong-${idx}`}
                                      className="px-2 py-1 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-300 font-medium"
                                    >
                                      {wrong.word}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Message and Words Grid for opposite team players (watchers) */}
                {!isOnCurrentTeam && (
                  <>
                    <div className="glass-strong rounded-lg sm:rounded-xl p-4 sm:p-6 text-center border border-blue-500/20">
                      <div className="text-lg sm:text-xl font-semibold text-gray-400">
                        Watching {currentTeam?.name || 'Team'}
                      </div>
                      {tabooReportingEnabled ? (
                        <div className="text-xs sm:text-sm text-gray-500 mt-1.5 sm:mt-2">
                          Click a word to report if describer used a taboo!
                        </div>
                      ) : (
                        <div className="text-xs sm:text-sm text-gray-500 mt-1.5 sm:mt-2">
                          Watch as they describe words to their team
                        </div>
                      )}
                    </div>

                    {/* Words Grid for watchers - Clickable for taboo reporting */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 sm:gap-2 md:gap-3">
                      {currentWords.map((wordObj, index) => {
                        const isGuessed = guessedWords.some(w => w.word === wordObj.word)
                        const isConfirmedTaboo = confirmedTaboos.includes(wordObj.word)
                        const hasVoted = myTabooVotes.has(wordObj.word)
                        const voteCount = tabooVotes[wordObj.word]?.length || 0
                        const watchingTeamPlayers = gameState.teams.filter((_, idx) => idx !== gameState.currentTeamIndex).reduce((sum, team) => sum + team.players.length, 0)
                        const votePercentage = watchingTeamPlayers > 0 ? Math.round((voteCount / watchingTeamPlayers) * 100) : 0

                        return (
                          <button
                            key={`${wordObj.word}-${index}`}
                            onClick={() => tabooReportingEnabled && !isConfirmedTaboo && !hasVoted && reportTaboo(wordObj.word)}
                            disabled={!tabooReportingEnabled || isConfirmedTaboo || hasVoted}
                            className={`relative rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border transition-all text-left ${!tabooReportingEnabled
                              ? isGuessed
                                ? 'bg-green-900 border-green-500'
                                : `glass-strong ${getDifficultyColor(wordObj.difficulty)}`
                              : isConfirmedTaboo
                                ? 'bg-orange-900/50 border-orange-500 cursor-not-allowed'
                                : isGuessed
                                  ? hasVoted
                                    ? 'bg-green-900 border-orange-500/50 cursor-not-allowed opacity-75'
                                    : 'bg-green-900 border-green-500 hover:border-orange-400 cursor-pointer'
                                  : hasVoted
                                    ? 'glass-strong border-orange-500/50 cursor-not-allowed opacity-75'
                                    : `glass-strong ${getDifficultyColor(wordObj.difficulty)} hover:border-orange-400 cursor-pointer hover:bg-orange-500/10`
                              }`}
                          >
                            {/* Taboo indicator badge */}
                            {tabooReportingEnabled && (isConfirmedTaboo || voteCount > 0) && (
                              <div className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isConfirmedTaboo ? 'bg-orange-500 text-white' : 'bg-orange-500/30 text-orange-300 border border-orange-500/50'
                                }`}>
                                {isConfirmedTaboo ? '🚫 TABOO' : `${voteCount} vote${voteCount !== 1 ? 's' : ''}`}
                              </div>
                            )}
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getDifficultyBadge(wordObj.difficulty).color}`}>
                                  {getDifficultyBadge(wordObj.difficulty).label}
                                </span>
                                <span className={`text-[10px] font-semibold ${getDifficultyBadge(wordObj.difficulty).color.split(' ')[0]}`}>
                                  {wordObj.difficulty.toUpperCase()}
                                </span>
                              </div>
                              <div className={`font-bold text-sm sm:text-base md:text-lg lg:text-xl mb-1 sm:mb-2 break-words ${isConfirmedTaboo ? 'line-through text-orange-300' : ''}`}>
                                {wordObj.word}
                              </div>
                              <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs md:text-sm font-semibold flex items-center justify-center gap-0.5 sm:gap-1">
                                <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-60" />
                                {wordObj.points}pts
                              </div>
                              {hasVoted && !isConfirmedTaboo && (
                                <div className="mt-1 text-[10px] text-orange-400">✓ You reported</div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Guesses Display for Opposite Team */}
                    {(wrongGuesses.length > 0 || guessedByPlayer.length > 0) && (
                      <div className="glass-strong rounded-lg sm:rounded-xl p-3 sm:p-4 border border-white/20">
                        <div className="text-xs sm:text-sm text-gray-300 font-semibold mb-2">Player Guesses:</div>
                        <div className="space-y-2">
                          {/* Group guesses by player */}
                          {Array.from(new Set([...wrongGuesses.map(w => w.guesser), ...guessedByPlayer.map(g => g.guesser)])).map(guesser => {
                            const playerWrong = wrongGuesses.filter(w => w.guesser === guesser)
                            const playerCorrect = guessedByPlayer.filter(g => g.guesser === guesser)

                            return (
                              <div key={guesser} className="glass-strong rounded-lg p-2">
                                <div className="text-xs font-bold text-blue-300 mb-1.5">{guesser}:</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {playerCorrect.map((correct, idx) => (
                                    <span
                                      key={`correct-${idx}`}
                                      className="px-2 py-1 bg-green-500/20 border border-green-500/40 rounded text-xs text-green-300 font-medium"
                                    >
                                      {correct.word}
                                    </span>
                                  ))}
                                  {playerWrong.map((wrong, idx) => (
                                    <span
                                      key={`wrong-${idx}`}
                                      className="px-2 py-1 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-300 font-medium"
                                    >
                                      {wrong.word}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Controls */}
                {isMyTurn && (
                  <div className="flex gap-3 sm:gap-4 justify-center">
                    <button
                      onClick={handleEndTurn}
                      className="px-5 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 glass-strong hover:bg-white/5 border border-white/10 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base md:text-lg transition-colors"
                    >
                      End Turn
                    </button>
                  </div>
                )}

                {/* Stats */}
                <div className="glass rounded-lg sm:rounded-xl p-3 sm:p-4 flex justify-around text-center gap-2">
                  <div className="flex-1">
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-400">{guessedWords.length}</div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-gray-400">Total Words</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-400">
                      {guessedWords.reduce((sum, w) => sum + w.points, 0)}
                    </div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-gray-400">Total Points</div>
                  </div>
                </div>
              </>
            )
          }

          {/* Turn End */}
          {
            gamePhase === 'turn-end' && (
              <div className="glass-strong rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center border border-yellow-500/30">
                <div className="text-xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 text-yellow-400 break-words px-2">
                  {currentTeam?.name || 'Team'} Finished!
                </div>

                {/* Next Turn Button - Moved to top */}
                {isMyTurn && (
                  <div className="mb-6 sm:mb-8">
                    <button
                      onClick={handleNextTurnButton}
                      className="w-full sm:w-auto px-6 sm:px-8 md:px-12 py-3 md:py-4 glass-strong hover:bg-white/5 border border-white/10 rounded-lg sm:rounded-xl font-bold text-base sm:text-lg md:text-xl transition-colors"
                    >
                      Next Turn
                    </button>
                    <div className="mt-3 text-sm text-gray-400 flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4" />
                      Auto-advancing in {autoAdvanceCountdown}s
                    </div>
                  </div>
                )}
                {!isMyTurn && (
                  <div className="text-gray-400 opacity-70 mb-6 sm:mb-8">
                    Waiting for {currentDescriber}...
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
                  <div className="glass rounded-lg sm:rounded-xl p-3 sm:p-4 border border-green-500/30">
                    <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-green-400 mb-1 sm:mb-2">
                      {guessedWords.length}
                    </div>
                    <div className="text-gray-400 text-xs sm:text-sm md:text-base flex items-center justify-center gap-0.5 sm:gap-1">
                      <TrophyIcon className="w-3 h-3 sm:w-4 sm:h-4 opacity-50" />
                      Words
                    </div>
                  </div>
                  <div className="glass rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-500/30">
                    <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-blue-400 mb-1 sm:mb-2">
                      {guessedWords.reduce((sum, w) => sum + (typeof w.points === 'number' ? w.points : 0), 0)}
                    </div>
                    <div className="text-gray-400 text-xs sm:text-sm md:text-base flex items-center justify-center gap-0.5 sm:gap-1">
                      <Zap className="w-3 h-3 sm:w-4 sm:h-4 opacity-50" />
                      Points
                    </div>
                  </div>
                </div>

                {/* Previous Round Words - Visible to all players */}
                {previousRoundWords.length > 0 && (
                  <div className="mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-300">Words from this round:</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                      {previousRoundWords.map((wordObj, index) => {
                        const wasGuessed = guessedWords.some(w => w.word === wordObj.word)

                        return (
                          <div
                            key={`prev-${wordObj.word}-${index}`}
                            className={`relative glass-strong rounded-lg p-2 sm:p-3 border ${wasGuessed
                              ? 'border-green-500/50 bg-green-500/10'
                              : 'border-red-500/50 bg-red-500/10'
                              }`}
                          >
                            {/* Feedback Icon */}
                            <button
                              onClick={() => handleOpenFeedbackModal(wordObj.word, wordObj.difficulty)}
                              className="absolute top-1 right-1 p-1 rounded-full glass hover:bg-red-500/30 transition-colors group"
                              title="Report word difficulty"
                            >
                              <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400 group-hover:text-red-300" />
                            </button>

                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getDifficultyBadge(wordObj.difficulty).color}`}>
                                  {getDifficultyBadge(wordObj.difficulty).label}
                                </span>
                              </div>
                              <div className={`font-bold text-sm sm:text-base mb-1 ${wasGuessed ? 'text-green-400' : 'text-gray-400'}`}>
                                {wordObj.word}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                                <Zap className="w-2.5 h-2.5 opacity-60" />
                                {wordObj.points}pts
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Individual Player Scoring */}
                {guessedByPlayer.length > 0 && (
                  <div className="mb-4 sm:mb-6 md:mb-8">
                    <h3 className="text-lg sm:text-xl font-semibold mb-3 text-cyan-400">Player Contributions</h3>
                    <div className="space-y-3">
                      {Array.from(new Set(guessedByPlayer.map(g => g.guesser)))
                        .map(guesser => {
                          const playerGuesses = guessedByPlayer.filter(g => g.guesser === guesser && !g.isDuplicate && g.points > 0)
                          const totalPoints = playerGuesses.reduce((sum, g) => sum + (typeof g.points === 'number' ? g.points : 0), 0)
                          return { guesser, playerGuesses, totalPoints }
                        })
                        .filter(({ playerGuesses }) => playerGuesses.length > 0)
                        .sort((a, b) => b.totalPoints - a.totalPoints)
                        .map(({ guesser, playerGuesses, totalPoints }, index) => (
                          <div
                            key={guesser}
                            className="glass-strong rounded-lg p-3 sm:p-4 border border-cyan-500/30 hover:border-cyan-500/50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                                <span className="font-bold text-base sm:text-lg text-cyan-300">{guesser}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Zap className="w-4 h-4 text-yellow-400" />
                                <span className="text-xl sm:text-2xl font-bold text-yellow-400">{totalPoints}</span>
                                <span className="text-xs text-gray-400">pts</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {playerGuesses.map((guess, idx) => {
                                const validPoints = typeof guess.points === 'number' ? guess.points : 0
                                const isDupe = validPoints === 0 || guess.isDuplicate
                                return (
                                  <span
                                    key={idx}
                                    className={`text-xs px-2 py-1 rounded border ${isDupe
                                      ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                                      : 'bg-green-500/20 text-green-300 border-green-500/30'
                                      }`}
                                  >
                                    {guess.word} {isDupe ? '(duplicate)' : `(+${validPoints})`}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )
          }

        </div>

        {/* Game Logs Section - Bottom */}
        {roundHistory.length > 0 && (
          <div className={`grid gap-4 px-2 sm:px-4 pb-4 ${gameState.teams.length === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
            {gameState.teams.map((team, teamIndex) => {
              const teamColors = ['blue', 'red', 'green'];
              const teamColor = teamColors[teamIndex];
              const teamRounds = roundHistory.filter(r => r.teamIndex === teamIndex);
              const teamTaboos = roundHistory
                .filter(r => r.teamIndex === teamIndex && r.tabooWords && r.tabooWords.length > 0)
                .flatMap(r => r.tabooWords!.map(t => ({ ...t, round: r.round, describer: r.describer })));
              const totalTabooPoints = teamTaboos.reduce((sum, t) => sum + t.points, 0);

              if (teamRounds.length === 0 && teamTaboos.length === 0) return null;

              return (
                <div key={teamIndex} className={`glass-strong rounded-lg p-3 md:p-4 border border-${teamColor}-500/30`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-3 h-3 rounded-full bg-${teamColor}-500`}></div>
                    <h3 className={`text-sm font-semibold text-${teamColor}-300`}>{team.name} Log</h3>
                  </div>

                  {/* Describer History */}
                  {teamRounds.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-2">📢 Describers:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {teamRounds.map((entry, idx) => (
                          <span
                            key={idx}
                            className={`text-xs px-2 py-1 rounded bg-${teamColor}-500/15 text-${teamColor}-300 border border-${teamColor}-500/30 ${entry.tabooWords && entry.tabooWords.length > 0 ? 'ring-1 ring-orange-500/50' : ''}`}
                            title={`Round ${entry.round}${entry.tabooWords ? ` - Taboos: ${entry.tabooWords.map(t => t.word).join(', ')}` : ''}`}
                          >
                            R{entry.round}: {entry.describer}
                            {entry.tabooWords && entry.tabooWords.length > 0 && (
                              <span className="text-orange-400 ml-1">🚫{entry.tabooWords.length}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Taboo Words Summary */}
                  {teamTaboos.length > 0 && (
                    <div className="pt-3 border-t border-orange-500/30">
                      <div className="text-xs text-orange-400 mb-2 flex items-center gap-1">
                        🚫 Confirmed Taboos ({teamTaboos.length} word{teamTaboos.length !== 1 ? 's' : ''}, {totalTabooPoints} pts total)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {teamTaboos.map((taboo, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-1 rounded border flex items-center gap-1 bg-green-500/20 text-green-300 border-green-500/40"
                            title={`Round ${taboo.round} by ${taboo.describer} - Confirmed taboo`}
                          >
                            <span className="text-green-400">✓</span>
                            {taboo.word} ({taboo.points}pts)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}


        {/* Bonus Words Notification */}
        {
          showBonusNotification && (
            <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in w-11/12 sm:w-auto">
              <div className="glass-strong rounded-xl px-8 py-4 border-2 border-purple-500/50 bg-purple-500/10 shadow-2xl min-w-[400px] max-w-2xl">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-300 mb-1">🎉 Bonus Words!</div>
                  <div className="text-lg text-purple-200">+{bonusWordCount} extra words added!</div>
                </div>
              </div>
            </div>
          )
        }

        {/* Grace Period Transition Overlay */}
        {
          showGracePeriod && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}>
              <div className="glass-strong rounded-2xl p-8 border-2 border-blue-500/50 bg-blue-500/10 shadow-2xl text-center">
                <div className="flex flex-col items-center gap-4">
                  {/* Animated spinner */}
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-400 rounded-full animate-spin"></div>
                    <Clock className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-blue-300">Time's Up!</div>
                  <div className="text-lg text-gray-300">Finalizing results...</div>
                  <div className="text-sm text-gray-400">Counting last-second guesses</div>
                </div>
              </div>
            </div>
          )
        }

        {/* Confirm Dialog */}
        {
          confirmDialog && (
            <div
              className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
            >
              <div className="glass-strong rounded-2xl p-6 border-2 border-yellow-500/50 bg-yellow-500/5 shadow-2xl max-w-md mx-4">
                <div className="text-center mb-6">
                  <div className="text-xl font-semibold text-yellow-300 mb-2">⚠️ Confirm Action</div>
                  <div className="text-base text-gray-200">{confirmDialog.message}</div>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      confirmDialog.onConfirm()
                    }}
                    className="px-6 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded-lg font-semibold text-yellow-300 transition-colors"
                  >
                    Yes, Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="px-6 py-2.5 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/40 rounded-lg font-semibold text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* Taboo Voting Overlay - Shown at round end (only if taboo voting is enabled) */}
        {tabooVotingEnabled && showTabooVotingOverlay && pendingTabooWords.length > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          >
            <div className="glass-strong rounded-2xl p-6 border-2 border-orange-500/50 bg-orange-500/5 shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="text-center mb-6">
                <div className="text-2xl font-bold text-orange-300 mb-2">🚫 Taboo Voting</div>
                <div className="text-sm text-gray-300 mb-3">
                  Was this word used incorrectly? Vote ✓ for Taboo or ✗ for Not Taboo. 60% yes votes needed to confirm.
                </div>
                <div className="flex items-center justify-center gap-2 text-lg font-semibold text-orange-400">
                  <Clock className="w-5 h-5" />
                  <span>{votingTimeRemaining}s remaining</span>
                </div>
              </div>

              {/* Group by team */}
              {gameState.teams.map((team, teamIndex) => {
                const teamTaboos = pendingTabooWords.filter(w => w.teamIndex === teamIndex)
                if (teamTaboos.length === 0) return null

                const teamColors = ['blue', 'red', 'green']
                const teamColor = teamColors[teamIndex]

                return (
                  <div key={teamIndex} className={`mb-6 last:mb-0`}>
                    <div className={`flex items-center gap-2 mb-3 pb-2 border-b border-${teamColor}-500/30`}>
                      <div className={`w-3 h-3 rounded-full bg-${teamColor}-500`}></div>
                      <h3 className={`text-lg font-semibold text-${teamColor}-300`}>{team.name}</h3>
                    </div>
                    <div className="space-y-3">
                      {teamTaboos.map((tabooWord, idx) => {
                        const votes = roundEndVotes[tabooWord.word] || { yes: [], no: [] }
                        const yesCount = votes.yes?.length || 0
                        const noCount = votes.no?.length || 0
                        const totalVotes = yesCount + noCount
                        const yesPercentage = totalVotes > 0 ? Math.round((yesCount / totalVotes) * 100) : 0
                        const noPercentage = totalVotes > 0 ? Math.round((noCount / totalVotes) * 100) : 0
                        const isFinalized = tabooWord.finalized || yesPercentage >= 60
                        const hasVoted = myRoundEndVotes.has(tabooWord.word)
                        const myVote = myRoundEndVotes.get(tabooWord.word)

                        return (
                          <div
                            key={idx}
                            className={`glass-strong rounded-xl p-4 border-2 transition-all ${isFinalized
                              ? 'border-green-500 bg-green-500/20'
                              : hasVoted
                                ? 'border-orange-500/50 bg-orange-500/10'
                                : 'border-white/20 hover:border-orange-400'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                {isFinalized && (
                                  <div className="text-2xl">✅</div>
                                )}
                                <div>
                                  <div className="text-lg font-bold text-white">{tabooWord.word}</div>
                                  <div className="text-xs text-gray-400">
                                    Described by: {tabooWord.describer} • {tabooWord.points} pts
                                  </div>
                                </div>
                              </div>
                              {!hasVoted ? (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => voteTabooRoundEnd(tabooWord.word, 'yes')}
                                    className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 rounded-lg text-xl font-bold text-green-400 transition-colors"
                                    title="Yes, this was taboo"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => voteTabooRoundEnd(tabooWord.word, 'no')}
                                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-xl font-bold text-red-400 transition-colors"
                                    title="No, this was not taboo"
                                  >
                                    ✗
                                  </button>
                                </div>
                              ) : (
                                <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${isFinalized
                                  ? 'bg-green-500 text-white'
                                  : myVote === 'yes'
                                    ? 'bg-green-500/30 text-green-300'
                                    : 'bg-red-500/30 text-red-300'
                                  }`}>
                                  {isFinalized ? '✓ CONFIRMED TABOO' : myVote === 'yes' ? '✓ Voted Yes' : '✗ Voted No'}
                                </div>
                              )}
                            </div>
                            {/* Vote Progress Bar - Green for yes, Red for no */}
                            <div className="relative">
                              <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
                                <div
                                  className={`h-full transition-all duration-300 bg-green-500`}
                                  style={{ width: `${yesPercentage}%` }}
                                />
                                <div
                                  className={`h-full transition-all duration-300 bg-red-500`}
                                  style={{ width: `${noPercentage}%` }}
                                />
                              </div>
                              {/* 60% threshold marker */}
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white/50"
                                style={{ left: '60%' }}
                              />
                              <div className="flex justify-between mt-1 text-xs">
                                <span className="text-green-400">✓ {yesCount} ({yesPercentage}%)</span>
                                <span className="text-gray-400">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
                                <span className="text-red-400">✗ {noCount} ({noPercentage}%)</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div className="mt-6 text-center text-xs text-gray-500">
                Voting will automatically end when timer expires. Words with &lt;60% yes votes will be dismissed.
              </div>
            </div>
          </div>
        )}

        {/* Team Selection Modal (for 3 teams) */}
        {
          showTeamSelectModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="glass-strong rounded-2xl p-6 border-2 border-blue-500/50 bg-blue-500/5 shadow-2xl max-w-md mx-4">
                <div className="text-center mb-6">
                  <div className="text-xl font-semibold text-blue-300 mb-2">Choose Your Team</div>
                  <div className="text-sm text-gray-300">Select which team you want to join</div>
                </div>
                <div className="space-y-3">
                  {gameState.teams.map((team, index) => (
                    index !== myTeam && (
                      <button
                        key={index}
                        onClick={() => handleSelectTeam(index)}
                        className={`w-full px-6 py-3 rounded-lg font-semibold transition-all border-2 ${index === 0 ? 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/40 text-blue-300' :
                          index === 1 ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-300' :
                            'bg-green-500/20 hover:bg-green-500/30 border-green-500/40 text-green-300'
                          }`}
                      >
                        {team.name} ({team.players.length} players)
                      </button>
                    )
                  ))}
                  <button
                    onClick={() => setShowTeamSelectModal(false)}
                    className="w-full px-6 py-2.5 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/40 rounded-lg font-semibold text-gray-300 transition-colors mt-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* Word Feedback Modal */}
        {feedbackModal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setFeedbackModal(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          >
            <div
              className="glass-strong rounded-2xl p-6 md:p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <Info className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl md:text-2xl font-bold">Word Feedback</h3>
              </div>

              <div className="mb-4">
                <div className="glass rounded-lg p-3 mb-3">
                  <div className="text-sm text-gray-400 mb-1">Word:</div>
                  <div className="text-xl font-bold text-white">{feedbackModal.word}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${getDifficultyBadge(feedbackModal.difficulty).color}`}>
                      {getDifficultyBadge(feedbackModal.difficulty).label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {feedbackModal.difficulty.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-gray-300 mb-3">
                  Help us improve! Select options or provide details:
                </div>

                {/* Feedback Options */}
                <div className="space-y-3 mb-4">
                  {/* Change Difficulty Options */}
                  <div className="glass rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-400 mb-2">Change word difficulty to:</div>
                    <div className="space-y-2">
                      {getOtherDifficulties(feedbackModal.difficulty).map(difficulty => (
                        <label
                          key={difficulty}
                          className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={feedbackOptions.changeDifficultyTo === difficulty}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFeedbackOptions(prev => ({ ...prev, changeDifficultyTo: difficulty }))
                              } else if (feedbackOptions.changeDifficultyTo === difficulty) {
                                setFeedbackOptions(prev => ({ ...prev, changeDifficultyTo: null }))
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                          />
                          <span className="text-sm capitalize flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${getDifficultyBadge(difficulty).color}`}>
                              {getDifficultyBadge(difficulty).label}
                            </span>
                            {difficulty}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Word Too Difficult Option */}
                  <div className="glass rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={feedbackOptions.wordTooDifficult}
                        onChange={(e) => setFeedbackOptions(prev => ({ ...prev, wordTooDifficult: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-red-500 focus:ring-red-500 focus:ring-offset-gray-900"
                      />
                      <span className="text-sm text-red-300">Word too difficult / should be removed</span>
                    </label>
                  </div>
                </div>

                {/* Additional Details Text Area */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-400 mb-2 block">
                    Additional details (optional):
                  </label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Example: Word was too obscure, nobody knew it..."
                    className="w-full px-4 py-3 glass-strong rounded-lg text-white placeholder-gray-500 border border-white/10 focus:border-blue-500/50 focus:outline-none resize-none"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFeedbackModal(null)}
                  className="flex-1 px-4 py-3 glass rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={!feedbackOptions.changeDifficultyTo && !feedbackOptions.wordTooDifficult && !feedbackText.trim()}
                  className="flex-1 px-4 py-3 glass-strong hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Suggestion Modal */}
        {suggestionModalOpen && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
            onClick={() => closeSuggestionModal()}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
          >
            <div
              className="glass-strong rounded-2xl p-6 md:p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl md:text-2xl font-bold">Suggest a Word</h3>
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-400 mb-2 block">Word to suggest</label>
                <input
                  value={suggestionText}
                  onChange={(e) => setSuggestionText(e.target.value)}
                  placeholder="Enter a word to suggest"
                  className="w-full px-4 py-3 glass-strong rounded-lg text-white placeholder-gray-500 border border-white/10 focus:border-amber-400/50 focus:outline-none"
                />

                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-400 mb-2">Suggested difficulty</div>
                  <div className="flex gap-2">
                    {(['easy', 'medium', 'hard'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setSuggestionDifficulty(d)}
                        aria-pressed={suggestionDifficulty === d}
                        className={`px-3 py-1 rounded-md text-sm font-medium ${suggestionDifficulty === d ? (d === 'easy' ? 'bg-green-400 text-black' : d === 'medium' ? 'bg-amber-400 text-black' : 'bg-red-500 text-black') : 'glass text-white/90 hover:bg-white/5'}`}
                      >
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live-check result shown above the submit button */}
                <div className="mt-3 text-sm text-gray-300">
                  {suggestionChecking && <div className="text-xs text-gray-400 mb-1">Checking...</div>}
                  {suggestionCheckResult ? (
                    suggestionCheckResult.exists ? (
                      <div className="text-green-400">"{suggestionCheckResult.word}" already exists in the database.</div>
                    ) : (
                      <div className="text-amber-300">"{suggestionCheckResult.word}" not found — will be stored for review.</div>
                    )
                  ) : (
                    <div className="text-xs text-gray-500">Type to check if the word already exists.</div>
                  )}
                </div>

                <div className="mt-3">
                  <button
                    onClick={submitSuggestion}
                    disabled={!suggestionText.trim() || (suggestionCheckResult?.exists === true) || suggestionSubmitting || suggestionSubmitted}
                    className="w-full px-4 py-2 glass-strong hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors font-semibold disabled:opacity-50"
                  >
                    Submit Suggestion
                  </button>
                </div>
              </div>

              <div className="mt-3">
                {suggestionSubmitted && (
                  <div className="text-sm text-green-300 mb-2">Suggestion submitted — thank you!</div>
                )}
                <div className="flex justify-center items-center gap-3">
                  <button
                    onClick={() => {
                      setSuggestionSubmitting(false)
                      setSuggestionSubmitted(false)
                      closeSuggestionModal()
                    }}
                    className="px-3 py-2 glass rounded-md hover:bg-white/10 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
