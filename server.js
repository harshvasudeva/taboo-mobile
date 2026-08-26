// Load environment variables from .env file
require("dotenv").config();

// Standalone Express + Socket.IO server for local development
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
	cors: {
		origin: ["*", "http://localhost:3001", "https://taboo-inferno.vercel.app"],
		methods: ["GET", "POST"],
		credentials: true,
	},
});

app.use(cors());
app.use(express.static("public"));

// Health endpoint used by Render health checks and uptime monitoring.
app.get("/health", (_req, res) => {
	res.status(200).json({ status: "ok" });
});

// Silence server console output to avoid exposing server logs to clients' consoles.
// This overrides console methods on the Node server only and can be reverted by
// removing these lines during debugging.
if (
	typeof process !== "undefined" &&
	process.release &&
	process.release.name === "node"
) {
	console.log = () => {};
	console.info = () => {};
	console.warn = () => {};
	console.error = () => {};
}

// Game rooms storage
const gameRooms = new Map();

// Ensure team stats exist and have correct length for a room
function ensureTeamStats(room) {
	const teamCount = room.teamCount || 2;
	if (!room.teamStats) {
		room.teamStats = {
			wins: Array(teamCount).fill(0),
			ties: Array(teamCount).fill(0),
			losses: Array(teamCount).fill(0),
			streaks: Array(teamCount).fill(0),
		};
		return;
	}
	// Resize arrays if teamCount changed
	["wins", "ties", "losses", "streaks"].forEach((k) => {
		if (!room.teamStats[k]) room.teamStats[k] = [];
		while (room.teamStats[k].length < teamCount) room.teamStats[k].push(0);
		if (room.teamStats[k].length > teamCount)
			room.teamStats[k] = room.teamStats[k].slice(0, teamCount);
	});
}

// Update room.teamStats based on final gameState scores
function updateStatsOnGameEnd(room) {
	try {
		if (!room || !room.gameState || !room.gameState.teams) return;
		ensureTeamStats(room);
		const scores = room.gameState.teams.map((t) => t.score || 0);
		const maxScore = Math.max(...scores);
		const winners = [];
		scores.forEach((s, idx) => {
			if (s === maxScore) winners.push(idx);
		});

		// If tie among multiple teams
		if (winners.length > 1) {
			// Increment tie counter for each winning team; increment loss for non-winners
			scores.forEach((_, idx) => {
				if (winners.includes(idx))
					room.teamStats.ties[idx] = (room.teamStats.ties[idx] || 0) + 1;
				else room.teamStats.losses[idx] = (room.teamStats.losses[idx] || 0) + 1;
			});
			// Reset streaks on tie
			room.teamStats.streaks = room.teamStats.streaks.map(() => 0);
		} else {
			// Single winner
			scores.forEach((_, idx) => {
				if (idx === winners[0]) {
					room.teamStats.wins[idx] = (room.teamStats.wins[idx] || 0) + 1;
					// increment winner streak
					room.teamStats.streaks[idx] = (room.teamStats.streaks[idx] || 0) + 1;
				} else {
					room.teamStats.losses[idx] = (room.teamStats.losses[idx] || 0) + 1;
					// reset losing team's streak
					room.teamStats.streaks[idx] = 0;
				}
			});
		}
	} catch (e) {
		console.error("Failed to update team stats on game end:", e);
	}
}

// Google Sheets Configuration
// Set these environment variables or hardcode them (not recommended for production)
const GOOGLE_SHEETS_CREDENTIALS = process.env.GOOGLE_SHEETS_CREDENTIALS || null;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID || null;

// Initialize Google Sheets API
let sheetsClient = null;
if (GOOGLE_SHEETS_CREDENTIALS && GOOGLE_SHEETS_ID) {
	try {
		const credentials = JSON.parse(GOOGLE_SHEETS_CREDENTIALS);
		const auth = new google.auth.GoogleAuth({
			credentials,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"],
		});
		sheetsClient = google.sheets({ version: "v4", auth });
		console.log("✅ Google Sheets API initialized successfully");
	} catch (error) {
		console.error("❌ Failed to initialize Google Sheets API:", error.message);
		console.log(
			"Word feedback will be stored locally but not sent to Google Sheets",
		);
	}
} else {
	console.log(
		"⚠️ Google Sheets credentials not configured. Set GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SHEETS_ID environment variables.",
	);
	console.log(
		"Word feedback will be stored locally but not sent to Google Sheets",
	);
}

// Function to send word feedback to Google Sheets
async function sendFeedbackToGoogleSheets(feedbackArray) {
	if (!sheetsClient || !GOOGLE_SHEETS_ID || feedbackArray.length === 0) {
		console.log(
			"Skipping Google Sheets upload (not configured or no feedback)",
		);
		return;
	}

	try {
		// Prepare rows for Google Sheets
		const rows = feedbackArray.map((fb) => [
			fb.timestamp,
			fb.roomCode,
			fb.playerName,
			fb.word,
			fb.difficulty,
			fb.feedback,
		]);

		// Append to Google Sheets
		await sheetsClient.spreadsheets.values.append({
			spreadsheetId: GOOGLE_SHEETS_ID,
			range: "Feedback!A:F", // Sheet name and range
			valueInputOption: "RAW",
			insertDataOption: "INSERT_ROWS",
			resource: {
				values: rows,
			},
		});

		console.log(`✅ Sent ${rows.length} feedback entries to Google Sheets`);
	} catch (error) {
		console.error("❌ Error sending feedback to Google Sheets:", error.message);
	}
}

// Function to send suggestions to Google Sheets (separate sheet/tab)
async function sendSuggestionsToGoogleSheets(suggestionsArray) {
	if (
		!sheetsClient ||
		!GOOGLE_SHEETS_ID ||
		!suggestionsArray ||
		suggestionsArray.length === 0
	) {
		console.log(
			"Skipping Google Sheets suggestions upload (not configured or no suggestions)",
		);
		return;
	}

	try {
		const rows = suggestionsArray.map((s) => [
			s.timestamp,
			s.roomCode || "",
			s.playerName || "",
			s.word || "",
			s.difficulty || "",
		]);

		await sheetsClient.spreadsheets.values.append({
			spreadsheetId: GOOGLE_SHEETS_ID,
			range: "Suggestions!A:E",
			valueInputOption: "RAW",
			insertDataOption: "INSERT_ROWS",
			resource: { values: rows },
		});

		console.log(`✅ Sent ${rows.length} suggestion entries to Google Sheets`);
	} catch (error) {
		console.error(
			"❌ Error sending suggestions to Google Sheets:",
			error.message,
		);
	}
}

// Helper function to handle room closure and send feedback
async function handleRoomClosure(room, roomCode, reason = "Room closed") {
	if (room.wordFeedback && room.wordFeedback.length > 0) {
		console.log(
			`📤 Sending ${room.wordFeedback.length} feedback entries from room ${roomCode} (${reason})`,
		);
		await sendFeedbackToGoogleSheets(room.wordFeedback);
		room.wordFeedback = []; // Clear feedback after sending
	}
	// Send any collected suggestions to Google Sheets as well
	if (room.suggestedWords && room.suggestedWords.length > 0) {
		console.log(
			`📤 Sending ${room.suggestedWords.length} suggestion entries from room ${roomCode} (${reason})`,
		);
		// Ensure each suggestion row includes roomCode and timestamp
		const suggestionsToSend = room.suggestedWords.map((s) => ({
			timestamp: s.timestamp || new Date().toISOString(),
			roomCode: roomCode,
			playerName: s.playerName || "",
			word: s.word || "",
			difficulty: s.difficulty || "",
		}));
		await sendSuggestionsToGoogleSheets(suggestionsToSend);
		room.suggestedWords = [];
	}

	// Clear any persisted team name overrides so closed rooms don't leak names to new rooms
	try {
		if (room && room.teamNames) {
			delete room.teamNames;
		}
	} catch (e) {
		console.warn(`Failed to clear teamNames for room ${roomCode}:`, e);
	}
}

// Helper function to check if a socket is admin (host or co-admin)
function isAdmin(room, socketId) {
	if (!room) return false;
	return (
		room.host === socketId ||
		(room.coAdmins && room.coAdmins.includes(socketId))
	);
}

// Helper function to get client IP from socket (handles proxies)
function getClientIP(socket) {
	// Check various headers for real IP (handles proxies like nginx, cloudflare, etc.)
	const forwardedFor = socket.handshake.headers["x-forwarded-for"];
	if (forwardedFor) {
		// x-forwarded-for can contain multiple IPs, first one is the client
		return forwardedFor.split(",")[0].trim();
	}

	const realIP = socket.handshake.headers["x-real-ip"];
	if (realIP) {
		return realIP;
	}

	// Fallback to socket address
	return socket.handshake.address;
}

// Word database - load from UNIFIED JSON source
const fs = require("fs");

// Load unified word database from JSON
let wordDatabaseJSON;
try {
	wordDatabaseJSON = JSON.parse(
		fs.readFileSync(path.join(__dirname, "wordDatabase.json"), "utf8"),
	);
} catch (e) {
	console.error(
		"Failed to load wordDatabase.json, falling back to wordlist.txt",
	);
	wordDatabaseJSON = null;
}

// Smart scoring for hard words based on word characteristics
// Words that are more abstract, longer, or have complex suffixes get higher points
function getHardWordPoints(word, min, max) {
	const lowerWord = word.toLowerCase();

	let score = min; // Start at minimum (26)

	// === EASIER HARD WORDS (26-32 points) ===
	// Common concepts that are relatively easy to describe
	const easyHardWords = [
		"openness",
		"happiness",
		"sadness",
		"kindness",
		"weakness",
		"darkness",
		"awareness",
		"loneliness",
		"forgiveness",
		"thankfulness",
		"friendship",
		"leadership",
		"membership",
		"partnership",
		"relationship",
		"ownership",
		"childhood",
		"neighborhood",
		"brotherhood",
		"motherhood",
		"fatherhood",
		"freedom",
		"boredom",
		"wisdom",
		"kingdom",
		"random",
		"growth",
		"strength",
		"health",
		"wealth",
		"death",
		"truth",
		"youth",
		"anger",
		"hunger",
		"danger",
		"stranger",
		"murder",
		"wonder",
		"culture",
		"nature",
		"future",
		"picture",
		"structure",
		"adventure",
		"pressure",
		"pleasure",
		"treasure",
		"measure",
		"leisure",
		"balance",
		"distance",
		"instance",
		"substance",
		"importance",
		"difference",
		"confidence",
		"patience",
		"violence",
		"silence",
		"experience",
		"audience",
		"science",
		"absence",
		"presence",
		"knowledge",
		"marriage",
		"courage",
		"language",
		"damage",
		"image",
		"message",
		"passage",
		"storage",
		"usage",
		"package",
		"garbage",
		"privacy",
		"accuracy",
		"democracy",
		"legacy",
		"literacy",
		"anxiety",
		"variety",
		"society",
		"reality",
		"quality",
		"ability",
		"activity",
		"identity",
		"authority",
		"community",
		"opportunity",
		"security",
		"majority",
		"minority",
		"priority",
		"celebrity",
		"creativity",
		"electricity",
		"university",
		"personality",
		"responsibility",
		"addiction",
		"tradition",
		"religion",
		"decision",
		"vision",
		"mission",
		"fashion",
		"passion",
		"expression",
		"impression",
		"depression",
		"attention",
		"intention",
		"invention",
		"prevention",
		"convention",
		"education",
		"situation",
		"information",
		"communication",
		"organization",
		"celebration",
		"imagination",
		"generation",
		"population",
		"reputation",
		"motivation",
		"destination",
		"examination",
		"explanation",
		"expectation",
		"movement",
		"government",
		"environment",
		"entertainment",
		"development",
		"agreement",
		"treatment",
		"statement",
		"management",
		"achievement",
		"excitement",
		"improvement",
		"employment",
		"equipment",
		"experiment",
		"behavior",
		"neighbor",
		"favor",
		"flavor",
		"honor",
		"humor",
		"color",
		"failure",
		"feature",
		"creature",
		"temperature",
		"furniture",
		"signature",
		"literature",
		"architecture",
		"agriculture",
		"manufacture",
		"departure",
		"survival",
		"arrival",
		"approval",
		"removal",
		"proposal",
		"disposal",
		"betrayal",
		"denial",
		"trial",
		"burial",
		"material",
		"memorial",
	];

	// Check if word matches any easy hard word pattern
	for (const easyWord of easyHardWords) {
		if (lowerWord === easyWord || lowerWord.includes(easyWord)) {
			return min + Math.floor(Math.random() * 7); // 26-32 points
		}
	}

	// === WORD LENGTH SCORING ===
	// Shorter words (under 10 chars) are often easier to describe
	if (lowerWord.length <= 8) {
		score += 0; // Keep at base
	} else if (lowerWord.length <= 11) {
		score += 3; // Slightly harder
	} else if (lowerWord.length <= 14) {
		score += 6; // Medium-hard
	} else if (lowerWord.length <= 17) {
		score += 10; // Hard
	} else {
		score += 14; // Very hard (long words)
	}

	// === ABSTRACT SUFFIX SCORING ===
	// Very abstract/philosophical suffixes (hardest to describe)
	const veryHardSuffixes = [
		"ism",
		"ization",
		"ification",
		"ousness",
		"escence",
		"itude",
		"acity",
		"icity",
		"uality",
		"ility",
		"osity",
		"iety",
	];

	// Moderately hard suffixes
	const hardSuffixes = [
		"tion",
		"sion",
		"ness",
		"ment",
		"ance",
		"ence",
		"ity",
		"acy",
		"ery",
	];

	// Check suffixes
	for (const suffix of veryHardSuffixes) {
		if (lowerWord.endsWith(suffix)) {
			score += 8;
			break;
		}
	}

	for (const suffix of hardSuffixes) {
		if (lowerWord.endsWith(suffix)) {
			score += 4;
			break;
		}
	}

	// === ABSTRACT PREFIX SCORING ===
	const abstractPrefixes = [
		"meta",
		"pseudo",
		"quasi",
		"neo",
		"anti",
		"counter",
		"trans",
		"ultra",
		"hyper",
		"super",
		"multi",
		"poly",
		"omni",
		"pan",
		"proto",
		"para",
	];

	for (const prefix of abstractPrefixes) {
		if (lowerWord.startsWith(prefix)) {
			score += 4;
			break;
		}
	}

	// === VERY ABSTRACT CONCEPTS (highest points) ===
	const veryAbstractWords = [
		"epistemology",
		"ontology",
		"phenomenology",
		"metaphysics",
		"hermeneutics",
		"dialectic",
		"eschatology",
		"teleology",
		"axiology",
		"deontology",
		"solipsism",
		"nihilism",
		"existentialism",
		"determinism",
		"relativism",
		"empiricism",
		"rationalism",
		"pragmatism",
		"positivism",
		"structuralism",
		"postmodernism",
		"deconstruction",
		"reductionism",
		"materialism",
		"idealism",
		"hegemony",
		"paradigm",
		"zeitgeist",
		"praxis",
		"gestalt",
		"ethos",
		"pathos",
		"hubris",
		"catharsis",
		"mimesis",
		"anagnorisis",
		"peripeteia",
		"verisimilitude",
		"simulacrum",
		"simulacra",
		"hyperreality",
		"commodification",
		"reification",
		"alienation",
		"objectification",
		"interpellation",
		"subjectification",
		"deterritorialization",
		"rhizome",
		"assemblage",
		"immanence",
		"transcendence",
		"haecceity",
		"quiddity",
		"aseity",
		"ipseity",
		"alterity",
		"aporia",
		"differance",
		"apotheosis",
		"sublimation",
		"cathexis",
		"transference",
		"jouissance",
	];

	for (const abstractWord of veryAbstractWords) {
		if (lowerWord === abstractWord) {
			return max - Math.floor(Math.random() * 5); // 46-50 points
		}
	}

	// Add small random variance (0-3 points)
	score += Math.floor(Math.random() * 4);

	// Clamp to valid range
	return Math.min(max, Math.max(min, score));
}

// Adaptive scoring for easy and medium words based on length/complexity
function getAdaptivePoints(word, min, max, difficulty) {
	const lower = (word || "").toLowerCase();

	// Normalize: remove punctuation but keep spaces (multi-word phrases are often easier)
	const normalized = lower.replace(/["'.,!?():;\/\\\[\]_]/g, "");
	const lettersOnly = normalized.replace(/\s+/g, "").replace(/[^a-z]/g, "");
	const len = Math.max(0, lettersOnly.length);

	// crude syllable estimate: count vowel groups
	const syllables = (lettersOnly.match(/[aeiouy]{1,2}/g) || []).length || 1;

	// Start from min
	let score = min;

	// Very common/short words should stay near the minimum
	const extremelyEasy = new Set([
		"cup",
		"car",
		"cat",
		"dog",
		"bed",
		"pen",
		"cupboard",
		"hat",
		"map",
		"key",
		"sun",
		"moon",
		"egg",
		"ball",
		"book",
		"chair",
		"table",
		"fork",
		"spoon",
		"mug",
	]);
	if (extremelyEasy.has(lettersOnly)) {
		return Math.min(max, Math.max(min, min + 0));
	}

	// Multi-word phrases are generally easier to describe
	if (normalized.includes(" ")) {
		score -= 1; // bias down
	}

	// Base length contribution (longer words usually harder)
	if (len <= 3) score += 0;
	else if (len <= 5) score += 1;
	else if (len <= 8) score += 2;
	else if (len <= 11) score += 3;
	else score += 5;

	// Syllable contribution (more syllables -> slightly harder)
	score += Math.max(0, syllables - 1);

	// Penalize very short tokens (one or two letters)
	if (lettersOnly.length <= 2) score = min;

	// Adjust for difficulty bucket so medium words skew higher
	if (difficulty === "medium") {
		// give a moderate boost for medium difficulty
		score += 2;
		// if word contains uncommon letter combinations, bump slightly
		if (/[qxzj]/.test(lettersOnly)) score += 1;
	}

	// Clip and ensure integer
	score = Math.round(score);
	if (score < min) score = min;
	if (score > max) score = max;

	return score;
}

// Build word database from unified source - separate arrays by difficulty
let wordsByDifficulty = {
	easy: [],
	medium: [],
	hard: [],
	insane: [],
};

if (wordDatabaseJSON) {
	// Build from unified JSON - explicit difficulty categories
	const pointRanges = wordDatabaseJSON.points;

	// Process all four difficulties including insane
	for (const difficulty of ["easy", "medium", "hard", "insane"]) {
		const words = wordDatabaseJSON.words[difficulty] || [];
		const range = pointRanges[difficulty];

		if (!range) {
			console.warn(`No point range defined for difficulty: ${difficulty}`);
			continue;
		}

		words.forEach((word) => {
			let points;
			if (difficulty === "hard" || difficulty === "insane") {
				// Combine adaptive scoring with the existing hard-word heuristics.
				// Use adaptive base, but allow getHardWordPoints to raise score for very abstract/complex words.
				const adaptive = getAdaptivePoints(
					word,
					range.min,
					range.max,
					difficulty,
				);
				const hardSmart = getHardWordPoints(word, range.min, range.max);
				// Take the higher of the two so abstract hard words stay challenging,
				// while shorter/common hard-labeled words don't get unnecessarily large scores.
				points = Math.max(adaptive, hardSmart);
			} else {
				// Adaptive scoring for easy and medium words based on complexity and length
				points = getAdaptivePoints(word, range.min, range.max, difficulty);
			}
			wordsByDifficulty[difficulty].push({
				word: word.toUpperCase(),
				difficulty,
				points,
			});
		});
	}
} else {
	// Fallback to old wordlist.txt
	const wordList = fs
		.readFileSync(path.join(__dirname, "wordlist.txt"), "utf8")
		.split("\n")
		.filter((w) => w.trim() && !w.startsWith("TABOO") && !w.startsWith("//"))
		.map((w) => w.trim());

	wordsByDifficulty.easy = wordList.map((word) => {
		const upperWord = word.toUpperCase();
		return { word: upperWord, difficulty: "easy", points: 10 };
	});
}

// Log word distribution
const easyCount = wordsByDifficulty.easy.length;
const mediumCount = wordsByDifficulty.medium.length;
const hardCount = wordsByDifficulty.hard.length;
const insaneCount = wordsByDifficulty.insane.length;
console.log(
	`Word database loaded: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard, ${insaneCount} insane (total: ${easyCount + mediumCount + hardCount + insaneCount})`,
);

// ========================================
// WORD PACK SYSTEM
// ========================================
// Define word pack configurations
// Each pack specifies which difficulty categories to include
const WORD_PACKS = {
	easy: {
		name: "Taboo - Easy",
		difficulties: ["easy"],
		description: "Easy words only (5-12 points)",
	},
	medium: {
		name: "Taboo - Medium",
		difficulties: ["medium"],
		description: "Medium words only (13-25 points)",
	},
	hard: {
		name: "Taboo - Hard",
		difficulties: ["hard"],
		description: "Hard words only (26-40 points)",
	},
	insane: {
		name: "Taboo - Insane",
		difficulties: ["insane"],
		description: "Insane words only (41-60 points)",
	},
	standard: {
		name: "Taboo - Standard",
		difficulties: ["easy", "medium", "hard"],
		description: "Classic mix of easy, medium, and hard words",
	},
	difficult: {
		name: "Taboo - Difficult",
		difficulties: ["easy", "medium", "hard", "insane"],
		description: "All words including insane difficulty",
	},
	intense: {
		name: "Taboo - Intense",
		difficulties: ["hard", "insane"],
		description: "Hard and insane words only - maximum challenge!",
	},
};

// Add Hindi-specific packs (will pull from custom groups if present in wordDatabase.json)
WORD_PACKS["hindi_easy"] = {
	name: "Taboo - Hindi (Easy)",
	difficulties: ["hindi_easy"],
	description: "Hindi Easy words only (same scoring as English Easy)",
};
WORD_PACKS["hindi_medium"] = {
	name: "Taboo - Hindi (Medium)",
	difficulties: ["hindi_medium"],
	description: "Hindi Medium words only (same scoring as English Medium)",
};
WORD_PACKS["hindi_hard"] = {
	name: "Taboo - Hindi (Hard)",
	difficulties: ["hindi_hard"],
	description: "Hindi Hard words only (same scoring as English Hard)",
};
WORD_PACKS["hindi"] = {
	name: "Taboo - Hindi",
	difficulties: ["hindi_easy", "hindi_medium", "hindi_hard"],
	description: "Mix of Hindi Easy + Medium + Hard",
};

// Build word databases for each pack
const wordDatabasesByPack = {};
// Support custom / language-specific groups defined in wordDatabase.json
// e.g. keys like 'hindi_easy', 'hindi_medium', 'hindi_hard' will be processed
const customWordGroups = {};
if (wordDatabaseJSON && wordDatabaseJSON.words) {
	for (const key of Object.keys(wordDatabaseJSON.words)) {
		if (["easy", "medium", "hard", "insane"].includes(key)) continue;
		// Expecting names like '<lang>_<difficulty>' e.g. 'hindi_easy'
		const m = key.match(/^(.*)_(easy|medium|hard|insane)$/);
		if (!m) continue;
		const baseDiff = m[2];
		const words = wordDatabaseJSON.words[key] || [];
		customWordGroups[key] = [];
		const range =
			wordDatabaseJSON.points && wordDatabaseJSON.points[baseDiff]
				? wordDatabaseJSON.points[baseDiff]
				: { min: 5, max: 50 };
		for (const w of words) {
			const adaptive = getAdaptivePoints(w, range.min, range.max, baseDiff);
			let points = adaptive;
			if (baseDiff === "hard" || baseDiff === "insane") {
				const hardSmart = getHardWordPoints(w, range.min, range.max);
				points = Math.max(adaptive, hardSmart);
			}
			customWordGroups[key].push({
				word: (w || "").toString().toUpperCase(),
				difficulty: baseDiff,
				points,
			});
		}
		console.log(
			`Loaded custom word group '${key}': ${customWordGroups[key].length} words`,
		);
	}
}

for (const [packKey, packConfig] of Object.entries(WORD_PACKS)) {
	wordDatabasesByPack[packKey] = [];
	for (const diff of packConfig.difficulties) {
		if (wordsByDifficulty[diff]) {
			wordDatabasesByPack[packKey].push(...wordsByDifficulty[diff]);
		} else if (customWordGroups[diff]) {
			wordDatabasesByPack[packKey].push(...customWordGroups[diff]);
		} else {
			console.warn(
				`Pack ${packKey} references unknown difficulty/group '${diff}'`,
			);
		}
	}
	console.log(
		`Word pack '${packKey}' (${packConfig.name}): ${wordDatabasesByPack[packKey].length} words`,
	);
}

// Default word database for backward compatibility (standard pack)
let wordDatabase = wordDatabasesByPack["standard"];

// Function to get word database for a specific pack
function getWordDatabaseForPack(packKey) {
	return wordDatabasesByPack[packKey] || wordDatabasesByPack["standard"];
}

// Function to get available difficulties for a pack
function getDifficultiesForPack(packKey) {
	const pack = WORD_PACKS[packKey];
	if (!pack) return ["easy", "medium", "hard"];

	// Map custom group names like 'hindi_easy' -> 'easy' so the server's
	// internal pools (which use base difficulties) populate correctly.
	const mapped = pack.difficulties.map((d) => {
		const m = d.match(/(?:.+)_(easy|medium|hard|insane)$/);
		return m ? m[1] : d;
	});

	// remove duplicates while preserving order
	return [...new Set(mapped)];
}

// Build a fast lookup Set for existence checks (normalized lowercase) - includes ALL words from all difficulties
const allCustomWords = Object.values(customWordGroups || {}).flat();
const wordSet = new Set(
	[
		...wordsByDifficulty.easy,
		...wordsByDifficulty.medium,
		...wordsByDifficulty.hard,
		...wordsByDifficulty.insane,
		...allCustomWords,
	].map((w) => (w.word || "").toString().trim().toLowerCase()),
);

// ========================================
// SHARED CONSTANTS AND HELPERS
// ========================================

// Difficulty ordering for consistent sorting (easy first)
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2, insane: 3 };

// Sort words by difficulty (easy to hard/insane)
function sortByDifficulty(words) {
	return words.sort(
		(a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty],
	);
}

// Ensure word pools are initialized for the room's word pack
function ensureWordPoolsReady(room) {
	const wordPack = room.wordPack || "standard";
	if (!room.wordPools || room.wordPools._wordPack !== wordPack) {
		room.wordPools = initializeWordPools(room.usedWordIndices, wordPack);
	}
	return {
		wordPack,
		packDifficulties: getDifficultiesForPack(wordPack),
		packDatabase:
			room.wordPools._packDatabase || getWordDatabaseForPack(wordPack),
	};
}

// Pull a word from pool, marking it as used. Returns word object or null.
function pullWordFromPool(room, difficulty, packDatabase) {
	if (!room.wordPools[difficulty] || room.wordPools[difficulty].length === 0) {
		return null;
	}
	const wordIndex = popRandomFromArray(room.wordPools[difficulty]);
	if (wordIndex === null || wordIndex === undefined) {
		return null;
	}
	room.usedWordIndices.add(wordIndex);
	return packDatabase[wordIndex];
}

// Pull a word from pool with fallback to other available difficulties
function pullWordWithFallback(
	room,
	preferredDiff,
	packDifficulties,
	packDatabase,
) {
	// Try preferred difficulty first
	const word = pullWordFromPool(room, preferredDiff, packDatabase);
	if (word) return word;

	// Fallback to any available difficulty
	for (const diff of packDifficulties) {
		if (diff !== preferredDiff) {
			const fallbackWord = pullWordFromPool(room, diff, packDatabase);
			if (fallbackWord) return fallbackWord;
		}
	}
	return null;
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

// DYNAMIC DISTRIBUTION GENERATOR
// Creates varied but fair distributions for each round
// Average target: 35% easy, 40% medium, 25% hard
function generateRoundDistribution(wordsPerTurn = 10) {
	// Define distribution patterns (all sum to 10 for a 10-word turn)
	const patterns = [
		{ easy: 4, medium: 4, hard: 2 }, // Balanced (standard)
		{ easy: 5, medium: 3, hard: 2 }, // Easier round
		{ easy: 3, medium: 5, hard: 2 }, // Medium-heavy
		{ easy: 3, medium: 4, hard: 3 }, // Harder round
		{ easy: 4, medium: 3, hard: 3 }, // Hard-leaning
		{ easy: 5, medium: 4, hard: 1 }, // Very easy round
		{ easy: 2, medium: 5, hard: 3 }, // Challenge round
		{ easy: 4, medium: 5, hard: 1 }, // Medium-focused
		{ easy: 3, medium: 3, hard: 4 }, // Hard round
		{ easy: 6, medium: 3, hard: 1 }, // Breather round
	];

	// Select random pattern
	const pattern = patterns[Math.floor(Math.random() * patterns.length)];

	// Scale if wordsPerTurn is different from 10
	if (wordsPerTurn !== 10) {
		const scale = wordsPerTurn / 10;
		return {
			easy: Math.round(pattern.easy * scale),
			medium: Math.round(pattern.medium * scale),
			hard: Math.max(
				1,
				wordsPerTurn -
					Math.round(pattern.easy * scale) -
					Math.round(pattern.medium * scale),
			),
		};
	}

	return { ...pattern };
}

// Generate paired distributions for fairness - both teams get same pattern per round
function generateFairRoundDistributions(
	roundCount,
	teamCount,
	wordsPerTurn = 10,
) {
	const distributions = [];

	for (let round = 0; round < roundCount; round++) {
		// Generate ONE distribution pattern for this round
		const pattern = generateRoundDistribution(wordsPerTurn);
		// Both teams will use the same pattern for fairness
		distributions.push(pattern);
	}

	return distributions;
}

// Helper function to select words avoiding already used ones (legacy - uses new ratio)
// Target: 35% easy, 40% medium, 25% hard (for 10 words: 4 easy, 4 medium, 2 hard)
function selectWords(count, usedWordIndices) {
	// Get indices of words we haven't used yet
	let availableIndices = wordDatabase
		.map((_, index) => index)
		.filter((index) => !usedWordIndices.has(index));

	// If we've used more than 80% of words, reset the used words set
	if (availableIndices.length < wordDatabase.length * 0.2) {
		usedWordIndices.clear();
		availableIndices = wordDatabase.map((_, index) => index);
	}

	// Group by difficulty and shuffle
	const byDifficulty = {
		easy: shuffleArray(
			availableIndices.filter((i) => wordDatabase[i].difficulty === "easy"),
		),
		medium: shuffleArray(
			availableIndices.filter((i) => wordDatabase[i].difficulty === "medium"),
		),
		hard: shuffleArray(
			availableIndices.filter((i) => wordDatabase[i].difficulty === "hard"),
		),
	};

	// Calculate distribution
	const distribution =
		count === 10
			? { easy: 4, medium: 4, hard: 2 }
			: {
					easy: Math.round(count * 0.35),
					medium: Math.round(count * 0.4),
					hard: count - Math.round(count * 0.35) - Math.round(count * 0.4),
				};

	// Select from each difficulty pool
	const selectedIndices = [
		...byDifficulty.easy.slice(0, distribution.easy),
		...byDifficulty.medium.slice(0, distribution.medium),
		...byDifficulty.hard.slice(0, distribution.hard),
	];

	// If we still need more words, fill from remaining
	if (selectedIndices.length < count) {
		const remaining = shuffleArray(
			availableIndices.filter((i) => !selectedIndices.includes(i)),
		);
		selectedIndices.push(...remaining.slice(0, count - selectedIndices.length));
	}

	// Get word objects and mark as used
	const words = selectedIndices.map((index) => {
		usedWordIndices.add(index);
		return wordDatabase[index];
	});

	return sortByDifficulty(words);
}

// WORD DISTRIBUTION SYSTEM
// Target ratio: 35% easy, 40% medium, 25% hard
// Ensures both teams receive equivalent difficulty distribution

const DIFFICULTY_RATIO = {
	easy: 0.35, // 35%
	medium: 0.4, // 40%
	hard: 0.25, // 25%
};

// For a 10-word turn: 4 easy, 4 medium, 2 hard (closest to ratio)
const TURN_DISTRIBUTION = {
	easy: 4,
	medium: 4,
	hard: 2,
};

// Initialize word pools by difficulty for a specific word pack (pre-shuffled)
function initializeWordPools(usedWordIndices, wordPack = "standard") {
	const packDatabase = getWordDatabaseForPack(wordPack);
	const packDifficulties = getDifficultiesForPack(wordPack);

	let availableIndices = packDatabase
		.map((_, index) => index)
		.filter((index) => !usedWordIndices.has(index));

	// If we've used more than 80% of words, reset
	if (availableIndices.length < packDatabase.length * 0.2) {
		usedWordIndices.clear();
		availableIndices = packDatabase.map((_, index) => index);
	}

	// Build pools for all available difficulties in this pack
	const pools = {
		easy: [],
		medium: [],
		hard: [],
		insane: [],
	};

	for (const diff of packDifficulties) {
		pools[diff] = shuffleArray(
			availableIndices.filter((i) => packDatabase[i].difficulty === diff),
		);
	}

	// Store pack reference for word lookup
	pools._packDatabase = packDatabase;
	pools._wordPack = wordPack;

	return pools;
}

// Remove and return a random element from an array (in-place). Returns null if empty.
function popRandomFromArray(arr) {
	if (!arr || arr.length === 0) return null;
	const idx = Math.floor(Math.random() * arr.length);
	return arr.splice(idx, 1)[0];
}

// Generate paired word batches for both teams to ensure fairness
// Each team gets a batch with identical difficulty distribution
function generateTeamWordBatches(
	room,
	wordsPerBatch,
	teamCount,
	customDistribution = null,
) {
	const { packDifficulties, packDatabase } = ensureWordPoolsReady(room);

	// Check if pools need refresh due to size
	const needsRefresh = packDifficulties.some(
		(diff) =>
			!room.wordPools[diff] ||
			room.wordPools[diff].length < wordsPerBatch * teamCount,
	);
	if (needsRefresh) {
		room.wordPools = initializeWordPools(
			room.usedWordIndices,
			room.wordPack || "standard",
		);
	}

	// Use custom distribution or generate based on pack
	const distribution = customDistribution
		? { ...customDistribution }
		: generatePackDistribution(wordsPerBatch, packDifficulties);

	// Generate batches for each team with same distribution (fairness)
	const teamBatches = [];
	for (let team = 0; team < teamCount; team++) {
		const batch = [];

		for (const diff of packDifficulties) {
			for (let i = 0; i < (distribution[diff] || 0); i++) {
				const word = pullWordWithFallback(
					room,
					diff,
					packDifficulties,
					packDatabase,
				);
				if (word) batch.push(word);
			}
		}

		teamBatches.push(shuffleArray(batch));
	}

	return teamBatches;
}

// Generate distribution based on available difficulties in the word pack
function generatePackDistribution(wordsPerBatch, packDifficulties) {
	const distribution = { easy: 0, medium: 0, hard: 0, insane: 0 };

	// If only one difficulty, all words are that difficulty
	if (packDifficulties.length === 1) {
		distribution[packDifficulties[0]] = wordsPerBatch;
		return distribution;
	}

	// If two difficulties (e.g., 'intense' pack with hard + insane)
	if (packDifficulties.length === 2) {
		const half = Math.floor(wordsPerBatch / 2);
		distribution[packDifficulties[0]] = half;
		distribution[packDifficulties[1]] = wordsPerBatch - half;
		return distribution;
	}

	// Standard distribution for 3+ difficulties
	if (
		packDifficulties.includes("easy") &&
		packDifficulties.includes("medium") &&
		packDifficulties.includes("hard")
	) {
		if (packDifficulties.includes("insane")) {
			// Difficult pack: 30% easy, 30% medium, 25% hard, 15% insane
			distribution.easy = Math.round(wordsPerBatch * 0.3);
			distribution.medium = Math.round(wordsPerBatch * 0.3);
			distribution.hard = Math.round(wordsPerBatch * 0.25);
			distribution.insane =
				wordsPerBatch -
				distribution.easy -
				distribution.medium -
				distribution.hard;
		} else {
			// Standard pack: 35% easy, 40% medium, 25% hard
			distribution.easy = Math.round(wordsPerBatch * 0.35);
			distribution.medium = Math.round(wordsPerBatch * 0.4);
			distribution.hard =
				wordsPerBatch - distribution.easy - distribution.medium;
		}
	} else {
		// Even distribution for other combinations
		const perDiff = Math.floor(wordsPerBatch / packDifficulties.length);
		let remaining = wordsPerBatch;
		packDifficulties.forEach((diff, i) => {
			if (i === packDifficulties.length - 1) {
				distribution[diff] = remaining;
			} else {
				distribution[diff] = perDiff;
				remaining -= perDiff;
			}
		});
	}

	return distribution;
}

// Generate a fair game pool - creates paired rounds for all teams
function generateGameWordPool(room, totalRounds, teamCount) {
	const wordsPerTurn = 10;
	const bonusWordsPerTurn = 15; // Extra buffer for bonus words per turn
	const wordsNeededPerTeamPerRound = wordsPerTurn + bonusWordsPerTurn;

	// Initialize tracking for team word distribution
	room.teamWordBatches = {};
	room.teamBonusPools = {};
	room.teamWordStats = {};

	for (let team = 0; team < teamCount; team++) {
		room.teamWordBatches[team] = [];
		room.teamBonusPools[team] = [];
		room.teamWordStats[team] = {
			easy: 0,
			medium: 0,
			hard: 0,
			insane: 0,
			total: 0,
		};
	}

	// Pre-generate word batches for all rounds
	for (let round = 0; round < totalRounds; round++) {
		// Generate main turn words (same distribution for both teams)
		const turnBatches = generateTeamWordBatches(room, wordsPerTurn, teamCount);

		// Generate bonus word pool (same distribution for both teams)
		const bonusBatches = generateTeamWordBatches(
			room,
			bonusWordsPerTurn,
			teamCount,
		);

		for (let team = 0; team < teamCount; team++) {
			room.teamWordBatches[team].push(turnBatches[team]);
			room.teamBonusPools[team].push(bonusBatches[team]);

			// Track stats
			[...turnBatches[team], ...bonusBatches[team]].forEach((word) => {
				room.teamWordStats[team][word.difficulty]++;
				room.teamWordStats[team].total++;
			});
		}
	}

	// Track current round index per team
	room.teamRoundIndex = {};
	room.teamBonusIndex = {};
	for (let team = 0; team < teamCount; team++) {
		room.teamRoundIndex[team] = 0;
		room.teamBonusIndex[team] = 0;
	}

	console.log("Word distribution stats per team:", room.teamWordStats);
}

// Get words for a team's turn - ensures exact distribution
function getWordsForTeamTurn(room, teamIndex, count = 10) {
	const roundIndex = room.teamRoundIndex[teamIndex] || 0;

	// Get the pre-generated batch for this team's turn
	if (
		room.teamWordBatches &&
		room.teamWordBatches[teamIndex] &&
		room.teamWordBatches[teamIndex][roundIndex]
	) {
		const words = room.teamWordBatches[teamIndex][roundIndex];
		room.teamRoundIndex[teamIndex] = roundIndex + 1;
		room.teamBonusIndex[teamIndex] = 0;

		return sortByDifficulty(words.slice(0, count));
	}

	// Fallback: generate new batches if pool exhausted
	const teamCount = room.gameState?.teamCount || 2;
	generateGameWordPool(room, 5, teamCount);
	return getWordsForTeamTurn(room, teamIndex, count);
}

// Get bonus words for a team - maintains same difficulty ratio
function getBonusWordsForTeam(room, teamIndex, count) {
	const roundIndex = (room.teamRoundIndex[teamIndex] || 1) - 1; // Current round
	let bonusIndex = room.teamBonusIndex[teamIndex] || 0;

	if (
		room.teamBonusPools &&
		room.teamBonusPools[teamIndex] &&
		room.teamBonusPools[teamIndex][roundIndex]
	) {
		const bonusPool = room.teamBonusPools[teamIndex][roundIndex];
		const words = bonusPool.slice(bonusIndex, bonusIndex + count);
		room.teamBonusIndex[teamIndex] = bonusIndex + words.length;

		// If we got enough words, return them sorted
		if (words.length >= count) {
			return sortByDifficulty(words);
		}

		// If not enough in current round's pool, get from next round's pool
		const needed = count - words.length;
		const nextRound = roundIndex + 1;
		if (room.teamBonusPools[teamIndex][nextRound]) {
			const moreWords = room.teamBonusPools[teamIndex][nextRound].slice(
				0,
				needed,
			);
			words.push(...moreWords);
		}

		return sortByDifficulty(words);
	}

	// Fallback: generate fresh words with proper distribution
	return generateBonusWordsWithRatio(room, count);
}

// Generate bonus words maintaining the difficulty ratio
function generateBonusWordsWithRatio(room, count) {
	const { packDifficulties, packDatabase } = ensureWordPoolsReady(room);
	const distribution = generatePackDistribution(count, packDifficulties);
	const words = [];

	for (const diff of packDifficulties) {
		for (let i = 0; i < (distribution[diff] || 0); i++) {
			const word = pullWordWithFallback(
				room,
				diff,
				packDifficulties,
				packDatabase,
			);
			if (word) words.push(word);
		}
	}

	return shuffleArray(words);
}

// Get progressive bonus words with specific difficulty targeting
// difficultyType: 'easy', 'medium', 'hard-mixed'
function getProgressiveBonusWords(room, count, difficultyType) {
	const { wordPack, packDifficulties, packDatabase } =
		ensureWordPoolsReady(room);

	// Determine distribution based on difficulty type
	let distribution;
	if (
		!packDifficulties.includes(difficultyType) &&
		difficultyType !== "hard-mixed"
	) {
		distribution = generatePackDistribution(count, packDifficulties);
	} else {
		switch (difficultyType) {
			case "easy":
				distribution = { easy: count, medium: 0, hard: 0, insane: 0 };
				break;
			case "medium":
				distribution = { easy: 0, medium: count, hard: 0, insane: 0 };
				break;
			case "hard-mixed":
				const hardCount = Math.ceil(count * 0.4);
				distribution = {
					easy: 0,
					medium: count - hardCount,
					hard: hardCount,
					insane: 0,
				};
				break;
			default:
				distribution = generatePackDistribution(count, packDifficulties);
		}
	}

	// Pull words based on distribution
	const words = [];
	for (const diff of packDifficulties) {
		for (let i = 0; i < (distribution[diff] || 0); i++) {
			const word = pullWordWithFallback(
				room,
				diff,
				packDifficulties,
				packDatabase,
			);
			if (word) words.push(word);
		}
	}

	return sortByDifficulty(words);
}

// Get dynamic bonus words with specific distribution pattern
// pattern: { easy: number, medium: number, hard: number }
function getDynamicBonusWords(room, pattern) {
	const { packDifficulties, packDatabase } = ensureWordPoolsReady(room);

	// Build distribution from pattern for available difficulties only
	const distribution = { easy: 0, medium: 0, hard: 0, insane: 0 };
	for (const diff of packDifficulties) {
		distribution[diff] = pattern[diff] || 0;
	}

	// Pull words based on distribution
	const words = [];
	for (const diff of packDifficulties) {
		for (let i = 0; i < (distribution[diff] || 0); i++) {
			const word = pullWordWithFallback(
				room,
				diff,
				packDifficulties,
				packDatabase,
			);
			if (word) words.push(word);
		}
	}

	return shuffleArray(words);
}

// Legacy wrapper for backward compatibility
function getWordsFromPool(room, count, ensureMixedDifficulty = false) {
	const teamIndex = room.gameState?.currentTeamIndex || 0;

	if (ensureMixedDifficulty) {
		return getWordsForTeamTurn(room, teamIndex, count);
	} else {
		return getBonusWordsForTeam(room, teamIndex, count);
	}
}

// Helper function to generate room code
function generateRoomCode() {
	return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
	console.log("User connected:", socket.id);

	// Create a new room
	socket.on("create-room", (data) => {
		const roomCode = generateRoomCode();
		const wordPack =
			data.wordPack && WORD_PACKS[data.wordPack] ? data.wordPack : "standard";
		const room = {
			code: roomCode,
			host: socket.id,
			players: [
				{
					id: socket.id,
					name: data.playerName,
					team: null,
					sessionId: data.sessionId || null, // Store session ID for reconnection
				},
			],
			gameState: null,
			started: false,
			teamSwitchingLocked: false,
			usedWordIndices: new Set(), // Track used words to prevent repetition
			teamCount: 2, // Default to 2 teams
			wordPack: wordPack, // Selected word pack
			disconnectedPlayers: new Map(), // Track disconnected players for grace period
			tabooReporting: false, // Taboo reporting off by default
			tabooVoting: false, // Taboo voting off by default
			roundHistory: [], // Store round history for reconnecting players
			bannedPlayers: new Set(), // Track banned player names (for display)
			bannedIPs: new Set(), // Track banned IPs to prevent rejoining
			wordFeedback: [], // Store word feedback from players
			suggestedWords: [], // Store user-suggested words
			gamesPlayed: 0, // Number of times this room has started a new game via Play Again
			teamStats: {
				wins: [0, 0],
				ties: [0, 0],
				losses: [0, 0],
			},
		};

		gameRooms.set(roomCode, room);
		socket.join(roomCode);
		socket.emit("room-created", { roomCode, room, wordPack });
		console.log(`Room created: ${roomCode} with word pack: ${wordPack}`);
	});

	// Reconnect to existing session
	socket.on("reconnect-session", (data) => {
		const { roomCode, playerName, sessionId } = data;
		const room = gameRooms.get(roomCode);

		if (!room) {
			socket.emit("reconnect-failed", { message: "Room no longer exists" });
			return;
		}

		// Get client IP for ban checking
		const clientIP = getClientIP(socket);

		// Check if player's IP is banned
		if (room.bannedIPs && room.bannedIPs.has(clientIP)) {
			socket.emit("reconnect-failed", {
				message: "You have been banned from this room",
			});
			return;
		}

		// Also check name-based ban as fallback
		if (room.bannedPlayers && room.bannedPlayers.has(playerName)) {
			socket.emit("reconnect-failed", {
				message: "You have been banned from this room",
			});
			return;
		}

		// Find player by sessionId or name
		const existingPlayer = room.players.find(
			(p) =>
				(p.sessionId && p.sessionId === sessionId) || p.name === playerName,
		);

		// Also check disconnected players waiting for reconnection
		const disconnectedInfo = room.disconnectedPlayers?.get(playerName);

		if (existingPlayer) {
			// Clear any pending disconnect timer
			if (disconnectedInfo?.timer) {
				clearTimeout(disconnectedInfo.timer);
				room.disconnectedPlayers.delete(playerName);
			}

			// Update socket ID
			const oldSocketId = existingPlayer.id;
			existingPlayer.id = socket.id;
			existingPlayer.sessionId = sessionId;

			// Update host if this was the host
			const wasHost = room.host === oldSocketId;
			if (wasHost) {
				room.host = socket.id;
			}

			// Update co-admin if this was a co-admin
			if (room.coAdmins && room.coAdmins.includes(oldSocketId)) {
				room.coAdmins = room.coAdmins.filter((id) => id !== oldSocketId);
				room.coAdmins.push(socket.id);
			}

			socket.join(roomCode);

			// Check if player is co-admin
			const isCoAdmin = room.coAdmins && room.coAdmins.includes(socket.id);

			// Calculate real-time remaining if there's an active turn
			let gameStateWithTime = room.gameState;
			if (
				room.gameState &&
				room.gameState.turnActive &&
				room.gameState.turnStartTime
			) {
				const elapsedSeconds = Math.floor(
					(Date.now() - room.gameState.turnStartTime) / 1000,
				);
				const turnTime = room.gameState.turnTime || 60;
				const actualTimeRemaining = Math.max(0, turnTime - elapsedSeconds);
				// Create a copy with updated time
				gameStateWithTime = {
					...room.gameState,
					timeRemaining: actualTimeRemaining,
				};
			}

			socket.emit("reconnect-success", {
				roomCode,
				room,
				gameState: gameStateWithTime,
				isHost: room.host === socket.id,
				isCoAdmin,
				playerName: existingPlayer.name,
				roundHistory: room.roundHistory || [],
				tabooReporting: room.tabooReporting || false,
				tabooVoting: room.tabooVoting || false,
			});

			io.to(roomCode).emit("player-reconnected", {
				playerName: existingPlayer.name,
				room,
			});

			console.log(`Player ${playerName} reconnected to room ${roomCode}`);
		} else {
			socket.emit("reconnect-failed", { message: "Session not found in room" });
		}
	});

	// Join existing room
	socket.on("join-room", (data) => {
		const { roomCode, playerName, sessionId } = data;
		const room = gameRooms.get(roomCode);

		if (!room) {
			socket.emit("error", { message: "Room not found" });
			return;
		}

		// Get client IP for ban checking
		const clientIP = getClientIP(socket);

		// Check if player's IP is banned
		if (room.bannedIPs && room.bannedIPs.has(clientIP)) {
			socket.emit("error", {
				message: "You have been banned from this room and cannot rejoin",
			});
			return;
		}

		// Also check name-based ban as fallback (in case IP changed)
		if (room.bannedPlayers && room.bannedPlayers.has(playerName)) {
			socket.emit("error", { message: "You have been banned from this room" });
			return;
		}

		// Check if player already exists (reconnection)
		const existingPlayer = room.players.find((p) => p.name === playerName);

		if (existingPlayer) {
			// Reconnection - update socket ID and session ID
			existingPlayer.id = socket.id;
			existingPlayer.sessionId = sessionId;
			socket.join(roomCode);

			if (room.started) {
				// Calculate real-time remaining if there's an active turn
				// If room joining is locked, prevent new players from joining the room
				if (room.joiningLocked) {
					socket.emit("error", {
						message: "Room is currently locked by the host",
					});
					return;
				}
				let gameStateWithTime = room.gameState;
				if (
					room.gameState &&
					room.gameState.turnActive &&
					room.gameState.turnStartTime
				) {
					const elapsedSeconds = Math.floor(
						(Date.now() - room.gameState.turnStartTime) / 1000,
					);
					const turnTime = room.gameState.turnTime || 60;
					const actualTimeRemaining = Math.max(0, turnTime - elapsedSeconds);
					// Create a copy with updated time
					gameStateWithTime = {
						...room.gameState,
						timeRemaining: actualTimeRemaining,
					};
				}

				socket.emit("room-rejoined", {
					roomCode,
					room,
					gameState: gameStateWithTime,
					roundHistory: room.roundHistory || [],
					tabooReporting: room.tabooReporting || false,
					tabooVoting: room.tabooVoting || false,
				});
				io.to(roomCode).emit("player-reconnected", {
					playerName,
					room,
				});
			} else {
				socket.emit("room-joined", {
					roomCode,
					room,
					teamCount: room.teamCount || 2,
					tabooReporting: room.tabooReporting || false,
					tabooVoting: room.tabooVoting || false,
				});
				io.to(roomCode).emit("player-joined", {
					player: existingPlayer,
					room,
					teamCount: room.teamCount || 2,
				});
			}
			console.log(`Player ${playerName} reconnected to room: ${roomCode}`);
			return;
		}

		// New player joining
		const newPlayer = {
			id: socket.id,
			name: playerName,
			team: null,
			sessionId: sessionId || null, // Store session ID for reconnection
		};

		room.players.push(newPlayer);
		socket.join(roomCode);

		if (room.started) {
			// Mid-game join - allow them to join and assign to a team later
			socket.emit("room-joined-midgame", {
				roomCode,
				room,
				gameState: room.gameState,
				teamCount: room.gameState?.teamCount || 2,
			});
			io.to(roomCode).emit("player-joined-midgame", {
				player: newPlayer,
				room,
			});
			console.log(`Player ${playerName} joined mid-game in room: ${roomCode}`);
		} else {
			// Normal join before game starts
			socket.emit("room-joined", {
				roomCode,
				room,
				teamCount: room.teamCount || 2,
				tabooReporting: room.tabooReporting || false,
				tabooVoting: room.tabooVoting || false,
			});
			io.to(roomCode).emit("player-joined", {
				player: newPlayer,
				room,
				teamCount: room.teamCount || 2,
			});

			// If draft is in progress, send draft state to new player and update available players
			if (room.draftState) {
				const ds = room.draftState;
				// Add new player to available players and update initial count
				if (ds.availablePlayers) {
					ds.availablePlayers.push({ id: newPlayer.id, name: newPlayer.name });
					// Update initialAvailableCount to reflect new player count for even/odd logic
					ds.initialAvailableCount = (ds.initialAvailableCount || 0) + 1;
				}

				// Send current draft state to the new player so they see the overlay
				socket.emit("captain-pick-turn", {
					teams: ds.teams,
					availablePlayers: ds.availablePlayers,
					currentCaptainId: ds.captains[ds.currentCaptainIndex],
					currentCaptainName: room.players.find(
						(p) => p.id === ds.captains[ds.currentCaptainIndex],
					)?.name,
					coinResult: ds.currentCaptainIndex,
					captains: ds.captains,
				});

				// Notify other clients about the new available player (without disrupting their state)
				socket.to(roomCode).emit("draft-player-added", {
					player: { id: newPlayer.id, name: newPlayer.name },
					availablePlayers: ds.availablePlayers,
				});
			}

			console.log(`Player ${playerName} joined room: ${roomCode}`);
		}
	});

	// Assign player to team
	socket.on("join-team", (data) => {
		const { roomCode, teamIndex } = data;
		const room = gameRooms.get(roomCode);

		if (room) {
			// Check if team switching is locked: allow new joiners (team === null) to join teams,
			// but prevent existing players from switching teams when locked.
			const currentPlayer = room.players.find((p) => p.id === socket.id);
			if (
				room.teamSwitchingLocked &&
				currentPlayer &&
				currentPlayer.team !== null
			) {
				socket.emit("error", {
					message: "Team switching is currently locked by the host",
				});
				return;
			}

			// If room joining is locked, prevent players who were not previously in the room
			// from joining teams (this is a strict room lock).
			if (room.joiningLocked && currentPlayer && currentPlayer.team === null) {
				socket.emit("error", {
					message: "Room is locked. New players cannot join teams right now.",
				});
				return;
			}

			const player = room.players.find((p) => p.id === socket.id);
			if (player) {
				player.team = teamIndex;

				// If game is in progress, also update player in the game state teams
				if (room.started && room.gameState) {
					const teamName = room.gameState.teams[teamIndex].name;

					// First, remove player from all teams
					room.gameState.teams.forEach((team) => {
						const playerIndex = team.players.indexOf(player.name);
						if (playerIndex !== -1) {
							team.players.splice(playerIndex, 1);
						}
					});

					// Then add to the new team
					if (!room.gameState.teams[teamIndex].players.includes(player.name)) {
						room.gameState.teams[teamIndex].players.push(player.name);

						// Initialize describer index if needed
						if (room.gameState.currentDescriberIndex[teamIndex] === undefined) {
							room.gameState.currentDescriberIndex[teamIndex] = 0;
						}

						// Check if there's an active turn and send current turn state to the new player
						const turnInProgress =
							room.gameState.currentWords &&
							room.gameState.currentWords.length > 0;

						io.to(roomCode).emit("team-updated-midgame", {
							room,
							gameState: room.gameState,
							joinedPlayer: player.name,
							joinedTeam: teamName,
							turnInProgress: turnInProgress,
							currentWords: turnInProgress ? room.gameState.currentWords : null,
							timeRemaining: turnInProgress
								? room.gameState.timeRemaining
								: null,
							currentTurnGuessedWords:
								room.gameState.currentTurnGuessedWords || [],
							currentTurnWrongGuesses:
								room.gameState.currentTurnWrongGuesses || [],
							guessedByPlayer: room.gameState.guessedByPlayer || [],
						});
						console.log(
							`Player ${player.name} switched to ${teamName} mid-game`,
						);
						return;
					}
				}

				io.to(roomCode).emit("team-updated", { room });
			}
		}
	});

	// Set team count (host only)
	socket.on("set-team-count", (data) => {
		const { roomCode, teamCount } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.host === socket.id) {
			// Store team count in room
			room.teamCount = teamCount;
			// Broadcast the team count to all players in the room
			io.to(roomCode).emit("team-count-changed", { teamCount });
			console.log(`Team count set to ${teamCount} in room ${roomCode}`);
		}
	});

	// Set taboo settings (host or admin)
	socket.on("set-taboo-settings", (data) => {
		const { roomCode, tabooReporting, tabooVoting } = data;
		const room = gameRooms.get(roomCode);

		if (room) {
			// Check if sender is host or co-admin using the helper
			if (isAdmin(room, socket.id)) {
				room.tabooReporting = tabooReporting;
				room.tabooVoting = tabooVoting;
				// Also update gameState if it exists
				if (room.gameState) {
					room.gameState.tabooReporting = tabooReporting;
					room.gameState.tabooVoting = tabooVoting;
				}
				// Broadcast settings to all players
				io.to(roomCode).emit("taboo-settings-changed", {
					tabooReporting,
					tabooVoting,
				});
				console.log(
					`Taboo settings updated in room ${roomCode}: reporting=${tabooReporting}, voting=${tabooVoting}`,
				);
			} else {
				console.log(
					`Unauthorized taboo settings change attempt in room ${roomCode} by socket ${socket.id}`,
				);
			}
		}
	});

	// Change word pack (host or admin)
	socket.on("change-word-pack", (data) => {
		const { roomCode, wordPack } = data;
		const room = gameRooms.get(roomCode);

		if (room && isAdmin(room, socket.id)) {
			// Validate if word pack exists
			if (WORD_PACKS[wordPack]) {
				room.wordPack = wordPack;
				// Re-initialize pools for the new pack
				room.wordPools = initializeWordPools(room.usedWordIndices, wordPack);

				// Broadcast change to all players
				io.to(roomCode).emit("word-pack-changed", { wordPack });
				console.log(`Word pack changed to ${wordPack} in room ${roomCode}`);
			}
		}
	});

	// Quick existence check for suggested words (fast O(1) lookup using in-memory Set)
	socket.on("check-word-exists", (data) => {
		const { roomCode, word } = data || {};
		if (!word) {
			socket.emit("check-word-result", { word: "", exists: false });
			return;
		}
		const normalized = word.toString().trim().toLowerCase();
		const exists = wordSet.has(normalized);
		// Reply only to the requesting socket
		socket.emit("check-word-result", { word, exists });
	});

	// Receive suggested words from clients
	socket.on("suggest-word", (data) => {
		const { roomCode, playerName, word, difficulty, timestamp } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room) return;

		// Ensure suggestedWords array exists
		if (!room.suggestedWords) room.suggestedWords = [];

		const normalizedUpper = (word || "").toString().trim().toUpperCase();
		const normalizedLower = normalizedUpper.toLowerCase();
		const exists = wordSet.has(normalizedLower);
		const alreadySuggested = room.suggestedWords.some(
			(s) => s.word === normalizedUpper,
		);

		if (!alreadySuggested) {
			// Store suggestion with metadata (include suggested difficulty)
			room.suggestedWords.push({
				playerName,
				word: normalizedUpper,
				difficulty: difficulty || "medium",
				timestamp: timestamp || new Date().toISOString(),
				exists,
			});
			console.log(
				`Suggestion in room ${roomCode}: "${normalizedUpper}" by ${playerName} (exists=${exists})`,
			);
		} else {
			console.log(
				`Duplicate suggestion suppressed in room ${roomCode}: "${normalizedUpper}" by ${playerName}`,
			);
		}

		// Reply to client with result and explicit success flag
		socket.emit("suggest-word-result", {
			success: true,
			word: normalizedUpper,
			exists,
			alreadySuggested,
			difficulty: difficulty || "medium",
		});
	});

	// Submit word feedback
	socket.on("submit-word-feedback", (data) => {
		const { roomCode, playerName, word, difficulty, feedback, timestamp } =
			data;
		const room = gameRooms.get(roomCode);

		if (room) {
			// Initialize wordFeedback array if it doesn't exist
			if (!room.wordFeedback) {
				room.wordFeedback = [];
			}

			// Store the feedback
			room.wordFeedback.push({
				roomCode,
				playerName,
				word,
				difficulty,
				feedback,
				timestamp,
			});

			console.log(
				`Word feedback submitted in room ${roomCode}: "${word}" by ${playerName} - "${feedback}"`,
			);
		}
	});

	// Start game
	socket.on("start-game", (data) => {
		const { roomCode, gameState } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.host === socket.id) {
			room.started = true;

			// Ensure we have the right number of teams based on teamCount
			const teamCount = gameState.teamCount || 2;
			const teams = [];

			// Create teams based on teamCount
			for (let i = 0; i < teamCount; i++) {
				teams.push({
					name: gameState.teams[i]?.name || `Team ${i + 1}`,
					players: gameState.teams[i]?.players || [],
					score: 0,
				});
			}

			// Reset game state completely for new game
			room.gameState = {
				...gameState,
				teamCount: teamCount, // Store team count
				gameStarted: true, // Add this flag for disconnect handler to check
				turnCount: {}, // Reset turn counter
				round: 1,
				currentTeamIndex: 0,
				currentDescriberIndex: Array(teamCount).fill(0),
				teams: teams,
				guessedWords: [],
				skippedWords: [],
				currentWords: [],
				currentTurnGuessedWords: [],
				currentTurnWrongGuesses: [],
				playerContributions: {}, // { playerName: { points: 0, guessedWords: [], describedWords: [] } }
				tabooReporting: room.tabooReporting || false, // Default disabled
				tabooVoting: room.tabooVoting || false, // Default disabled
				confirmedTaboosByTeam: {}, // Track taboo point deductions per team: { teamIndex: totalPoints }
			};

			// If room.teamNames exists (persisted from lobby edits), apply them to the new game state teams
			if (
				room.teamNames &&
				Array.isArray(room.teamNames) &&
				Array.isArray(room.gameState.teams)
			) {
				for (let i = 0; i < room.gameState.teams.length; i++) {
					if (room.teamNames[i]) {
						room.gameState.teams[i].name = room.teamNames[i];
					}
				}
			}

			// Reset used words for the new game
			room.usedWordIndices = new Set();
			room.wordPools = null; // Reset word pools

			// Ensure any previous room/team locks are cleared when a fresh game starts
			// This prevents stale locks from blocking new joiners or preventing team changes
			room.joiningLocked = false;
			room.teamSwitchingLocked = false;
			// Notify clients that locks are lifted for the new game (silent automatic reset)
			io.to(roomCode).emit("room-joining-locked", {
				locked: false,
				silent: true,
			});
			io.to(roomCode).emit("team-switching-locked", {
				locked: false,
				silent: true,
			});

			// Pre-generate fair word pools for all teams
			// This ensures both teams get identical difficulty distribution
			const estimatedTurnsPerTeam = gameState.maxRounds || 5;
			generateGameWordPool(room, estimatedTurnsPerTeam, teamCount);

			console.log(
				`Game word pools generated: ${estimatedTurnsPerTeam} rounds for ${teamCount} teams`,
			);
			console.log(`Target distribution: 35% easy, 40% medium, 25% hard`);

			// Ensure stats array sizes match team count before starting
			ensureTeamStats(room);
			io.to(roomCode).emit("game-started", {
				gameState: room.gameState,
				room: {
					players: room.players,
					host: room.host,
					coAdmins: room.coAdmins,
					teamStats: room.teamStats,
					gamesPlayed: room.gamesPlayed,
					teamNames: room.teamNames,
				},
			});
			console.log(`Game started in room: ${roomCode} with ${teamCount} teams`);
		}
	});

	// Sync game state
	socket.on("sync-game-state", (data) => {
		const { roomCode, gameState } = data;
		const room = gameRooms.get(roomCode);

		if (room) {
			room.gameState = gameState;
			io.to(roomCode).emit("game-state-updated", { gameState });
		}
	});

	// Start turn - generate words on server
	socket.on("start-turn", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Prevent rapid duplicate processing of next-turn (clients may emit twice)
			// If the last next-turn was processed less than 800ms ago, ignore this call.
			if (gs._lastNextTurnAt && Date.now() - gs._lastNextTurnAt < 800) {
				// Ignore rapid duplicate next-turn requests
				return;
			}
			gs._lastNextTurnAt = Date.now();

			// Mark that this turn has started for the current team
			if (!gs.turnCount) {
				gs.turnCount = {};
			}
			if (!gs.turnCount[gs.currentTeamIndex]) {
				gs.turnCount[gs.currentTeamIndex] = 0;
			}

			// Get words from the pre-generated pool to ensure fairness
			const words = getWordsFromPool(room, 10, true);

			// Clear guessed words for new turn and store current words
			gs.currentTurnGuessedWords = [];
			gs.currentTurnWrongGuesses = [];
			gs.guessedByPlayer = []; // Initialize tracking for who guessed what
			gs.currentWords = words; // Store words in game state for mid-game joins
			gs.timeRemaining = gs.turnTime || 60; // Store initial time
			gs.turnStartTime = Date.now(); // Record server timestamp when turn starts
			gs.turnActive = true; // Mark turn as active
			gs.tabooVotes = {}; // Clear taboo votes for new turn
			gs.confirmedTaboos = []; // Clear confirmed taboos for new turn
			gs.confirmedTabooDetails = []; // Clear taboo details for new turn

			// Broadcast turn started with words to all players
			io.to(roomCode).emit("turn-started", {
				gameState: gs,
				words: words,
			});
		}
	});

	// Word guessed
	socket.on("word-guessed", (data) => {
		const { roomCode, word, wordObj, guesser, points } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Validate guess timing with grace period
			// Allow guesses during grace period even if turnActive is false (for last-second guesses)
			const GRACE_PERIOD_MS = 2000; // 2 second grace period for network latency
			const turnDuration = (gs.turnTime || 60) * 1000; // Convert to milliseconds

			// If turnStartTime is null and we're not in grace period, turn is fully over
			if (!gs.turnStartTime && !gs.inGracePeriod) {
				console.log(
					`Late guess rejected from ${guesser}: "${word}" - turn already fully ended`,
				);
				io.to(socket.id).emit("guess-rejected", {
					message: "Time's up! Your guess arrived too late.",
					word: word,
				});
				return;
			}

			const elapsedTime = Date.now() - (gs.turnStartTime || Date.now());
			const maxAllowedTime = turnDuration + GRACE_PERIOD_MS;

			// Check if we're within the grace period (allows last-second guesses)
			// Also accept if server is explicitly in grace period (inGracePeriod flag)
			const isWithinGracePeriod =
				gs.inGracePeriod || elapsedTime <= maxAllowedTime;

			// Reject guess only if we're past the grace period
			if (!isWithinGracePeriod) {
				console.log(
					`Late guess rejected from ${guesser}: "${word}" arrived ${Math.floor(elapsedTime / 1000)}s after turn start (max allowed: ${Math.floor(maxAllowedTime / 1000)}s)`,
				);
				// Notify the specific player that their guess was too late
				io.to(socket.id).emit("guess-rejected", {
					message: "Time's up! Your guess arrived too late.",
					word: word,
				});
				return; // Don't process late guesses
			}

			// Log grace period guess for debugging
			if (!gs.turnActive && isWithinGracePeriod) {
				console.log(
					`Grace period guess accepted from ${guesser}: "${word}" at ${Math.floor(elapsedTime / 1000)}s (grace period active)`,
				);
			}

			// Initialize guessed words tracking if not exists
			if (!gs.currentTurnGuessedWords) {
				gs.currentTurnGuessedWords = [];
			}

			// Initialize guessedByPlayer tracking if not exists
			if (!gs.guessedByPlayer) {
				gs.guessedByPlayer = [];
			}

			// Check if word was already guessed this turn
			const isDuplicate = gs.currentTurnGuessedWords.includes(word);
			const actualPoints = isDuplicate ? 0 : points;

			if (!isDuplicate) {
				// Add to guessed words list only if not duplicate
				gs.currentTurnGuessedWords.push(word);
			} else {
				console.log(
					`Word "${word}" already guessed by someone else, ${guesser} gets 0 points`,
				);
			}

			// Track who guessed this word (with actual points - 0 if duplicate)
			gs.guessedByPlayer.push({
				word,
				guesser,
				points: actualPoints,
				isDuplicate,
			});

			// Update team score (only if not duplicate)
			if (!isDuplicate) {
				const teamIndex = gs.currentTeamIndex;
				gs.teams[teamIndex].score += points;

				// Track player contribution
				if (!gs.playerContributions[guesser]) {
					gs.playerContributions[guesser] = {
						points: 0,
						guessedWords: [],
						describedWords: [],
					};
				}
				gs.playerContributions[guesser].points += points;
				gs.playerContributions[guesser].guessedWords.push(word);

				// Track describer's success
				const currentDescriber =
					gs.teams[teamIndex].players[gs.currentDescriberIndex[teamIndex]];
				if (currentDescriber) {
					if (!gs.playerContributions[currentDescriber]) {
						gs.playerContributions[currentDescriber] = {
							points: 0,
							guessedWords: [],
							describedWords: [],
						};
					}
					gs.playerContributions[currentDescriber].describedWords.push(word);
				}

				// Check for bonus milestones (6, 10, 14, 18, 22...)
				// Dynamic bonus system with progressive difficulty
				// 1st bonus: Easy focused (warm up)
				// 2nd+ bonus: Dynamic mix that gets progressively challenging
				const milestones = [6, 10, 14, 18, 22, 26, 30];
				const currentCount = gs.currentTurnGuessedWords.length;

				if (milestones.includes(currentCount)) {
					const milestoneIndex = milestones.indexOf(currentCount);

					// Dynamic bonus distribution patterns
					// Each pattern: { easy, medium, hard, count }
					const BONUS_PATTERNS = {
						// First bonus: Always easy-focused (3 words)
						first: [
							{ easy: 3, medium: 0, hard: 0, count: 3 }, // All easy
						],
						// Second bonus: Medium-focused with variety (5 words)
						second: [
							{ easy: 1, medium: 4, hard: 0, count: 5 }, // Medium heavy
							{ easy: 2, medium: 3, hard: 0, count: 5 }, // Balanced easy-medium
							{ easy: 0, medium: 5, hard: 0, count: 5 }, // All medium
							{ easy: 1, medium: 3, hard: 1, count: 5 }, // Light challenge
						],
						// Third bonus: Challenge mix (5 words)
						third: [
							{ easy: 0, medium: 3, hard: 2, count: 5 }, // Medium-hard mix
							{ easy: 1, medium: 2, hard: 2, count: 5 }, // Balanced challenge
							{ easy: 0, medium: 2, hard: 3, count: 5 }, // Hard heavy
							{ easy: 1, medium: 3, hard: 1, count: 5 }, // Medium focused
						],
						// Fourth+ bonus: Dynamic challenge (5 words)
						later: [
							{ easy: 0, medium: 2, hard: 3, count: 5 }, // Hard heavy
							{ easy: 1, medium: 2, hard: 2, count: 5 }, // Balanced hard
							{ easy: 0, medium: 3, hard: 2, count: 5 }, // Medium-hard
							{ easy: 0, medium: 1, hard: 4, count: 5 }, // Very hard
							{ easy: 1, medium: 1, hard: 3, count: 5 }, // Hard challenge
							{ easy: 0, medium: 4, hard: 1, count: 5 }, // Medium breather
						],
					};

					// Select appropriate pattern pool based on milestone
					let patternPool;
					if (milestoneIndex === 0) {
						patternPool = BONUS_PATTERNS.first;
					} else if (milestoneIndex === 1) {
						patternPool = BONUS_PATTERNS.second;
					} else if (milestoneIndex === 2) {
						patternPool = BONUS_PATTERNS.third;
					} else {
						patternPool = BONUS_PATTERNS.later;
					}

					// Randomly select a pattern from the pool
					const selectedPattern =
						patternPool[Math.floor(Math.random() * patternPool.length)];
					const bonusCount = selectedPattern.count;

					console.log(
						`[BONUS] Milestone ${milestoneIndex + 1}: Selected pattern`,
						selectedPattern,
					);

					// Get bonus words with the dynamic distribution
					const bonusWords = getDynamicBonusWords(room, selectedPattern);

					// Add to current words
					if (!gs.currentWords) {
						gs.currentWords = [];
					}
					gs.currentWords.push(...bonusWords);

					// Broadcast bonus words to all players
					io.to(roomCode).emit("bonus-words-sync", {
						words: bonusWords,
						count: bonusCount,
						difficulty: `e${selectedPattern.easy}m${selectedPattern.medium}h${selectedPattern.hard}`,
						pattern: selectedPattern,
					});
				}
			}

			// Ensure wordObj has valid points
			const syncWordObj = {
				...wordObj,
				points:
					typeof wordObj.points === "number" ? wordObj.points : actualPoints,
			};

			io.to(roomCode).emit("word-guessed-sync", {
				word,
				wordObj: syncWordObj,
				guesser,
				points: actualPoints,
				isDuplicate: isDuplicate,
				gameState: gs,
			});
		}
	});

	// Wrong guess
	socket.on("wrong-guess", (data) => {
		const { roomCode, word, guesser } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Initialize wrong guesses tracking if not exists
			if (!gs.currentTurnWrongGuesses) {
				gs.currentTurnWrongGuesses = [];
			}

			// Add to wrong guesses list
			gs.currentTurnWrongGuesses.push({ word, guesser });

			// Broadcast to all players
			io.to(roomCode).emit("wrong-guess-sync", {
				word,
				guesser,
				wrongGuesses: gs.currentTurnWrongGuesses,
			});
		}
	});

	// Report taboo - watchers can report if describer used taboo word
	socket.on("report-taboo", (data) => {
		const { roomCode, word, voter, voterTeam } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Check if taboo reporting is enabled
			if (room.tabooReporting === false) {
				console.log(`Taboo reporting is disabled in room ${roomCode}`);
				return;
			}

			// Initialize taboo tracking if not exists
			if (!gs.tabooVotes) {
				gs.tabooVotes = {};
			}
			if (!gs.confirmedTaboos) {
				gs.confirmedTaboos = [];
			}

			// Check if voter is on the watching team (not the current playing team)
			if (voterTeam === gs.currentTeamIndex) {
				console.log(`Invalid taboo vote: ${voter} is on the current team`);
				return;
			}

			// Initialize votes for this word if not exists
			if (!gs.tabooVotes[word]) {
				gs.tabooVotes[word] = [];
			}

			// Check if already voted
			if (gs.tabooVotes[word].includes(voter)) {
				console.log(`${voter} already voted for ${word} as taboo`);
				return;
			}

			// Add vote
			gs.tabooVotes[word].push(voter);
			console.log(
				`${voter} reported "${word}" as taboo. Votes: ${gs.tabooVotes[word].length}`,
			);

			// Calculate total watching team players (all teams except current team)
			let watchingTeamPlayers = 0;
			gs.teams.forEach((team, idx) => {
				if (idx !== gs.currentTeamIndex) {
					watchingTeamPlayers += team.players.length;
				}
			});

			// Check if majority (>50%) voted
			const voteCount = gs.tabooVotes[word].length;
			const threshold = Math.floor(watchingTeamPlayers / 2) + 1;
			let newlyConfirmed = null;
			let wordPoints = 0;

			if (voteCount >= threshold && !gs.confirmedTaboos.includes(word)) {
				gs.confirmedTaboos.push(word);
				newlyConfirmed = word;
				// Find the word's points from current words
				const wordObj = gs.currentWords?.find((w) => w.word === word);
				wordPoints = wordObj?.points || 0;
				// Track taboo words with points for turn summary
				if (!gs.confirmedTabooDetails) {
					gs.confirmedTabooDetails = [];
				}
				gs.confirmedTabooDetails.push({ word, points: wordPoints });
				console.log(
					`"${word}" confirmed as TABOO by majority vote (${voteCount}/${watchingTeamPlayers}), ${wordPoints} pts`,
				);
			}

			// Get current team players for client-side filtering
			const currentTeamPlayers = gs.teams[gs.currentTeamIndex]?.players || [];

			// Broadcast to all players
			io.to(roomCode).emit("taboo-vote-sync", {
				tabooVotes: gs.tabooVotes,
				confirmedTaboos: gs.confirmedTaboos,
				newlyConfirmed: newlyConfirmed,
				wordPoints: wordPoints,
				currentTeamIndex: gs.currentTeamIndex,
				currentTeamPlayers: currentTeamPlayers, // Include current team players for notification filtering
			});
		}
	});

	// End turn
	socket.on("end-turn", (data) => {
		const {
			roomCode,
			guessedCount,
			skippedCount,
			totalPoints,
			guessedWords,
			guessedByPlayer,
			allWords,
		} = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// GRACE PERIOD: Delay turn finalization to allow last-second guesses to be processed
			// Keep turnStartTime intact so grace period guesses can still be validated
			const GRACE_PERIOD_MS = 2000; // 2 second grace period

			// Mark that we're in grace period (turn is ending but still accepting guesses)
			gs.inGracePeriod = true;

			console.log(
				`[END-TURN] Room ${roomCode}: Starting ${GRACE_PERIOD_MS}ms grace period for last-second guesses`,
			);

			// Notify all players that grace period has started (for UI transition)
			io.to(roomCode).emit("grace-period-start", {
				duration: GRACE_PERIOD_MS,
				message: "Finalizing results...",
			});

			// Delay the actual turn finalization
			setTimeout(() => {
				const roomAfterGrace = gameRooms.get(roomCode);
				if (!roomAfterGrace || !roomAfterGrace.gameState) return;

				const gsAfterGrace = roomAfterGrace.gameState;
				gsAfterGrace.inGracePeriod = false;

				// Get describer info for this turn
				const currentTeam = gsAfterGrace.teams[gsAfterGrace.currentTeamIndex];
				const describerIndex =
					gsAfterGrace.currentDescriberIndex[gsAfterGrace.currentTeamIndex];
				const describer = currentTeam?.players?.[describerIndex] || "Unknown";

				// Check if there are any reported taboo words that need voting
				const pendingTabooWords = [];
				if (
					gsAfterGrace.confirmedTaboos &&
					gsAfterGrace.confirmedTaboos.length > 0 &&
					gsAfterGrace.confirmedTabooDetails
				) {
					gsAfterGrace.confirmedTabooDetails.forEach((taboo) => {
						pendingTabooWords.push({
							word: taboo.word,
							points: taboo.points,
							teamIndex: gsAfterGrace.currentTeamIndex,
							describer: describer,
						});
					});
				}

				console.log(
					`[END-TURN] Room ${roomCode}: Grace period ended. pendingTabooWords count = ${pendingTabooWords.length}`,
				);
				console.log(
					`[END-TURN] Room ${roomCode}: Final guessed words count = ${gsAfterGrace.currentTurnGuessedWords?.length || 0}`,
				);
				if (pendingTabooWords.length > 0) {
					console.log(`[END-TURN] Pending taboo words:`, pendingTabooWords);
				}

				// Get all socket IDs in the room for debugging
				const roomSockets = io.sockets.adapter.rooms.get(roomCode);
				const socketCount = roomSockets ? roomSockets.size : 0;
				console.log(
					`[END-TURN] Broadcasting turn-ended to room ${roomCode} with ${socketCount} connected sockets`,
				);
				if (roomSockets) {
					const socketIds = Array.from(roomSockets);
					console.log(`[END-TURN] Socket IDs in room:`, socketIds);
					// Also log the player names for each socket
					socketIds.forEach((sid) => {
						const s = io.sockets.sockets.get(sid);
						console.log(
							`[END-TURN] Socket ${sid} player: ${s?.playerName || "unknown"}`,
						);
					});
				}

				// Calculate final points from server's authoritative guessedByPlayer list
				const serverGuessedWordStrings =
					gsAfterGrace.currentTurnGuessedWords || [];
				const serverGuessedByPlayer = gsAfterGrace.guessedByPlayer || [];
				const finalTotalPoints = serverGuessedByPlayer.reduce(
					(sum, g) => sum + (g.points || 0),
					0,
				);

				// Use server's currentWords if available, fallback to client's allWords
				const allWordsSource =
					gsAfterGrace.currentWords?.length > 0
						? gsAfterGrace.currentWords
						: allWords || [];

				// Build full word objects for guessedWords (frontend expects objects with word, points, difficulty)
				const serverGuessedWords = serverGuessedWordStrings.map((wordStr) => {
					// Find the full word object from allWords
					const fullWordObj = allWordsSource.find((w) => w.word === wordStr);
					if (fullWordObj) {
						return fullWordObj;
					}
					// Fallback: find from guessedByPlayer to get at least the points
					const guessInfo = serverGuessedByPlayer.find(
						(g) => g.word === wordStr,
					);
					return {
						word: wordStr,
						points: guessInfo?.points || 0,
						difficulty: "medium", // Default difficulty if not found
					};
				});

				// Broadcast the turn ended event with pending taboo info to ALL sockets in room
				// Use server's authoritative data, not client-provided data
				io.to(roomCode).emit("turn-ended", {
					guessedCount: serverGuessedWords.length,
					skippedCount,
					totalPoints: finalTotalPoints,
					guessedWords: serverGuessedWords,
					guessedByPlayer: serverGuessedByPlayer,
					allWords: allWordsSource,
					gameState: gsAfterGrace,
					pendingTabooWords: pendingTabooWords, // Include pending taboos in turn-ended event
				});

				// Store round history for session persistence
				if (!roomAfterGrace.roundHistory) {
					roomAfterGrace.roundHistory = [];
				}
				roomAfterGrace.roundHistory.push({
					round: gsAfterGrace.round,
					teamIndex: gsAfterGrace.currentTeamIndex,
					describer: describer,
					teamName:
						gsAfterGrace.teams[gsAfterGrace.currentTeamIndex]?.name ||
						`Team ${gsAfterGrace.currentTeamIndex + 1}`,
					tabooWords:
						pendingTabooWords.length > 0
							? pendingTabooWords.map((t) => ({
									word: t.word,
									points: t.points,
									confirmed: false, // Will be updated when voting completes
								}))
							: undefined,
				});

				// Clear current words and turn state AFTER grace period
				gsAfterGrace.currentWords = [];
				gsAfterGrace.timeRemaining = 0;
				gsAfterGrace.guessedByPlayer = [];
				gsAfterGrace.turnActive = false;
				gsAfterGrace.turnStartTime = null;

				// If there are pending taboo words, handle based on taboo settings
				if (pendingTabooWords.length > 0) {
					const tabooVotingEnabled = roomAfterGrace.tabooVoting !== false; // Default to enabled

					if (tabooVotingEnabled) {
						// Voting is enabled - start the voting phase
						gsAfterGrace.pendingTabooVoting = {
							words: pendingTabooWords,
							votes: {},
							timeRemaining: 30,
							startTime: Date.now(),
						};

						// Broadcast voting start after a short delay to ensure turn-ended is processed first
						setTimeout(() => {
							io.to(roomCode).emit("taboo-voting-start", {
								pendingTabooWords: pendingTabooWords,
							});
						}, 100);

						// Start voting timer
						const votingInterval = setInterval(() => {
							const room = gameRooms.get(roomCode);
							if (
								!room ||
								!room.gameState ||
								!room.gameState.pendingTabooVoting
							) {
								clearInterval(votingInterval);
								return;
							}

							const voting = room.gameState.pendingTabooVoting;
							const elapsed = Math.floor(
								(Date.now() - voting.startTime) / 1000,
							);
							voting.timeRemaining = Math.max(0, 30 - elapsed);

							// Sync time to all players
							io.to(roomCode).emit("round-end-vote-sync", {
								votes: voting.votes,
								timeRemaining: voting.timeRemaining,
							});

							// Check if voting time is up
							if (voting.timeRemaining <= 0) {
								clearInterval(votingInterval);
								completeTabooVoting(roomCode);
							}
						}, 1000);
					} else {
						// Voting is disabled but reporting is on - auto-confirm all reported taboos
						console.log(
							`[TABOO] Voting disabled in room ${roomCode} - auto-confirming ${pendingTabooWords.length} taboos`,
						);

						// Initialize confirmedTaboosByTeam if not exists (store total deductions per team)
						if (!gsAfterGrace.confirmedTaboosByTeam) {
							gsAfterGrace.confirmedTaboosByTeam = {};
						}

						// All reported taboos are auto-confirmed - build proper format
						const confirmedTabooWords = pendingTabooWords.map((tabooWord) => ({
							word: tabooWord.word,
							points: tabooWord.points,
							teamIndex: tabooWord.teamIndex,
							describer: tabooWord.describer,
						}));

						// Add up deductions and track per player
						confirmedTabooWords.forEach((taboo) => {
							// Use teamIndex from the taboo word itself
							if (!gsAfterGrace.confirmedTaboosByTeam[taboo.teamIndex]) {
								gsAfterGrace.confirmedTaboosByTeam[taboo.teamIndex] = 0;
							}
							gsAfterGrace.confirmedTaboosByTeam[taboo.teamIndex] +=
								taboo.points;

							// Also track taboo words per player in playerContributions
							if (taboo.describer) {
								if (!gsAfterGrace.playerContributions[taboo.describer]) {
									gsAfterGrace.playerContributions[taboo.describer] = {
										points: 0,
										guessedWords: [],
										describedWords: [],
										tabooWords: [],
									};
								}
								if (
									!gsAfterGrace.playerContributions[taboo.describer].tabooWords
								) {
									gsAfterGrace.playerContributions[taboo.describer].tabooWords =
										[];
								}
								gsAfterGrace.playerContributions[
									taboo.describer
								].tabooWords.push({
									word: taboo.word,
									points: taboo.points,
								});
							}
						});

						// Emit voting complete with all words confirmed (using same format as completeTabooVoting)
						io.to(roomCode).emit("taboo-voting-complete", {
							confirmedTabooWords: confirmedTabooWords,
							failedTabooWords: [],
							confirmedTaboosByTeam: gsAfterGrace.confirmedTaboosByTeam,
						});
					}
				}
			}, GRACE_PERIOD_MS); // End of setTimeout for grace period
		}
	});

	// Handle round-end taboo voting
	socket.on("round-end-taboo-vote", (data) => {
		const { roomCode, word, voter, voteType } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState && room.gameState.pendingTabooVoting) {
			const voting = room.gameState.pendingTabooVoting;
			const gs = room.gameState;

			// Initialize votes for this word if not exists (now has yes and no arrays)
			if (!voting.votes[word]) {
				voting.votes[word] = { yes: [], no: [] };
			}

			// Check if already voted (in either yes or no)
			if (
				voting.votes[word].yes.includes(voter) ||
				voting.votes[word].no.includes(voter)
			) {
				return;
			}

			// Add vote to appropriate array
			if (voteType === "yes") {
				voting.votes[word].yes.push(voter);
			} else {
				voting.votes[word].no.push(voter);
			}

			// Calculate if word is finalized (>60% yes votes of total votes cast)
			const yesCount = voting.votes[word].yes.length;
			const noCount = voting.votes[word].no.length;
			const totalVotes = yesCount + noCount;
			const yesPercentage = totalVotes > 0 ? (yesCount / totalVotes) * 100 : 0;

			// Update finalized status in pending words
			const wordIndex = voting.words.findIndex((w) => w.word === word);
			if (wordIndex >= 0) {
				voting.words[wordIndex].finalized = yesPercentage >= 60;
			}

			// Broadcast updated votes with finalized status
			io.to(roomCode).emit("round-end-vote-sync", {
				votes: voting.votes,
				timeRemaining: voting.timeRemaining,
				pendingTabooWords: voting.words,
			});

			// Check if all players have voted on all words - end voting early
			const totalPlayers = gs.teams.reduce(
				(sum, team) => sum + team.players.length,
				0,
			);
			let allVoted = true;
			for (const pendingWord of voting.words) {
				const wordVotes = voting.votes[pendingWord.word];
				const wordTotalVotes =
					(wordVotes?.yes?.length || 0) + (wordVotes?.no?.length || 0);
				if (wordTotalVotes < totalPlayers) {
					allVoted = false;
					break;
				}
			}

			if (allVoted) {
				console.log(
					`[VOTING] All ${totalPlayers} players have voted on all words - ending voting early`,
				);
				completeTabooVoting(roomCode);
			}
		}
	});

	// Helper function to complete taboo voting
	function completeTabooVoting(roomCode) {
		const room = gameRooms.get(roomCode);
		if (!room || !room.gameState || !room.gameState.pendingTabooVoting) {
			return;
		}

		const gs = room.gameState;
		const voting = gs.pendingTabooVoting;

		const confirmedTabooWords = [];
		const failedTabooWords = [];

		voting.words.forEach((tabooWord) => {
			const yesCount = voting.votes[tabooWord.word]?.yes?.length || 0;
			const noCount = voting.votes[tabooWord.word]?.no?.length || 0;
			const totalVotes = yesCount + noCount;
			// 60% threshold based on votes cast (yes votes / total votes)
			const yesPercentage = totalVotes > 0 ? (yesCount / totalVotes) * 100 : 0;

			if (yesPercentage >= 60) {
				confirmedTabooWords.push({
					word: tabooWord.word,
					points: tabooWord.points,
					teamIndex: tabooWord.teamIndex,
					describer: tabooWord.describer,
				});
			} else {
				failedTabooWords.push({
					word: tabooWord.word,
					points: tabooWord.points,
					teamIndex: tabooWord.teamIndex,
					describer: tabooWord.describer,
				});
			}
		});

		// Track confirmed taboo deductions per team
		if (!gs.confirmedTaboosByTeam) {
			gs.confirmedTaboosByTeam = {};
		}
		confirmedTabooWords.forEach((taboo) => {
			if (!gs.confirmedTaboosByTeam[taboo.teamIndex]) {
				gs.confirmedTaboosByTeam[taboo.teamIndex] = 0;
			}
			gs.confirmedTaboosByTeam[taboo.teamIndex] += taboo.points;

			// Also track taboo words per player in playerContributions
			if (taboo.describer) {
				if (!gs.playerContributions[taboo.describer]) {
					gs.playerContributions[taboo.describer] = {
						points: 0,
						guessedWords: [],
						describedWords: [],
						tabooWords: [],
					};
				}
				if (!gs.playerContributions[taboo.describer].tabooWords) {
					gs.playerContributions[taboo.describer].tabooWords = [];
				}
				gs.playerContributions[taboo.describer].tabooWords.push({
					word: taboo.word,
					points: taboo.points,
				});
			}
		});

		// Update roundHistory to mark confirmed/failed taboos
		if (room.roundHistory) {
			const confirmedWordNames = confirmedTabooWords.map((t) => t.word);
			const failedWordNames = failedTabooWords.map((t) => t.word);

			room.roundHistory = room.roundHistory.map((entry) => {
				if (entry.tabooWords && entry.tabooWords.length > 0) {
					return {
						...entry,
						tabooWords: entry.tabooWords
							.filter((t) => !failedWordNames.includes(t.word)) // Remove failed taboos
							.map((t) => ({
								...t,
								confirmed: confirmedWordNames.includes(t.word)
									? true
									: t.confirmed,
							})),
					};
				}
				return entry;
			});
		}

		// Clear the voting state
		gs.pendingTabooVoting = null;
		gs.confirmedTaboos = [];
		gs.confirmedTabooDetails = [];
		gs.tabooVotes = {};

		// Broadcast voting complete with both confirmed and failed words and updated deductions
		io.to(roomCode).emit("taboo-voting-complete", {
			confirmedTabooWords: confirmedTabooWords,
			failedTabooWords: failedTabooWords,
			confirmedTaboosByTeam: gs.confirmedTaboosByTeam,
		});
	}

	// Skip turn - describer wants to skip, pass to next teammate
	socket.on("skip-turn", (data) => {
		const { roomCode, playerName } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Mark turn as inactive when skipped
			gs.turnActive = false;
			gs.turnStartTime = null;

			// Increment turn count for this team
			if (!gs.turnCount) {
				gs.turnCount = {};
			}
			if (!gs.turnCount[gs.currentTeamIndex]) {
				gs.turnCount[gs.currentTeamIndex] = 0;
			}
			gs.turnCount[gs.currentTeamIndex]++;

			// Move to next describer in the SAME team (don't skip team's turn)
			const currentTeam = gs.currentTeamIndex;
			const teamSize = gs.teams[currentTeam].players.length;
			if (teamSize > 0) {
				gs.currentDescriberIndex[currentTeam] =
					gs.turnCount[gs.currentTeamIndex] % teamSize;
			}

			// Notify all players
			io.to(roomCode).emit("describer-skipped", {
				playerName: playerName,
				message: `${playerName} skipped describing. Next teammate is now the describer.`,
				gameState: gs,
			});
		}
	});

	// Skip guesser turn
	socket.on("skip-guesser-turn", (data) => {
		const { roomCode, playerName } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Mark turn as inactive when skipped
			gs.turnActive = false;
			gs.turnStartTime = null;

			// Move to next describer in the current team
			const currentTeam = gs.currentTeamIndex;
			gs.currentDescriberIndex[currentTeam] =
				(gs.currentDescriberIndex[currentTeam] + 1) %
				gs.teams[currentTeam].players.length;

			// Notify all players that someone skipped and send updated game state
			io.to(roomCode).emit("describer-skipped", {
				playerName: playerName,
				message: `${playerName} skipped their turn`,
				gameState: gs,
			});
		}
	});

	// Next turn
	socket.on("next-turn", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const gs = room.gameState;

			// Initialize turnCount if needed
			if (!gs.turnCount) {
				gs.turnCount = {};
			}

			// Mark that the CURRENT team has completed a turn (before switching)
			if (gs.turnCount[gs.currentTeamIndex] === undefined) {
				gs.turnCount[gs.currentTeamIndex] = 0;
			}
			gs.turnCount[gs.currentTeamIndex]++;

			// Move to next team
			gs.currentTeamIndex = (gs.currentTeamIndex + 1) % gs.teams.length;

			// If we've cycled back to team 0 after all teams played, increment round
			if (gs.currentTeamIndex === 0) {
				gs.round++;
			}

			// Check if game is over
			if (gs.round > gs.maxRounds) {
				// Game over - send feedback before emitting
				handleRoomClosure(room, roomCode, "Game completed naturally").then(
					() => {
						// Update per-team stats then emit final state including room stats
						updateStatsOnGameEnd(room);
						gs.gameStarted = false;
						io.to(roomCode).emit("game-over", { gameState: gs, room });
						// Clear player team assignments immediately after game end so lobby shows empty teams
						try {
							for (const p of room.players) {
								p.team = null;
								// Hide players from waiting list until they individually opt back in
								p.showInWaiting = false;
								// Reset captain status when game ends
								p.isCaptain = false;
							}
							room.started = false;
							io.to(roomCode).emit("team-updated", { room });
						} catch (e) {
							console.error("Error clearing teams after natural game-over:", e);
						}
					},
				);
				return;
			}

			// Set describer for the NEW current team based on their turn count
			if (gs.turnCount[gs.currentTeamIndex] === undefined) {
				gs.turnCount[gs.currentTeamIndex] = 0;
			}

			const teamSize = gs.teams[gs.currentTeamIndex].players.length;
			if (teamSize > 0) {
				// Describer rotates based on how many turns this team has completed
				gs.currentDescriberIndex[gs.currentTeamIndex] =
					gs.turnCount[gs.currentTeamIndex] % teamSize;
			}

			// Ensure describer index exists for all teams
			gs.teams.forEach((team, idx) => {
				if (gs.currentDescriberIndex[idx] === undefined) {
					gs.currentDescriberIndex[idx] = 0;
				}
				// Validate and fix describer indices
				if (team.players.length > 0) {
					if (gs.currentDescriberIndex[idx] >= team.players.length) {
						gs.currentDescriberIndex[idx] = 0;
					}
				}
			});

			io.to(roomCode).emit("next-turn-sync", { gameState: gs });
		}
	});

	// Leave game / return to lobby (for individual player, not ending the entire game)
	socket.on("leave-game", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room) {
			const playerIndex = room.players.findIndex((p) => p.id === socket.id);
			if (playerIndex !== -1) {
				const wasHost = room.host === socket.id;
				const leavingPlayer = room.players[playerIndex];

				// Remove player from room
				room.players.splice(playerIndex, 1);

				// Make the leaving player leave the socket room to disconnect them properly
				socket.leave(roomCode);

				// Notify the leaving player that they've left (similar to kick)
				socket.emit("you-left-game", {
					message: "You have left the game.",
				});

				// Transfer host if needed
				if (wasHost && room.players.length > 0) {
					room.host = room.players[0].id;
					console.log(
						`Host transferred in room ${roomCode}: ${room.players[0].name}`,
					);
					io.to(roomCode).emit("host-changed", {
						newHost: room.players[0].name,
						hostId: room.players[0].id,
						room,
					});
				}

				// If room is empty, delete it
				if (room.players.length === 0) {
					// Send feedback before deleting room
					handleRoomClosure(
						room,
						roomCode,
						"Room empty after player left",
					).then(() => {
						gameRooms.delete(roomCode);
						console.log(`Room ${roomCode} deleted (empty after leave)`);
					});
				} else {
					// Remove player from teams if game has started
					if (room.gameState) {
						let describerLeft = false;
						const currentTeamIndex = room.gameState.currentTeamIndex;

						room.gameState.teams.forEach((team, teamIndex) => {
							const teamPlayerIndex = team.players.indexOf(leavingPlayer.name);
							if (teamPlayerIndex !== -1) {
								// Check if the leaving player is the current describer
								if (
									teamIndex === currentTeamIndex &&
									room.gameState.currentDescriberIndex[teamIndex] ===
										teamPlayerIndex
								) {
									describerLeft = true;
								}

								team.players.splice(teamPlayerIndex, 1);

								// Adjust describer index
								if (
									room.gameState.currentDescriberIndex[teamIndex] !== undefined
								) {
									if (
										teamPlayerIndex <=
										room.gameState.currentDescriberIndex[teamIndex]
									) {
										room.gameState.currentDescriberIndex[teamIndex] = Math.max(
											0,
											room.gameState.currentDescriberIndex[teamIndex] - 1,
										);
									}
									// Ensure describer index is within bounds
									if (
										team.players.length > 0 &&
										room.gameState.currentDescriberIndex[teamIndex] >=
											team.players.length
									) {
										room.gameState.currentDescriberIndex[teamIndex] = 0;
									}
								}
							}
						});

						// Check if any team is now empty
						const team0Empty = room.gameState.teams[0].players.length === 0;
						const team1Empty = room.gameState.teams[1].players.length === 0;

						// If current team is empty, notify
						if (
							room.gameState.teams[currentTeamIndex].players.length === 0 &&
							room.gameState.gameStarted
						) {
							if (team0Empty && team1Empty) {
								// Both teams empty - but before ending the game check if players are
								// still present in the room but opted into the waiting list (play-again).
								const anyWaiting = room.players.some((p) => !!p.showInWaiting);
								if (anyWaiting) {
									// Players are in waiting list (they chose Play Again) — do not treat
									// this as "all players left". Just broadcast an update so clients
									// refresh UI and wait for the play-again host to start the next game.
									io.to(roomCode).emit("team-updated", { room });
								} else {
									// No waiting players — truly all players left, end the game
									handleRoomClosure(room, roomCode, "All players left").then(
										() => {
											// Update team stats and emit game over with room metadata
											updateStatsOnGameEnd(room);
											io.to(roomCode).emit("game-over", {
												gameState: room.gameState,
												message: "All players left. Game ended.",
												room,
											});
											// Clear player team assignments after game end
											try {
												for (const p of room.players) {
													p.team = null;
													p.showInWaiting = false;
												}
												room.gameState = null;
												room.started = false;
												io.to(roomCode).emit("team-updated", { room });
											} catch (e) {
												console.error(
													"Error clearing teams after all-players-left game-over:",
													e,
												);
											}
										},
									);
								}
							} else {
								const otherTeamIndex = currentTeamIndex === 0 ? 1 : 0;
								if (room.gameState.teams[otherTeamIndex].players.length > 0) {
									io.to(roomCode).emit("team-empty-skip", {
										message: `${room.gameState.teams[currentTeamIndex].name} has no players left. Continuing with ${room.gameState.teams[otherTeamIndex].name}.`,
										gameState: room.gameState,
									});
								}
							}
						}

						// If describer left during active turn, notify
						if (describerLeft && room.gameState.gameStarted) {
							const team = room.gameState.teams[currentTeamIndex];
							if (team.players.length > 0) {
								io.to(roomCode).emit("describer-left", {
									message: "Describer left the game. Moving to next teammate.",
									gameState: room.gameState,
								});
							}
						}
					}

					// Notify others that player left
					io.to(roomCode).emit("player-left", {
						socketId: socket.id,
						playerName: leavingPlayer.name,
						room,
						gameState: room.gameState,
					});

					console.log(`${leavingPlayer.name} left room ${roomCode}`);
				}
			}
		}
	});

	// Timer sync
	socket.on("timer-update", (data) => {
		const { roomCode, timeRemaining } = data;
		const room = gameRooms.get(roomCode);

		// Update time remaining in game state
		if (room && room.gameState) {
			room.gameState.timeRemaining = timeRemaining;
		}

		socket.to(roomCode).emit("timer-sync", { timeRemaining });
	});

	// Bonus words added
	// Toggle co-admin (host only) - can add or remove co-admin
	socket.on("toggle-co-admin", (data) => {
		const { roomCode, playerName } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.host === socket.id) {
			// Initialize co-admins array if it doesn't exist
			if (!room.coAdmins) {
				room.coAdmins = [];
			}

			// Find the player's socket id
			const player = room.players.find((p) => p.name === playerName);
			if (player) {
				const isCurrentlyCoAdmin = room.coAdmins.includes(player.id);

				if (isCurrentlyCoAdmin) {
					// Remove co-admin
					room.coAdmins = room.coAdmins.filter((id) => id !== player.id);

					// Notify the player they are no longer a co-admin
					io.to(player.id).emit("removed-co-admin", {
						message: "You are no longer a co-admin.",
					});

					// Notify all players in the room
					io.to(roomCode).emit("player-demoted", {
						playerName: playerName,
						message: `${playerName} is no longer a co-admin.`,
					});

					console.log(
						`${playerName} is no longer a co-admin in room ${roomCode}`,
					);
				} else {
					// Add co-admin
					room.coAdmins.push(player.id);

					// Notify the player they are now a co-admin
					io.to(player.id).emit("made-co-admin", {
						message:
							"You are now a co-admin! You have access to admin controls.",
					});

					// Notify all players in the room
					io.to(roomCode).emit("player-promoted", {
						playerName: playerName,
						message: `${playerName} is now a co-admin!`,
					});

					console.log(`${playerName} is now a co-admin in room ${roomCode}`);
				}
			}
		}
	});

	// Legacy: Make co-admin (host only) - kept for backwards compatibility
	socket.on("make-co-admin", (data) => {
		const { roomCode, playerName } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.host === socket.id) {
			// Initialize co-admins array if it doesn't exist
			if (!room.coAdmins) {
				room.coAdmins = [];
			}

			// Find the player's socket id
			const player = room.players.find((p) => p.name === playerName);
			if (player && !room.coAdmins.includes(player.id)) {
				room.coAdmins.push(player.id);

				// Notify the player they are now a co-admin
				io.to(player.id).emit("made-co-admin", {
					message: "You are now a co-admin! You have access to admin controls.",
				});

				// Notify all players in the room
				io.to(roomCode).emit("player-promoted", {
					playerName: playerName,
					message: `${playerName} is now a co-admin!`,
				});

				console.log(`${playerName} is now a co-admin in room ${roomCode}`);
			}
		}
	});

	// Kick player (host only)
	socket.on("kick-player", (data) => {
		const { roomCode, playerName, ban } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.host === socket.id) {
			// Find the player to kick
			const playerIndex = room.players.findIndex((p) => p.name === playerName);
			if (playerIndex !== -1) {
				const kickedPlayer = room.players[playerIndex];
				room.players.splice(playerIndex, 1);

				// Add to banned list if ban option is true
				if (ban) {
					// Ban by player name (as fallback)
					if (!room.bannedPlayers) {
						room.bannedPlayers = new Set();
					}
					room.bannedPlayers.add(playerName);

					// Ban by IP address (main ban mechanism)
					if (!room.bannedIPs) {
						room.bannedIPs = new Set();
					}
					// Get the IP of the kicked player's socket
					const kickedSocket = io.sockets.sockets.get(kickedPlayer.id);
					if (kickedSocket) {
						const kickedIP = getClientIP(kickedSocket);
						room.bannedIPs.add(kickedIP);
						console.log(`IP ${kickedIP} banned from room ${roomCode}`);
					}

					console.log(`${playerName} was banned from room ${roomCode}`);
				}

				// Remove from game state teams if game has started
				if (room.gameState) {
					room.gameState.teams.forEach((team, teamIndex) => {
						const teamPlayerIndex = team.players.indexOf(playerName);
						if (teamPlayerIndex !== -1) {
							team.players.splice(teamPlayerIndex, 1);

							// Adjust describer index if the kicked player was before or at the current describer
							if (
								room.gameState.currentDescriberIndex[teamIndex] !== undefined
							) {
								if (
									teamPlayerIndex <=
									room.gameState.currentDescriberIndex[teamIndex]
								) {
									room.gameState.currentDescriberIndex[teamIndex] = Math.max(
										0,
										room.gameState.currentDescriberIndex[teamIndex] - 1,
									);
								}
								// Ensure index is within bounds
								if (
									team.players.length > 0 &&
									room.gameState.currentDescriberIndex[teamIndex] >=
										team.players.length
								) {
									room.gameState.currentDescriberIndex[teamIndex] = 0;
								}
							}
						}
					});
				}

				// Notify all players
				io.to(roomCode).emit("player-kicked", {
					playerName: playerName,
					room: room,
					gameState: room.gameState,
				});

				// Notify the kicked player specifically
				io.to(kickedPlayer.id).emit("you-were-kicked", {
					message: ban
						? "You have been banned from this room by the host."
						: "You have been kicked from the game by the host.",
					banned: ban || false,
				});

				console.log(
					`${playerName} was kicked from room ${roomCode}${ban ? " (banned)" : ""}`,
				);
			}
		}
	});

	// Set describer (admin - host or co-admin)
	socket.on("set-describer", (data) => {
		const { roomCode, teamIndex, playerIndex } = data;
		const room = gameRooms.get(roomCode);

		if (room && room.gameState) {
			const player = room.players.find((p) => p.id === socket.id);
			const isCaptainOfTeam =
				player && player.isCaptain && player.team === teamIndex;

			if (isAdmin(room, socket.id) || isCaptainOfTeam) {
				const gs = room.gameState;

				// Validate team and player indices
				if (
					teamIndex >= 0 &&
					teamIndex < gs.teams.length &&
					playerIndex >= 0 &&
					playerIndex < gs.teams[teamIndex].players.length
				) {
					// Set the describer for the specified team
					gs.currentDescriberIndex[teamIndex] = playerIndex;

					// If setting describer for current team, also update turn
					if (teamIndex === gs.currentTeamIndex) {
						io.to(roomCode).emit("describer-changed", {
							gameState: gs,
							message: `${gs.teams[teamIndex].players[playerIndex]} is now the describer for ${gs.teams[teamIndex].name}`,
						});
					} else {
						io.to(roomCode).emit("describer-changed", {
							gameState: gs,
							message: `${gs.teams[teamIndex].players[playerIndex]} will be the next describer for ${gs.teams[teamIndex].name}`,
						});
					}

					console.log(
						`Host set describer for team ${teamIndex} to player ${playerIndex} in room ${roomCode}`,
					);
				}
			}
		}
	});

	// Admin: End game
	socket.on("admin-end-game", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && isAdmin(room, socket.id) && room.gameState) {
			// Send feedback to Google Sheets before ending game
			handleRoomClosure(room, roomCode, "Game ended by admin").then(() => {
				// Update stats and emit game over with admin message and room metadata
				updateStatsOnGameEnd(room);
				room.gameState.gameStarted = false;
				io.to(roomCode).emit("game-over", {
					gameState: room.gameState,
					message: "Game ended by host",
					room,
				});
				// Clear player team assignments after admin ended the game
				try {
					for (const p of room.players) {
						p.team = null;
						p.showInWaiting = false;
						// Reset captain status when game ends
						p.isCaptain = false;
					}
					room.gameState = null;
					room.started = false;
					io.to(roomCode).emit("team-updated", { room });
				} catch (e) {
					console.error("Error clearing teams after admin-end-game:", e);
				}
				console.log(`Host ended game in room ${roomCode}`);
			});
		}
	});

	// Admin: Skip turn
	socket.on("admin-skip-turn", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && isAdmin(room, socket.id) && room.gameState) {
			const gs = room.gameState;

			// Move to next team
			gs.currentTeamIndex = (gs.currentTeamIndex + 1) % gs.teams.length;

			// Check if we completed a round
			if (gs.currentTeamIndex === 0) {
				gs.round++;
				if (gs.round > gs.maxRounds) {
					// Game over - send feedback before emitting
					handleRoomClosure(room, roomCode, "Maximum rounds reached").then(
						() => {
							// Update stats and emit final game-over with room
							updateStatsOnGameEnd(room);
							io.to(roomCode).emit("game-over", {
								gameState: gs,
								message: "Maximum rounds reached",
								room,
							});
							// Clear player team assignments after game end due to max rounds
							try {
								for (const p of room.players) {
									p.team = null;
									p.showInWaiting = false;
								}
								room.gameState = null;
								room.started = false;
								io.to(roomCode).emit("team-updated", { room });
							} catch (e) {
								console.error(
									"Error clearing teams after max-rounds game end (admin-skip-turn):",
									e,
								);
							}
						},
					);
					return;
				}
			}

			// Emit turn skipped
			io.to(roomCode).emit("turn-skipped", {
				gameState: gs,
				message: `Turn skipped by host. It's now ${
					gs.teams[gs.currentTeamIndex].name
				}'s turn!`,
			});

			console.log(`Host skipped turn in room ${roomCode}`);
		}
	});

	// Admin: Toggle team switching lock
	socket.on("admin-toggle-team-switching", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && isAdmin(room, socket.id)) {
			room.teamSwitchingLocked = !room.teamSwitchingLocked;
			io.to(roomCode).emit("team-switching-locked", {
				locked: room.teamSwitchingLocked,
			});
			console.log(
				`Team switching ${
					room.teamSwitchingLocked ? "locked" : "unlocked"
				} in room ${roomCode}`,
			);
		}
	});

	// Admin: Toggle room joining lock (prevent new players from joining teams)
	socket.on("admin-toggle-team-lock", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && isAdmin(room, socket.id)) {
			room.joiningLocked = !room.joiningLocked;
			io.to(roomCode).emit("room-joining-locked", {
				locked: room.joiningLocked,
			});
			console.log(
				`Room joining ${room.joiningLocked ? "locked" : "unlocked"} in room ${roomCode}`,
			);
		}
	});

	// Admin: Randomize teams
	socket.on("admin-randomize-teams", (data) => {
		const { roomCode } = data;
		const room = gameRooms.get(roomCode);

		if (room && isAdmin(room, socket.id)) {
			// Get all players
			const allPlayers = [...room.players];

			// Shuffle the players array
			for (let i = allPlayers.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
			}

			// Determine number of teams (check game state if started, otherwise use room teamCount)
			const teamCount =
				room.started && room.gameState
					? room.gameState.teamCount
					: room.teamCount || 2;

			// Distribute players evenly across all teams
			allPlayers.forEach((player, index) => {
				player.team = index % teamCount; // Cycle through teams: 0, 1, 2, 0, 1, 2, ...
				player.isCaptain = false; // Reset captain status when randomizing
			});

			// If game is in progress, also update the game state
			if (room.started && room.gameState) {
				// Clear existing teams
				room.gameState.teams.forEach((team) => {
					team.players = [];
				});

				// Add players to game state teams
				allPlayers.forEach((player) => {
					if (player.team !== null) {
						room.gameState.teams[player.team].players.push(player.name);
					}
				});

				// Reset describer indices to account for new team compositions
				room.gameState.currentDescriberIndex = Array(teamCount).fill(0);

				io.to(roomCode).emit("team-updated-midgame", {
					room,
					gameState: room.gameState,
					message: "Teams have been randomized by the host!",
				});
			} else {
				io.to(roomCode).emit("team-updated", {
					room,
					message: "Teams have been randomized by the host!",
				});
			}

			console.log(
				`Teams randomized in room ${roomCode} across ${teamCount} teams`,
			);
		}
	});

	// Captain draft: start selection flow (admin triggers)
	socket.on("start-captain-selection", (data) => {
		const { roomCode } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !isAdmin(room, socket.id)) return;

		// At least 4 players required (2 captains + at least 1 player to pick each, or similar logic)
		if (room.players.length < 4) {
			socket.emit("error", {
				message: "Need at least 4 players in the lobby for Team Division.",
			});
			return;
		}

		// Notify clients to open captain selection UI (admin will pick captains)
		io.to(roomCode).emit("captain-selection-started", { roomCode });
		console.log(
			`Captain selection started in room ${roomCode} by admin ${socket.id}`,
		);
	});

	// Admin previews a captain selection so everyone can see interim picks
	socket.on("admin-preview-captain", (data) => {
		const { roomCode, index, playerId } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !isAdmin(room, socket.id)) return;
		const playerName =
			room.players.find((p) => p.id === playerId)?.name || null;
		// broadcast preview to all clients in room
		io.to(roomCode).emit("captain-preview", {
			index,
			playerId: playerId || null,
			playerName,
		});
	});

	// Admin confirms selected captains
	socket.on("admin-set-captains", (data) => {
		const { roomCode, captains } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !isAdmin(room, socket.id)) return;
		try {
			const teamCount = room.teamCount || 2;
			if (!Array.isArray(captains) || captains.length !== teamCount) {
				console.warn("Invalid captains payload");
				return;
			}

			// Validate captains are present in room
			// Ensure captains are unique and present
			const uniqueCaptains = Array.from(new Set(captains));
			if (uniqueCaptains.length !== captains.length) {
				console.warn("Duplicate captains selected");
				return;
			}
			const captainPlayers = captains
				.map((cid) => room.players.find((p) => p.id === cid))
				.filter(Boolean);
			if (captainPlayers.length !== teamCount) {
				console.warn("One or more captains not found in room");
				return;
			}

			// Initialize draft state on room
			const availablePlayers = room.players
				.filter((p) => !captains.includes(p.id))
				.map((p) => ({ id: p.id, name: p.name }));
			room.draftState = {
				captains: captains.slice(), // array of socket ids
				teams: Array.from({ length: teamCount }).map((_, i) => ({
					players: [captainPlayers[i].name],
				})),
				availablePlayers: availablePlayers,
				initialAvailableCount: availablePlayers.length, // Track initial count for even/odd logic
				currentCaptainIndex: null,
				ready: {}, // map of captainId -> boolean
				coinResult: null,
			};

			// mark captains' team assignment and isCaptain status
			room.players.forEach((p) => (p.isCaptain = false)); // Clear previous status
			captains.forEach((cid, idx) => {
				const pl = room.players.find((p) => p.id === cid);
				if (pl) {
					pl.team = idx;
					pl.isCaptain = true;
				}
			});

			// Decide pick order: for 2 teams do coin toss, for >2 shuffle
			if (teamCount === 2) {
				const toss = Math.random() < 0.5 ? 0 : 1;
				room.draftState.currentCaptainIndex = toss;
			} else {
				// shuffle order of captains
				const order = room.draftState.captains.slice();
				for (let i = order.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[order[i], order[j]] = [order[j], order[i]];
				}
				room.draftState.captainOrder = order;
				room.draftState.currentCaptainIndex = 0;
			}

			// Broadcast captains confirmed and initial teams

			// Notify clients that captains are confirmed and ask captains to ready up for coin flip
			io.to(roomCode).emit("captains-confirmed", {
				teams: room.draftState.teams,
				availablePlayers: room.draftState.availablePlayers,
				captains: room.draftState.captains,
				captainNames: room.draftState.captains.map(
					(cid) => room.players.find((p) => p.id === cid)?.name || "",
				),
				ready: room.draftState.ready,
			});

			// Ask captains to press ready for coin flip
			io.to(roomCode).emit("captain-waiting-ready", {
				captains: room.draftState.captains,
			});
			console.log(`Captains set in room ${roomCode}. Starting draft.`);
		} catch (e) {
			console.error("Error in admin-set-captains:", e);
		}
	});

	// Admin cancels captain selection/draft (host-only)
	socket.on("admin-cancel-captain-selection", (data) => {
		const { roomCode } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !isAdmin(room, socket.id)) return;
		try {
			// Clear any draftState on server
			if (room.draftState) delete room.draftState;
			// Notify all clients in room to close captain-selection UI
			io.to(roomCode).emit("captain-selection-cancelled", { roomCode });
			console.log(
				`Captain selection cancelled in room ${roomCode} by admin ${socket.id}`,
			);
		} catch (e) {
			console.error("Error in admin-cancel-captain-selection:", e);
		}
	});

	// Captain picks a player
	socket.on("captain-picked", (data) => {
		const { roomCode, playerId } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !room.draftState) return;
		const ds = room.draftState;

		// Validate that the picker is the current captain
		if (socket.id !== ds.captains[ds.currentCaptainIndex]) {
			console.log(
				`Pick rejected: ${socket.id} is not current captain ${ds.captains[ds.currentCaptainIndex]}`,
			);
			return;
		}

		// Verify player exists and is in available list
		const playerIndex = ds.availablePlayers.findIndex((p) => p.id === playerId);
		if (playerIndex === -1) return;
		const playerObj = ds.availablePlayers[playerIndex];

		// Add player to current captain's team
		const currentTeamIndex = ds.currentCaptainIndex;
		ds.teams[currentTeamIndex].players.push(playerObj.name);
		ds.availablePlayers.splice(playerIndex, 1);

		// Update player's team in room
		const roomPlayer = room.players.find((p) => p.id === playerId);
		if (roomPlayer) roomPlayer.team = currentTeamIndex;

		// Check if draft is complete (no players left)
		if (ds.availablePlayers.length === 0) {
			io.to(roomCode).emit("captain-selection-complete", { teams: ds.teams });
			io.to(roomCode).emit("team-updated", { room });
			room.draftState = null;
			return;
		}

		// Alternate to the other captain for next pick
		ds.currentCaptainIndex = ds.currentCaptainIndex === 0 ? 1 : 0;

		// If only one player remains
		if (ds.availablePlayers.length === 1) {
			const lastPlayer = ds.availablePlayers[0];

			// Check if initial available count was odd or even
			// Odd: let last player choose their team
			// Even: auto-assign to current captain's team
			if (ds.initialAvailableCount % 2 === 1) {
				// Odd: First update everyone's view with the picked player
				io.to(roomCode).emit("captain-picked", {
					teams: ds.teams,
					availablePlayers: ds.availablePlayers,
					currentCaptainId: null, // No captain picking now
					currentCaptainName: null,
				});

				// Then emit last player choice
				io.to(roomCode).emit("last-player-choice", {
					playerId: lastPlayer.id,
					playerName: lastPlayer.name,
					teams: ds.teams,
					availablePlayers: ds.availablePlayers,
				});
				return;
			} else {
				// Even: auto-assign to current captain
				ds.teams[ds.currentCaptainIndex].players.push(lastPlayer.name);
				const roomPlayer = room.players.find((p) => p.id === lastPlayer.id);
				if (roomPlayer) roomPlayer.team = ds.currentCaptainIndex;
				ds.availablePlayers = [];

				// Draft complete
				io.to(roomCode).emit("captain-selection-complete", { teams: ds.teams });
				io.to(roomCode).emit("team-updated", { room });
				room.draftState = null;
				return;
			}
		}

		// Continue with next captain's turn
		io.to(roomCode).emit("captain-picked", {
			teams: ds.teams,
			availablePlayers: ds.availablePlayers,
			currentCaptainId: ds.captains[ds.currentCaptainIndex],
			currentCaptainName: room.players.find(
				(p) => p.id === ds.captains[ds.currentCaptainIndex],
			)?.name,
		});
	});

	// Captain ready for coin flip
	socket.on("captain-ready", (data) => {
		const { roomCode, ready } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !room.draftState) return;
		const ds = room.draftState;
		if (!ds.captains || !ds.captains.includes(socket.id)) return;
		// set or toggle ready state
		if (typeof ready === "boolean") {
			ds.ready[socket.id] = !!ready;
		} else {
			ds.ready[socket.id] = !ds.ready[socket.id];
		}
		// notify room of updated ready state
		io.to(roomCode).emit("captain-ready-update", { ready: ds.ready });
		// check if all captains are ready
		const allReady = ds.captains.every((cid) => ds.ready[cid]);
		if (!allReady) return;
		// perform coin flip: 0 => blue (team 0), 1 => red (team 1)
		const flip = Math.random() < 0.5 ? 0 : 1;
		// emit coin-flip (for animation) then result
		io.to(roomCode).emit("coin-flip", { result: flip });
		setTimeout(() => {
			// set current captain index to winner (team index)
			ds.currentCaptainIndex = flip;
			io.to(roomCode).emit("coin-result", {
				winningTeamIndex: flip,
				currentCaptainId: ds.captains[ds.currentCaptainIndex],
				currentCaptainName: room.players.find(
					(p) => p.id === ds.captains[ds.currentCaptainIndex],
				)?.name,
			});
			// DON'T auto-advance to picking - let the user click "Continue to Team Selection"
			// clear ready flags so UI resets for potential future rounds
			ds.ready = {};
		}, 4500); // Increased to 4500ms to match the new 4.5s coin animation duration
	});

	// Start captain picking phase (triggered by user clicking "Continue to Team Selection")
	socket.on("start-captain-picking", (data) => {
		const { roomCode } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !room.draftState) return;
		const ds = room.draftState;
		// Emit the captain-pick-turn event to start the picking phase
		io.to(roomCode).emit("captain-pick-turn", {
			teams: ds.teams,
			availablePlayers: ds.availablePlayers,
			currentCaptainId: ds.captains[ds.currentCaptainIndex],
			currentCaptainName: room.players.find(
				(p) => p.id === ds.captains[ds.currentCaptainIndex],
			)?.name,
			coinResult: ds.currentCaptainIndex, // Include the coin result so crown shows on winning team
		});
	});

	// Last player chooses team when odd count
	socket.on("last-player-choose", (data) => {
		const { roomCode, teamIndex } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room || !room.draftState) return;
		const ds = room.draftState;
		const last = ds.availablePlayers[0];
		if (!last) return;
		// assign
		const rpl = room.players.find((p) => p.id === last.id);
		if (rpl) rpl.team = teamIndex;
		ds.teams[teamIndex].players.push(last.name);
		ds.availablePlayers = [];
		// Draft complete - broadcast final teams and update server-side room teams
		io.to(roomCode).emit("captain-selection-complete", { teams: ds.teams });
		// Also broadcast team-updated so clients can refresh lobby view
		io.to(roomCode).emit("team-updated", { room });
		// clear draft state
		delete room.draftState;
	});

	// Admin: Add/Remove Third Team
	socket.on("admin-toggle-third-team", (data) => {
		const { roomCode, addTeam } = data;
		const room = gameRooms.get(roomCode);

		console.log(`\n🔧 admin-toggle-third-team received:`);
		console.log(`  - Room Code: ${roomCode}`);
		console.log(`  - Add Team: ${addTeam}`);
		console.log(`  - Admin: ${socket.id}`);
		console.log(`  - Room exists: ${!!room}`);

		if (room && isAdmin(room, socket.id)) {
			console.log(`  - Players in room: ${room.players.length}`);
			console.log(
				`  - Player names: ${room.players.map((p) => p.name).join(", ")}`,
			);
			console.log(`  - Current teams: ${room.gameState?.teams.length}`);

			// Get all sockets in the room
			const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
			console.log(
				`  - Sockets in room: ${socketsInRoom ? socketsInRoom.size : 0}`,
			);
			if (socketsInRoom) {
				console.log(
					`  - Socket IDs in room: ${Array.from(socketsInRoom).join(", ")}`,
				);
			}
		}

		if (room && isAdmin(room, socket.id) && room.gameState) {
			const gs = room.gameState;

			if (addTeam && gs.teams.length === 2) {
				// Add third team
				gs.teams.push({
					name: "Team 3",
					players: [],
					score: 0,
				});
				gs.currentDescriberIndex.push(0);
				gs.teamCount = 3;
				room.teamCount = 3; // Update room's teamCount as well

				// Ensure teamStats arrays include new team
				ensureTeamStats(room);

				// Regenerate word pool for 3 teams
				const estimatedTurnsPerTeam = gs.maxRounds || 5;
				const wordsPerTurn = 10;
				const bonusBuffer = 50;
				const totalWordsNeeded =
					estimatedTurnsPerTeam * 3 * wordsPerTurn + bonusBuffer;
				room.gameWordPool = generateGameWordPool(
					totalWordsNeeded,
					room.usedWordIndices,
				);

				// Broadcast to all players
				io.to(roomCode).emit("third-team-added", {
					gameState: gs,
					room: room,
					message: "Team 3 has been added to the game!",
				});
				// Also emit game-state-updated for immediate UI sync
				io.to(roomCode).emit("game-state-updated", { gameState: gs });
				console.log(
					`Third team added in room ${roomCode}, broadcasting to all players`,
				);
			} else if (!addTeam && gs.teams.length === 3) {
				// Remove third team - randomly shuffle players to Team 1 and Team 2
				const team3Players = gs.teams[2].players;

				// Shuffle team3Players randomly between team 1 and team 2
				team3Players.forEach((playerName, index) => {
					const targetTeam = index % 2; // Alternate between 0 and 1
					gs.teams[targetTeam].players.push(playerName);

					// Update player's team in room.players
					const player = room.players.find((p) => p.name === playerName);
					if (player) {
						player.team = targetTeam;
					}
				});

				gs.teams.splice(2, 1);
				gs.currentDescriberIndex.splice(2, 1);
				gs.teamCount = 2;
				room.teamCount = 2; // Update room's teamCount as well

				// Resize teamStats arrays down to match 2 teams
				ensureTeamStats(room);

				// Broadcast to all players
				io.to(roomCode).emit("third-team-removed", {
					gameState: gs,
					removedPlayers: team3Players,
					room: room,
					message: `Team 3 has been removed. ${team3Players.length} player(s) redistributed to other teams.`,
				});
				// Also emit game-state-updated for immediate UI sync
				io.to(roomCode).emit("game-state-updated", { gameState: gs });
				console.log(
					`Third team removed in room ${roomCode}, ${team3Players.length} players redistributed, broadcasting to all players`,
				);
			}
		}
	});

	// Admin: Rename team (host or co-admin)
	socket.on("rename-team", (data) => {
		const { roomCode, teamIndex, newName } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room) return;

		// Only allow host, co-admin, or team captain (for their own team)
		const player = room.players.find((p) => p.id === socket.id);
		const isCaptainOfTeam =
			player && player.isCaptain && Number(player.team) === Number(teamIndex);

		if (!isAdmin(room, socket.id) && !isCaptainOfTeam) {
			console.log(
				`Unauthorized rename-team attempt in room ${roomCode} by ${socket.id}`,
			);
			return;
		}

		// If gameState exists, update team name there
		if (
			room.gameState &&
			Array.isArray(room.gameState.teams) &&
			room.gameState.teams[teamIndex]
		) {
			room.gameState.teams[teamIndex].name = (
				newName || `Team ${teamIndex + 1}`
			).toString();
			// Also persist to room.teamNames so lobby retains name after play-again
			room.teamNames = room.teamNames || [];
			room.teamNames[teamIndex] = room.gameState.teams[teamIndex].name;
			// Broadcast updated game state to all clients for immediate sync
			io.to(roomCode).emit("game-state-updated", {
				gameState: room.gameState,
				room,
			});
			console.log(
				`Team ${teamIndex} renamed to "${newName}" in room ${roomCode} (game running)`,
			);
			return;
		}

		// If no gameState (lobby), emit a lightweight team-name update so clients can update local UI
		// Persist to room.teamNames so play-again preserves the name
		room.teamNames = room.teamNames || [];
		room.teamNames[teamIndex] = (newName || `Team ${teamIndex + 1}`).toString();
		io.to(roomCode).emit("team-name-updated", {
			teamIndex,
			newName,
			room: { teamStats: room.teamStats, teamNames: room.teamNames },
		});
		console.log(
			`Team ${teamIndex} renamed to "${newName}" in room ${roomCode} (lobby)`,
		);
	});

	// Chat message handler

	// Note: admin-play-again removed — individual players should use 'player-play-again'

	// Player: Play again individually (move this player to lobby waiting list)
	socket.on("player-play-again", (data) => {
		const { roomCode } = data || {};
		const room = gameRooms.get(roomCode);
		if (!room) return;

		// Find the player in the room
		const player = room.players.find((p) => p.id === socket.id);
		if (!player) return;

		// Remove player from any gameState team lists if gameState exists
		if (room.gameState && Array.isArray(room.gameState.teams)) {
			for (const t of room.gameState.teams) {
				if (Array.isArray(t.players)) {
					const idx = t.players.indexOf(player.name);
					if (idx !== -1) t.players.splice(idx, 1);
				}
			}
		}

		// Set player's team to null (waiting list)
		player.team = null;
		// Mark that this player has opted into the waiting list (visible to others)
		player.showInWaiting = true;
		// Clear captain status
		player.isCaptain = false;

		// If no one has been assigned as the play-again host yet, assign the first requester
		if (!room.playAgainHostAssigned) {
			room.host = socket.id;
			room.playAgainHostAssigned = true;
			console.log(
				`Assigned new host ${player.name} (${socket.id}) for room ${roomCode} via player-play-again`,
			);
		}

		// Clear any stale locks when players opt into play-again so the lobby is usable
		if (room.joiningLocked) {
			room.joiningLocked = false;
			io.to(roomCode).emit("room-joining-locked", {
				locked: false,
				silent: true,
			});
			console.log(
				`Cleared room joining lock for room ${roomCode} due to play-again`,
			);
		}
		if (room.teamSwitchingLocked) {
			room.teamSwitchingLocked = false;
			io.to(roomCode).emit("team-switching-locked", {
				locked: false,
				silent: true,
			});
			console.log(
				`Cleared team switching lock for room ${roomCode} due to play-again`,
			);
		}

		// Broadcast updated players/room so all clients see the waiting list change
		try {
			io.to(roomCode).emit("player-play-again", {
				playerId: socket.id,
				playerName: player.name,
				room,
			});
			// Also emit a team-updated so clients refresh waiting lists in a consistent place
			io.to(roomCode).emit("team-updated", { room });
			// Also emit a game-state update if present to keep UI in sync
			if (room.gameState)
				io.to(roomCode).emit("game-state-updated", {
					gameState: room.gameState,
					room,
				});
			console.log(
				`Player ${player.name} (${socket.id}) moved to lobby waiting in room ${roomCode}`,
			);
		} catch (err) {
			console.error("Error broadcasting player-play-again:", err);
		}
	});

	socket.on("chat-message", (data) => {
		const { roomCode, message, playerName } = data;
		io.to(roomCode).emit("chat-message-received", {
			message,
			playerName,
			timestamp: Date.now(),
		});
	});

	// Disconnect
	socket.on("disconnect", () => {
		console.log("User disconnected:", socket.id);

		// Find the room and player
		gameRooms.forEach((room, roomCode) => {
			const playerIndex = room.players.findIndex((p) => p.id === socket.id);
			if (playerIndex !== -1) {
				const disconnectedPlayer = room.players[playerIndex];
				const wasHost = room.host === socket.id;

				// Initialize disconnectedPlayers map if needed
				if (!room.disconnectedPlayers) {
					room.disconnectedPlayers = new Map();
				}

				// Set up grace period - don't remove immediately, wait 30 seconds
				const GRACE_PERIOD_MS = 30000; // 30 seconds to reconnect

				console.log(
					`Player ${disconnectedPlayer.name} disconnected from room ${roomCode}. Starting ${GRACE_PERIOD_MS / 1000}s grace period...`,
				);

				// Store disconnect info for potential reconnection
				const disconnectTimer = setTimeout(() => {
					// Grace period expired - now actually remove the player
					console.log(
						`Grace period expired for ${disconnectedPlayer.name} in room ${roomCode}`,
					);

					const currentPlayerIndex = room.players.findIndex(
						(p) => p.name === disconnectedPlayer.name,
					);
					if (currentPlayerIndex === -1) {
						// Player already removed or reconnected with different socket
						room.disconnectedPlayers.delete(disconnectedPlayer.name);
						return;
					}

					// Check if player has reconnected (socket ID changed)
					const currentPlayer = room.players[currentPlayerIndex];
					if (currentPlayer.id !== socket.id) {
						// Player reconnected with new socket, don't remove
						room.disconnectedPlayers.delete(disconnectedPlayer.name);
						console.log(
							`Player ${disconnectedPlayer.name} has reconnected, not removing`,
						);
						return;
					}

					// Actually remove the player now
					room.players.splice(currentPlayerIndex, 1);
					room.disconnectedPlayers.delete(disconnectedPlayer.name);

					// If host left, assign a new host from remaining players
					if (wasHost && room.players.length > 0) {
						room.host = room.players[0].id;
						console.log(
							`New host assigned in room ${roomCode}: ${room.players[0].name}`,
						);
						io.to(roomCode).emit("host-changed", {
							newHost: room.players[0].name,
							hostId: room.players[0].id,
							room,
						});
					}

					if (room.players.length === 0) {
						// If room is empty, delete it
						gameRooms.delete(roomCode);
						console.log(`Room ${roomCode} deleted (empty)`);
					} else {
						// Remove player from teams if game has started
						if (room.gameState) {
							let describerLeft = false;
							const currentTeamIndex = room.gameState.currentTeamIndex;

							room.gameState.teams.forEach((team, teamIndex) => {
								const teamPlayerIndex = team.players.indexOf(
									disconnectedPlayer.name,
								);
								if (teamPlayerIndex !== -1) {
									// Check if the disconnecting player is the current describer
									if (
										teamIndex === currentTeamIndex &&
										room.gameState.currentDescriberIndex[teamIndex] ===
											teamPlayerIndex
									) {
										describerLeft = true;
									}

									team.players.splice(teamPlayerIndex, 1);

									// Adjust describer index if needed
									if (
										room.gameState.currentDescriberIndex[teamIndex] !==
										undefined
									) {
										if (
											teamPlayerIndex <=
											room.gameState.currentDescriberIndex[teamIndex]
										) {
											room.gameState.currentDescriberIndex[teamIndex] =
												Math.max(
													0,
													room.gameState.currentDescriberIndex[teamIndex] - 1,
												);
										}
										// Ensure describer index is within bounds
										if (
											team.players.length > 0 &&
											room.gameState.currentDescriberIndex[teamIndex] >=
												team.players.length
										) {
											room.gameState.currentDescriberIndex[teamIndex] = 0;
										}
									}
								}
							});

							// Check if any team is now empty
							const team0Empty = room.gameState.teams[0].players.length === 0;
							const team1Empty = room.gameState.teams[1].players.length === 0;

							// If both teams are empty, decide whether to end the game or preserve lobby
							if (team0Empty && team1Empty) {
								// If players remain who've opted into Play Again (waiting list),
								// don't trigger the full game-over flow — keep the room available
								// so the waiting players can start a new game.
								const waitingExists =
									Array.isArray(room.players) &&
									room.players.some((p) => p && p.showInWaiting);
								if (waitingExists) {
									console.log(
										`Room ${roomCode} has teams empty but ${room.players.filter((p) => p && p.showInWaiting).length} player(s) waiting for Play Again — skipping game-over`,
									);
									// Clear running flags so clients return to lobby UI, but avoid
									// calling handleRoomClosure/updateStats so we don't treat this
									// as an unexpected full-room abandonment.
									room.gameState = null;
									room.started = false;
									// Notify clients to refresh team/waiting lists
									try {
										io.to(roomCode).emit("team-updated", { room });
									} catch (err) {
										console.error(
											"Error emitting team-updated after disconnect guard:",
											err,
										);
									}
								} else {
									// Both teams empty from disconnect - send feedback before ending
									handleRoomClosure(
										room,
										roomCode,
										"All players disconnected",
									).then(() => {
										// Update stats and emit game-over with room metadata
										updateStatsOnGameEnd(room);
										io.to(roomCode).emit("game-over", {
											gameState: room.gameState,
											message: "All players left. Game ended.",
											room,
										});
										// Preserve player.team assignments; just mark game state cleared
										room.gameState = null;
										room.started = false;
									});
								}
							}

							// If describer left during active turn, notify players
							if (describerLeft && room.gameState?.gameStarted) {
								const team = room.gameState.teams[currentTeamIndex];
								if (team.players.length > 0) {
									io.to(roomCode).emit("describer-left", {
										message: "Describer disconnected. Moving to next teammate.",
										gameState: room.gameState,
									});
								}
							}
						}

						// Notify remaining players that someone left
						io.to(roomCode).emit("player-left", {
							socketId: socket.id,
							playerName: disconnectedPlayer.name,
							room,
							gameState: room.gameState,
						});
					}
				}, GRACE_PERIOD_MS);

				// Store the timer so we can cancel it if player reconnects
				room.disconnectedPlayers.set(disconnectedPlayer.name, {
					timer: disconnectTimer,
					socketId: socket.id,
					wasHost,
					disconnectedAt: Date.now(),
				});
			}
		});
	});
});

const PORT = process.env.PORT || 3000;

function startRenderKeepAlive() {
	const renderUrl = process.env.RENDER_EXTERNAL_URL;
	const keepAliveEnabled = process.env.ENABLE_RENDER_KEEPALIVE !== "false";

	if (!renderUrl || !keepAliveEnabled) return;

	const intervalMs = 210000; // 3.5 minutes
	const healthUrl = `${renderUrl.replace(/\/$/, "")}/health`;

	const ping = async () => {
		try {
			await fetch(healthUrl, { method: "GET", cache: "no-store" });
		} catch {
			// Keepalive is best-effort; ignore transient network failures.
		}
	};

	ping();
	setInterval(ping, intervalMs);
}

server.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
	console.log(`Open http://localhost:${PORT} to play`);
	startRenderKeepAlive();
});
