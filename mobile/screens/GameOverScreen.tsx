import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../components/ui';
import type { useGameConnection } from '../hooks/useGameConnection';

type GC = ReturnType<typeof useGameConnection>;

export function GameOverScreen({ gc }: { gc: GC }) {
  const winner = gc.view.winnerTeamIndex;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.trophy}>{winner === null ? '🤝' : '🏆'}</Text>
        <Text style={[styles.title, winner === 0 && styles.teamAWin, winner === 1 && styles.teamBWin]}>
          {winner === null ? "It's a tie!" : `${gc.view.teams[winner].name} wins!`}
        </Text>

        <View style={styles.scoreRow}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.scoreCard, i === 0 ? styles.teamA : styles.teamB]}>
              <Text style={styles.scoreName}>{gc.view.teams[i].name}</Text>
              <Text style={styles.scoreValue}>{gc.view.teams[i].score}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.meta}>
          {gc.view.revealedWords.length} words guessed · {gc.view.round} rounds
        </Text>

        <View style={{ marginTop: 24 }}>
          {gc.isHost() ? (
            <Button title="Play Again" onPress={gc.playAgain} />
          ) : (
            <Text style={styles.hint}>Host can start a new game…</Text>
          )}
          <Button title="Leave Room" variant="danger" onPress={gc.leaveGame} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center' },
  trophy: { fontSize: 72, textAlign: 'center' },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#e2e8f0',
    textAlign: 'center',
    marginBottom: 28,
  },
  teamAWin: { color: '#60a5fa' },
  teamBWin: { color: '#f87171' },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreCard: {
    flex: 1,
    backgroundColor: '#111c31',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
  },
  teamA: { borderColor: '#3b82f655' },
  teamB: { borderColor: '#ef444455' },
  scoreName: { color: '#94a3b8', fontSize: 12 },
  scoreValue: { color: '#f1f5f9', fontSize: 40, fontWeight: '900' },
  meta: { color: '#64748b', textAlign: 'center', marginTop: 16 },
  hint: { color: '#64748b', textAlign: 'center', paddingVertical: 14 },
});
