// Multiplayer Taboo Game Client
let socket;
let roomCode = null;
let playerName = null;
let isHost = false;
let myTeam = null;
let currentRoom = null;

// Game state
const gameState = {
	teams: [
		{ name: "Team 1", players: [], score: 0 },
		{ name: "Team 2", players: [], score: 0 },
	],
	currentTeamIndex: 0,
	currentDescriberIndex: [0, 0],
	round: 1,
	maxRounds: 6,
	turnTime: 60,
	timerInterval: null,
	timeRemaining: 60,
	currentWords: [],
	guessedWords: [],
	skippedWords: [],
	playerContributions: {},
};

// Word Database
const wordDatabase = [
	{
		word: "TOMORROW",
		taboo: ["DAY", "NEXT", "FUTURE", "AFTER", "TODAY"],
		difficulty: "easy",
		points: 10,
	},
	{
		word: "EYE",
		taboo: ["SEE", "VISION", "LOOK", "SIGHT", "WATCH"],
		difficulty: "easy",
		points: 10,
	},
	{
		word: "CAPTAIN",
		taboo: ["SHIP", "LEADER", "BOAT", "COMMANDER", "SAILOR"],
		difficulty: "easy",
		points: 11,
	},
	{
		word: "TABLET",
		taboo: ["IPAD", "DEVICE", "SCREEN", "COMPUTER", "TECH"],
		difficulty: "easy",
		points: 17,
	},
	{
		word: "SMILE",
		taboo: ["HAPPY", "FACE", "LAUGH", "GRIN", "TEETH"],
		difficulty: "easy",
		points: 8,
	},
	{
		word: "TEETH",
		taboo: ["MOUTH", "BITE", "DENTAL", "WHITE", "BRUSH"],
		difficulty: "easy",
		points: 7,
	},
	{
		word: "DECEPTION",
		taboo: ["LIE", "TRICK", "FAKE", "FOOL", "DECEIVE"],
		difficulty: "hard",
		points: 28,
		rare: "rare",
	},
	{
		word: "TYPICAL",
		taboo: ["NORMAL", "USUAL", "COMMON", "AVERAGE", "REGULAR"],
		difficulty: "medium",
		points: 25,
		rare: "very-rare",
	},
	{
		word: "TORRENT",
		taboo: ["FLOOD", "RUSH", "STREAM", "DOWNLOAD", "WATER"],
		difficulty: "medium",
		points: 28,
		rare: "very-rare",
	},
	{
		word: "DEMOCRACY",
		taboo: ["VOTE", "GOVERNMENT", "PEOPLE", "ELECTION", "FREEDOM"],
		difficulty: "medium",
		points: 15,
	},
	{
		word: "TELESCOPE",
		taboo: ["STARS", "SPACE", "LOOK", "ASTRONOMY", "LENS"],
		difficulty: "medium",
		points: 15,
	},
	{
		word: "METAMORPHOSIS",
		taboo: ["CHANGE", "BUTTERFLY", "TRANSFORM", "CATERPILLAR", "EVOLUTION"],
		difficulty: "hard",
		points: 20,
	},
	{
		word: "PHILOSOPHY",
		taboo: ["THINK", "WISDOM", "QUESTION", "LOGIC", "MEANING"],
		difficulty: "hard",
		points: 30,
		rare: "rare",
	},
];

// Initialize
function init() {
	connectToServer();
	setupEventListeners();
}

// Connect to Socket.IO server
function connectToServer() {
	const serverUrl =
		window.location.hostname === "localhost"
			? "http://localhost:3000"
			: window.location.origin;

	socket = io(serverUrl);

	socket.on("connect", () => {
		console.log("Connected to server");
		updateConnectionStatus(true);
	});

	socket.on("disconnect", () => {
		console.log("Disconnected from server");
		updateConnectionStatus(false);
	});

	socket.on("room-created", handleRoomCreated);
	socket.on("room-joined", handleRoomJoined);
	socket.on("player-joined", handlePlayerJoined);
	socket.on("player-left", handlePlayerLeft);
	socket.on("team-updated", handleTeamUpdated);
	socket.on("game-started", handleGameStarted);
	socket.on("game-state-updated", handleGameStateUpdated);
	socket.on("word-guessed-sync", handleWordGuessedSync);
	socket.on("word-skipped-sync", handleWordSkippedSync);
	socket.on("timer-sync", handleTimerSync);
	socket.on("error", handleError);
}

function updateConnectionStatus(connected) {
	const statusDot = document.querySelector(".status-dot");
	const statusText = document.querySelector(".status-text");

	if (connected) {
		statusDot.classList.add("connected");
		statusText.textContent = "Connected";
	} else {
		statusDot.classList.remove("connected");
		statusText.textContent = "Disconnected";
	}
}

// Event Listeners
function setupEventListeners() {
	document
		.getElementById("create-room-btn")
		.addEventListener("click", createRoom);
	document.getElementById("join-room-btn").addEventListener("click", joinRoom);
	document
		.getElementById("copy-code-btn")
		.addEventListener("click", copyRoomCode);
	document
		.getElementById("start-game-btn")
		.addEventListener("click", startGame);

	document.querySelectorAll(".btn-join-team").forEach((btn) => {
		btn.addEventListener("click", () => joinTeam(parseInt(btn.dataset.team)));
	});

	document.getElementById("ready-btn").addEventListener("click", startTurn);
	document.getElementById("skip-btn").addEventListener("click", skipWord);
	document.getElementById("end-turn-btn").addEventListener("click", endTurn);
	document.getElementById("next-turn-btn").addEventListener("click", nextTurn);
	document
		.getElementById("new-game-btn")
		.addEventListener("click", () => showScreen("room-screen"));

	const guessInput = document.getElementById("guess-input");
	guessInput.addEventListener("input", handleGuess);
}

// Room Management
function createRoom() {
	playerName = document.getElementById("create-player-name").value.trim();

	if (!playerName) {
		alert("Please enter your name");
		return;
	}

	socket.emit("create-room", { playerName });
}

function joinRoom() {
	playerName = document.getElementById("join-player-name").value.trim();
	const code = document
		.getElementById("room-code-input")
		.value.trim()
		.toUpperCase();

	if (!playerName || !code) {
		alert("Please enter your name and room code");
		return;
	}

	socket.emit("join-room", { roomCode: code, playerName });
}

function handleRoomCreated(data) {
	roomCode = data.roomCode;
	currentRoom = data.room;
	isHost = true;

	document.getElementById("room-code-display").textContent = roomCode;
	showScreen("lobby-screen");
	updateLobby();
}

function handleRoomJoined(data) {
	roomCode = data.roomCode;
	currentRoom = data.room;

	document.getElementById("room-code-display").textContent = roomCode;
	showScreen("lobby-screen");
	updateLobby();
}

function handlePlayerJoined(data) {
	currentRoom = data.room;
	updateLobby();
}

function handlePlayerLeft(data) {
	currentRoom = data.room;
	updateLobby();
}

function joinTeam(teamIndex) {
	myTeam = teamIndex;
	socket.emit("join-team", { roomCode, teamIndex });
}

function handleTeamUpdated(data) {
	currentRoom = data.room;
	updateLobby();
}

function updateLobby() {
	const team1List = document.getElementById("team1-players");
	const team2List = document.getElementById("team2-players");

	team1List.innerHTML = "";
	team2List.innerHTML = "";

	currentRoom.players.forEach((player) => {
		const playerDiv = document.createElement("div");
		playerDiv.className = "player-item";
		playerDiv.innerHTML = `
            <div class="player-avatar-small">${player.name
				.charAt(0)
				.toUpperCase()}</div>
            <span>${player.name}${player.id === socket.id ? " (You)" : ""
			}</span>
        `;

		if (player.team === 0) {
			team1List.appendChild(playerDiv);
		} else if (player.team === 1) {
			team2List.appendChild(playerDiv);
		}
	});

	// Check if game can start
	const team1Count = currentRoom.players.filter((p) => p.team === 0).length;
	const team2Count = currentRoom.players.filter((p) => p.team === 1).length;
	const startBtn = document.getElementById("start-game-btn");

	if (isHost && team1Count > 0 && team2Count > 0) {
		startBtn.disabled = false;
	} else {
		startBtn.disabled = true;
	}
}

function copyRoomCode() {
	navigator.clipboard.writeText(roomCode);
	const btn = document.getElementById("copy-code-btn");
	btn.textContent = "✓ Copied!";
	setTimeout(() => {
		btn.textContent = "📋 Copy Code";
	}, 2000);
}

// Game Logic
function startGame() {
	if (!isHost) return;

	// Build teams from current room
	gameState.teams[0].players = currentRoom.players
		.filter((p) => p.team === 0)
		.map((p) => p.name);
	gameState.teams[1].players = currentRoom.players
		.filter((p) => p.team === 1)
		.map((p) => p.name);

	// Initialize player contributions
	[...gameState.teams[0].players, ...gameState.teams[1].players].forEach(
		(player) => {
			gameState.playerContributions[player] = { points: 0, words: [] };
		}
	);

	socket.emit("start-game", { roomCode, gameState });
	handleGameStarted({ gameState });
}

function handleGameStarted(data) {
	Object.assign(gameState, data.gameState);
	showScreen("game-screen");
	showTurnStart();
}

function showTurnStart() {
	const currentTeam = gameState.teams[gameState.currentTeamIndex];
	const describerIndex =
		gameState.currentDescriberIndex[gameState.currentTeamIndex];
	const describer = currentTeam.players[describerIndex];

	document.getElementById(
		"current-team-announce"
	).textContent = `${currentTeam.name}'s Turn`;
	document.getElementById("describer-name").textContent = describer;

	showGamePhase("turn-start");
	updateTeamDisplay();
}

function startTurn() {
	gameState.currentWords = selectWords(10);
	gameState.guessedWords = [];
	gameState.skippedWords = [];
	gameState.timeRemaining = gameState.turnTime;

	renderWordGrid();
	updateContributions();
	updateScores();

	startTimer();

	showGamePhase("active-game");
	document.getElementById("round-number").textContent = gameState.round;
	document.getElementById("guess-input").value = "";
	document.getElementById("guess-input").focus();

	// Sync state
	syncGameState();
}

function selectWords(count) {
	// WORD DISTRIBUTION: Dynamic per round for variety
	// Distribution patterns (all sum to 10 for a 10-word turn)
	const DISTRIBUTION_PATTERNS = [
		{ easy: 4, medium: 4, hard: 2 },  // Balanced (standard)
		{ easy: 5, medium: 3, hard: 2 },  // Easier round
		{ easy: 3, medium: 5, hard: 2 },  // Medium-heavy
		{ easy: 3, medium: 4, hard: 3 },  // Harder round
		{ easy: 4, medium: 3, hard: 3 },  // Hard-leaning
		{ easy: 5, medium: 4, hard: 1 },  // Very easy round
		{ easy: 2, medium: 5, hard: 3 },  // Challenge round
		{ easy: 4, medium: 5, hard: 1 },  // Medium-focused
		{ easy: 3, medium: 3, hard: 4 },  // Hard round
		{ easy: 6, medium: 3, hard: 1 },  // Breather round
	];

	// Shuffle function
	const shuffle = (arr) => {
		const shuffled = [...arr];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	};

	// Group words by difficulty
	const easyWords = shuffle(wordDatabase.filter(w => w.difficulty === 'easy'));
	const mediumWords = shuffle(wordDatabase.filter(w => w.difficulty === 'medium'));
	const hardWords = shuffle(wordDatabase.filter(w => w.difficulty === 'hard'));

	// Select a random distribution pattern for variety
	const pattern = DISTRIBUTION_PATTERNS[Math.floor(Math.random() * DISTRIBUTION_PATTERNS.length)];

	// Scale pattern if count differs from 10
	let distribution;
	if (count !== 10) {
		const scale = count / 10;
		distribution = {
			easy: Math.round(pattern.easy * scale),
			medium: Math.round(pattern.medium * scale),
			hard: Math.max(1, count - Math.round(pattern.easy * scale) - Math.round(pattern.medium * scale))
		};
	} else {
		distribution = { ...pattern };
	}

	// Select words from each difficulty
	const selectedWords = [
		...easyWords.slice(0, Math.min(distribution.easy, easyWords.length)),
		...mediumWords.slice(0, Math.min(distribution.medium, mediumWords.length)),
		...hardWords.slice(0, Math.min(distribution.hard, hardWords.length))
	];

	// Fill remaining if needed
	const remaining = count - selectedWords.length;
	if (remaining > 0) {
		const allOthers = shuffle([...easyWords, ...mediumWords, ...hardWords]
			.filter(w => !selectedWords.includes(w)));
		selectedWords.push(...allOthers.slice(0, remaining));
	}

	// Shuffle the words so they're not always in difficulty order
	return shuffle(selectedWords);
}

function renderWordGrid() {
	const grid = document.getElementById("word-grid");
	grid.innerHTML = "";

	gameState.currentWords.forEach((wordObj, index) => {
		const card = document.createElement("div");
		card.className = "word-card";
		card.classList.add(`difficulty-${wordObj.difficulty}`);

		if (gameState.guessedWords.includes(wordObj)) {
			card.classList.add("guessed");
		}
		if (gameState.skippedWords.includes(wordObj)) {
			card.classList.add("skipped");
		}
		if (wordObj.rare === "rare") card.classList.add("rare");
		if (wordObj.rare === "very-rare") card.classList.add("very-rare");

		card.innerHTML = `
            <div class="word-text">${wordObj.word}</div>
            <div class="word-points">${wordObj.points} points</div>
        `;

		grid.appendChild(card);
	});
}

function handleGuess(e) {
	const guess = e.target.value.trim().toUpperCase();

	if (guess.length === 0) return;

	for (let i = 0; i < gameState.currentWords.length; i++) {
		const wordObj = gameState.currentWords[i];

		if (
			gameState.guessedWords.includes(wordObj) ||
			gameState.skippedWords.includes(wordObj)
		) {
			continue;
		}

		if (guess === wordObj.word) {
			markWordGuessed(i);
			e.target.value = "";
			e.target.classList.add("correct");
			setTimeout(() => e.target.classList.remove("correct"), 500);

			// Notify other players
			socket.emit("word-guessed", {
				roomCode,
				wordIndex: i,
				guesser: playerName,
			});
			return;
		}
	}
}

function markWordGuessed(index) {
	const wordObj = gameState.currentWords[index];

	if (
		gameState.guessedWords.includes(wordObj) ||
		gameState.skippedWords.includes(wordObj)
	) {
		return;
	}

	gameState.guessedWords.push(wordObj);
	gameState.teams[gameState.currentTeamIndex].score += wordObj.points;

	// Update contributions
	if (!gameState.playerContributions[playerName]) {
		gameState.playerContributions[playerName] = { points: 0, words: [] };
	}
	gameState.playerContributions[playerName].points += wordObj.points;
	gameState.playerContributions[playerName].words.push(wordObj.word);

	updateScores();
	renderWordGrid();
	updateContributions();

	// Add more words if needed
	const remaining =
		gameState.currentWords.length -
		gameState.guessedWords.length -
		gameState.skippedWords.length;
	if (remaining === 0) {
		const newWords = selectWords(5);
		gameState.currentWords.push(...newWords);
		renderWordGrid();
	}

	syncGameState();
}

function handleWordGuessedSync(data) {
	markWordGuessed(data.wordIndex);
}

function skipWord() {
	for (let i = 0; i < gameState.currentWords.length; i++) {
		const wordObj = gameState.currentWords[i];
		if (
			!gameState.guessedWords.includes(wordObj) &&
			!gameState.skippedWords.includes(wordObj)
		) {
			gameState.skippedWords.push(wordObj);
			gameState.teams[gameState.currentTeamIndex].score = Math.max(
				0,
				gameState.teams[gameState.currentTeamIndex].score - 1
			);

			updateScores();
			renderWordGrid();

			socket.emit("word-skipped", { roomCode, wordIndex: i });
			syncGameState();
			return;
		}
	}
}

function handleWordSkippedSync(data) {
	renderWordGrid();
}

function startTimer() {
	const timerDisplay = document.getElementById("timer");

	gameState.timerInterval = setInterval(() => {
		gameState.timeRemaining--;
		timerDisplay.textContent = gameState.timeRemaining;

		if (gameState.timeRemaining <= 10) {
			timerDisplay.classList.add("warning");
		}

		if (gameState.timeRemaining <= 0) {
			endTurn();
		}

		// Sync timer every 5 seconds
		if (gameState.timeRemaining % 5 === 0) {
			socket.emit("timer-update", {
				roomCode,
				timeRemaining: gameState.timeRemaining,
			});
		}
	}, 1000);
}

function stopTimer() {
	if (gameState.timerInterval) {
		clearInterval(gameState.timerInterval);
		gameState.timerInterval = null;
	}
	document.getElementById("timer").classList.remove("warning");
}

function handleTimerSync(data) {
	gameState.timeRemaining = data.timeRemaining;
	document.getElementById("timer").textContent = gameState.timeRemaining;
}

function endTurn() {
	stopTimer();

	const pointsEarned =
		gameState.guessedWords.reduce((sum, w) => sum + w.points, 0) -
		gameState.skippedWords.length;
	document.getElementById("words-guessed-count").textContent =
		gameState.guessedWords.length;
	document.getElementById("points-earned").textContent = pointsEarned;

	showGamePhase("round-end");
	syncGameState();
}

function nextTurn() {
	gameState.currentDescriberIndex[gameState.currentTeamIndex]++;
	if (
		gameState.currentDescriberIndex[gameState.currentTeamIndex] >=
		gameState.teams[gameState.currentTeamIndex].players.length
	) {
		gameState.currentDescriberIndex[gameState.currentTeamIndex] = 0;
	}

	gameState.currentTeamIndex = 1 - gameState.currentTeamIndex;

	if (gameState.currentTeamIndex === 0) {
		gameState.round++;
	}

	if (gameState.round > gameState.maxRounds) {
		showGameOver();
		return;
	}

	showTurnStart();
	syncGameState();
}

function showGameOver() {
	const team1 = gameState.teams[0];
	const team2 = gameState.teams[1];

	let winnerText = "";
	if (team1.score > team2.score) {
		winnerText = `🎉 ${team1.name} Wins! 🎉`;
	} else if (team2.score > team1.score) {
		winnerText = `🎉 ${team2.name} Wins! 🎉`;
	} else {
		winnerText = `🤝 It's a Tie! 🤝`;
	}

	document.getElementById("winner-text").textContent = winnerText;
	document.getElementById("final-team1-name").textContent = team1.name;
	document.getElementById("final-team2-name").textContent = team2.name;
	document.getElementById("final-team1-score").textContent = team1.score;
	document.getElementById("final-team2-score").textContent = team2.score;

	showScreen("gameover-screen");
}

function updateScores() {
	document.getElementById("team1-score").textContent = gameState.teams[0].score;
	document.getElementById("team2-score").textContent = gameState.teams[1].score;
}

function updateTeamDisplay() {
	const team1Avatars = document.getElementById("team1-avatars");
	const team2Avatars = document.getElementById("team2-avatars");

	team1Avatars.innerHTML = "";
	team2Avatars.innerHTML = "";

	gameState.teams[0].players.forEach((player) => {
		const avatar = document.createElement("div");
		avatar.className = "avatar-mini";
		avatar.textContent = player.charAt(0).toUpperCase();
		team1Avatars.appendChild(avatar);
	});

	gameState.teams[1].players.forEach((player) => {
		const avatar = document.createElement("div");
		avatar.className = "avatar-mini";
		avatar.textContent = player.charAt(0).toUpperCase();
		team2Avatars.appendChild(avatar);
	});
}

function updateContributions() {
	const container = document.getElementById("player-contributions");
	const totalPoints = document.getElementById("total-points");

	const turnPoints =
		gameState.guessedWords.reduce((sum, w) => sum + w.points, 0) -
		gameState.skippedWords.length;
	totalPoints.textContent = `${turnPoints} points`;

	container.innerHTML = "";

	const currentTeam = gameState.teams[gameState.currentTeamIndex];
	currentTeam.players.forEach((player) => {
		const contrib = gameState.playerContributions[player] || {
			points: 0,
			words: [],
		};

		const div = document.createElement("div");
		div.className = "contribution-item";
		div.innerHTML = `
            <div class="player-info-row">
                <div class="player-avatar-med">${player
				.charAt(0)
				.toUpperCase()}</div>
                <div class="player-name-text">${player}</div>
            </div>
            <div class="player-score">(${contrib.points} points)</div>
            <div class="word-tags">
                ${contrib.words
				.map((w) => `<span class="word-tag">${w}</span>`)
				.join("")}
            </div>
        `;
		container.appendChild(div);
	});
}

function syncGameState() {
	socket.emit("sync-game-state", { roomCode, gameState });
}

function handleGameStateUpdated(data) {
	Object.assign(gameState, data.gameState);
	renderWordGrid();
	updateScores();
	updateContributions();
}

function showScreen(screenId) {
	document.querySelectorAll(".screen").forEach((screen) => {
		screen.classList.remove("active");
	});
	document.getElementById(screenId).classList.add("active");
}

function showGamePhase(phaseId) {
	document.querySelectorAll(".game-phase").forEach((phase) => {
		phase.classList.remove("active");
	});
	document.getElementById(phaseId).classList.add("active");
}

function handleError(data) {
	alert(data.message);
}

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
