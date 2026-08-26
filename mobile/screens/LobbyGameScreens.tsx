import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Screen } from '../components/ui';
import { useTurnTimer } from '../hooks/useTurnTimer';
import type { useGameConnection } from '../hooks/useGameConnection';

type GC = ReturnType<typeof useGameConnection>;

export function LobbyScreen({
  gc,
  onStart,
}: {
  gc: GC;
  onStart: () => void;
}) {
  const bothTeamsReady =
    gc.view.teams[0].members.length > 0 && gc.view.teams[1].members.length > 0;

  return (
    <Screen>
      <Text style={styles.label}>Room code</Text>
      <Text style={styles.code}>{gc.roomId ?? '······'}</Text>
      <Text style={styles.hint}>Share this code with friends (max 8 players)</Text>

      <View style={styles.teamsRow}>
        {[0, 1].map((i) => (
          <TeamCard key={i} index={i as 0 | 1} gc={gc} />
        ))}
      </View>

      {gc.signalingStatus === 'reconnecting' && (
        <View style={styles.bannerWarn}>
          <Text style={styles.warnText}>Signaling reconnecting…</Text>
        </View>
      )}

      {gc.isHost() ? (
        <Button title="Start Game" onPress={onStart} disabled={!bothTeamsReady} />
      ) : (
        <View style={styles.waiting}>
          <ActivityIndicator color="#22d3ee" />
          <Text style={styles.hint}> Waiting for host to start…</Text>
        </View>
      )}
      <Button title="Leave" onPress={gc.leaveGame} variant="danger" />
    </Screen>
  );
}

function TeamCard({ index, gc }: { index: 0 | 1; gc: GC }) {
  const team = gc.view.teams[index];
  return (
    <View style={[styles.teamCard, index === 0 ? styles.teamA : styles.teamB]}>
      <Text style={styles.teamName}>{team.name}</Text>
      {team.members.map((m: { id: string; name: string; isHost: boolean }) => (
        <Text key={m.id} style={styles.member}>
          {m.isHost ? '👑 ' : ''}
          {m.name}
        </Text>
      ))}
      <View style={{ marginTop: 'auto' }}>
        <Button title="Join" variant="secondary" onPress={() => gc.switchTeam(index)} />
      </View>
    </View>
  );
}

export function GameScreen({ gc }: { gc: GC }) {
  const { remainingMs, expired } = useTurnTimer(gc.view.turn, !!gc.view.turn);
  const [guessText, setGuessText] = useState('');
  const secs = Math.ceil(remainingMs / 1000);
  const pct = useMemo(
    () => (gc.view.turn ? Math.max(0, remainingMs / gc.view.turn.durationMs) : 0),
    [remainingMs, gc.view.turn],
  );

  // Local expiry UX only; the HOST engine authoritatively ends the turn.
  useEffect(() => {
    if (expired && gc.view.turn) setGuessText('');
  }, [expired, gc.view.turn]);

  if (!gc.view.turn || !gc.isDescriber === undefined) {
    /* fallthrough */
  }

  return (
    <Screen>
      {/* Scoreboard */}
      <View style={styles.scoreRow}>
        <ScorePill name={gc.view.teams[0].name} score={gc.view.teams[0].score} active={gc.view.currentTeamIndex === 0} />
        <Text style={styles.round}>
          R{gc.view.round}/{gc.view.maxRounds}
        </Text>
        <ScorePill name={gc.view.teams[1].name} score={gc.view.teams[1].score} active={gc.view.currentTeamIndex === 1} />
      </View>

      {/* Timer bar */}
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, { width: `${pct * 100}%`, backgroundColor: secs <= 10 ? '#ef4444' : '#22d3ee' }]} />
      </View>
      <Text style={[styles.timerText, secs <= 10 && styles.timerDanger]}>{secs}s</Text>

      {/* Card area — describer only */}
      {gc.view.describerId === gc.myId && gc.view.card ? (
        <View style={styles.cardBox}>
          <Text style={styles.cardWord}>{gc.view.card.word}</Text>
          <Text style={styles.cardPoints}>{gc.view.card.points} pts · {gc.view.card.difficulty}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Button title="Skip (-1)" variant="secondary" onPress={gc.skipCard} />
            <Button title="End Turn" variant="danger" onPress={gc.endTurn} />
          </View>
        </View>
      ) : (
        <View style={styles.spectatorBox}>
          <Text style={styles.hint}>
            {gc.view.describerId
              ? `${nameOf(gc.roster, gc.view.describerId)} is describing for ${gc.view.teams[gc.view.currentTeamIndex]?.name}`
              : 'Get ready…'}
          </Text>
        </View>
      )}

      {/* Guesser input */}
      {gc.iCanGuess && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Type your guess…"
            placeholderTextColor="#475569"
            value={guessText}
            autoCorrect={false}
            autoCapitalize="none"
            onChangeText={setGuessText}
            onSubmitEditing={() => {
              if (guessText.trim()) {
                gc.guess(guessText.trim());
                setGuessText('');
              }
            }}
          />
          <Button title="Guess" onPress={() => {
            if (guessText.trim()) {
              gc.guess(guessText.trim());
              setGuessText('');
            }
          }} />
        </View>
      )}

      {/* Feed */}
      <View style={styles.feed}>
        {gc.view.feed.slice(-6).map((f: import('@shared/game').GuessFeedItem) => (
          <Text key={f.key} style={[styles.feedItem, f.correct ? styles.feedGood : styles.feedBad]}>
            {f.correct ? `✔ ${f.value} +${f.pointsAwarded}` : `✖ ${f.value}`}
          </Text>
        ))}
      </View>
    </Screen>
  );
}

function nameOf(roster: { id: string; name: string }[], id: string): string {
  return roster.find((p) => p.id === id)?.name ?? 'Someone';
}

function ScorePill({ name, score, active }: { name: string; score: number; active: boolean }) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={styles.pillName}>{name}</Text>
      <Text style={styles.pillScore}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: '#94a3b8', textAlign: 'center', marginTop: 20 },
  code: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 10,
    color: '#22d3ee',
    textAlign: 'center',
    marginBottom: 4,
  },
  hint: { color: '#64748b', textAlign: 'center', marginBottom: 18 },
  teamsRow: { flexDirection: 'row', gap: 12, flex: 1 },
  teamCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#111c31',
    borderWidth: 1,
  },
  teamA: { borderColor: '#3b82f6' },
  teamB: { borderColor: '#ef4444' },
  teamName: { color: '#e2e8f0', fontWeight: '700', marginBottom: 8 },
  member: { color: '#cbd5e1', fontSize: 13, marginVertical: 2 },
  waiting: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14 },
  bannerWarn: { backgroundColor: '#78350f', borderRadius: 10, padding: 10, marginBottom: 8 },
  warnText: { color: '#fcd34d', textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { color: '#64748b', fontWeight: '700' },
  pill: { flex: 1, backgroundColor: '#16223a', borderRadius: 10, padding: 8, opacity: 0.6 },
  pillActive: { opacity: 1, borderWidth: 1, borderColor: '#22d3ee' },
  pillName: { color: '#94a3b8', fontSize: 11 },
  pillScore: { color: '#f1f5f9', fontSize: 20, fontWeight: '800' },
  timerTrack: { height: 6, backgroundColor: '#1e293b', borderRadius: 3, marginTop: 12 },
  timerFill: { height: 6, borderRadius: 3 },
  timerText: { color: '#e2e8f0', textAlign: 'center', marginTop: 6, fontSize: 18, fontWeight: '800' },
  timerDanger: { color: '#ef4444' },
  cardBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#132033',
    borderRadius: 18,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: '#22d3ee55',
  },
  cardWord: { color: '#f8fafc', fontSize: 40, fontWeight: '900', textAlign: 'center' },
  cardPoints: { color: '#fbbf24', marginTop: 8, fontWeight: '700' },
  spectatorBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    fontSize: 16,
  },
  feed: { minHeight: 90 },
  feedItem: { fontSize: 13, marginVertical: 2 },
  feedGood: { color: '#34d399' },
  feedBad: { color: '#f87171' },
});
