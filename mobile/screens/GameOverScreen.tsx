import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Kicker, Screen } from '../components/ui';
import { color, type } from '../theme';
import type { useGameConnection } from '../hooks/useGameConnection';

type GC = ReturnType<typeof useGameConnection>;

export function GameOverScreen({ gc }: { gc: GC }) {
  const winner = gc.view.winnerTeamIndex;
  const headline =
    winner === null ? 'Dead heat' : `${gc.view.teams[winner].name} takes the night`;
  const accent = winner === 0 ? color.tide : winner === 1 ? color.blaze : color.gold;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <Kicker>Final table</Kicker>
        <Text style={[styles.title, { color: accent }]}>{headline}</Text>
        <Text style={styles.sub}>
          {gc.view.revealedWords.length} words hit · {gc.view.round} rounds
        </Text>

        <View style={styles.scoreRow}>
          {[0, 1].map((i) => {
            const won = winner === i;
            const teamAccent = i === 0 ? color.tide : color.blaze;
            return (
              <View
                key={i}
                style={[
                  styles.scoreCard,
                  { borderColor: won ? teamAccent : color.line },
                  won && { backgroundColor: teamAccent + '18' },
                ]}
              >
                {won ? <Text style={[styles.wonTag, { color: teamAccent }]}>WINNER</Text> : null}
                <Text style={styles.scoreName}>{gc.view.teams[i].name}</Text>
                <Text style={[styles.scoreValue, { color: teamAccent }]}>{gc.view.teams[i].score}</Text>
              </View>
            );
          })}
        </View>

        <View style={{ marginTop: 32 }}>
          {gc.isHost() ? (
            <Button title="Shuffle and deal again" onPress={gc.playAgain} />
          ) : (
            <Text style={styles.hint}>Waiting on the host for another round…</Text>
          )}
          <Button title="Leave the table" variant="ghost" onPress={gc.leaveGame} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', paddingBottom: 12 },
  title: { ...type.display, marginTop: 10, marginBottom: 8 },
  sub: { ...type.mute, marginBottom: 28 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreCard: {
    flex: 1,
    backgroundColor: color.panel,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  wonTag: { ...type.kicker, marginBottom: 10, fontSize: 10 },
  scoreName: { color: color.mute, fontSize: 13, fontWeight: '700' },
  scoreValue: { fontSize: 44, fontWeight: '300', marginTop: 4 },
  hint: { ...type.mute, textAlign: 'center', paddingVertical: 14 },
});
