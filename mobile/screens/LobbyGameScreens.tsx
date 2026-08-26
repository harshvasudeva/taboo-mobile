import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Kicker, Screen } from '../components/ui';
import { color, shadowSoft, type } from '../theme';
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
      <Kicker>The table is open</Kicker>
      <Text style={styles.ticketLabel}>Share this code</Text>
      <View style={styles.ticket}>
        <Text style={styles.code}>{gc.roomId ?? '······'}</Text>
      </View>
      <Text style={styles.hint}>Friends join with this code · max 8 at the table</Text>

      <View style={styles.teamsRow}>
        <TeamCard index={0} gc={gc} />
        <TeamCard index={1} gc={gc} />
      </View>

      {gc.signalingStatus === 'reconnecting' && (
        <Text style={styles.warn}>Reconnecting to the room…</Text>
      )}

      {gc.isHost() ? (
        <Button
          title={bothTeamsReady ? 'Deal the first round' : 'Need a player on each team'}
          onPress={onStart}
          disabled={!bothTeamsReady}
        />
      ) : (
        <View style={styles.waiting}>
          <ActivityIndicator color={color.gold} />
          <Text style={styles.hintInline}> Host is setting the table…</Text>
        </View>
      )}
      <Button title="Leave table" onPress={gc.leaveGame} variant="ghost" />
    </Screen>
  );
}

function TeamCard({ index, gc }: { index: 0 | 1; gc: GC }) {
  const team = gc.view.teams[index];
  const accent = index === 0 ? color.tide : color.blaze;
  const mine = team.members.some((m) => m.id === gc.myId);
  return (
    <View style={[styles.teamCard, { borderColor: accent }]}>
      <View style={[styles.teamStripe, { backgroundColor: accent }]} />
      <Text style={[styles.teamName, { color: accent }]}>{team.name}</Text>
      <View style={styles.members}>
        {team.members.length === 0 ? (
          <Text style={styles.emptySeat}>Empty seats</Text>
        ) : (
          team.members.map((m: { id: string; name: string; isHost: boolean }) => (
            <View key={m.id} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {m.isHost ? 'Host · ' : ''}
                {m.name}
                {m.id === gc.myId ? '  · you' : ''}
              </Text>
            </View>
          ))
        )}
      </View>
      <Pressable
        onPress={() => gc.switchTeam(index)}
        style={[styles.sitBtn, mine && { backgroundColor: accent + '33', borderColor: accent }]}
      >
        <Text style={[styles.sitLabel, { color: mine ? accent : color.cream }]}>
          {mine ? 'Seated' : 'Sit here'}
        </Text>
      </Pressable>
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
  const describing = gc.view.describerId === gc.myId && gc.view.card;
  const hot = secs <= 10;
  const describerName = nameOf(gc.roster, gc.view.describerId);
  const teamName = gc.view.teams[gc.view.currentTeamIndex]?.name ?? 'a team';

  useEffect(() => {
    if (expired && gc.view.turn) setGuessText('');
  }, [expired, gc.view.turn]);

  const submitGuess = () => {
    if (!guessText.trim()) return;
    gc.guess(guessText.trim());
    setGuessText('');
  };

  return (
    <Screen>
      <View style={styles.scoreRow}>
        <ScorePill
          name={gc.view.teams[0].name}
          score={gc.view.teams[0].score}
          active={gc.view.currentTeamIndex === 0}
          accent={color.tide}
        />
        <View style={styles.roundBadge}>
          <Text style={styles.roundKicker}>Round</Text>
          <Text style={styles.roundNum}>
            {gc.view.round}
            <Text style={styles.roundMax}>/{gc.view.maxRounds}</Text>
          </Text>
        </View>
        <ScorePill
          name={gc.view.teams[1].name}
          score={gc.view.teams[1].score}
          active={gc.view.currentTeamIndex === 1}
          accent={color.blaze}
        />
      </View>

      <View style={styles.timerBlock}>
        <Text style={[styles.timerText, hot && styles.timerHot]}>{Number.isFinite(secs) ? secs : '—'}</Text>
        <View style={styles.timerTrack}>
          <View
            style={[
              styles.timerFill,
              { width: `${pct * 100}%`, backgroundColor: hot ? color.blaze : color.gold },
            ]}
          />
        </View>
      </View>

      {describing ? (
        <View style={[styles.playingCard, shadowSoft]}>
          <Text style={styles.cardKicker}>Describe this · don’t say it</Text>
          <Text style={styles.cardWord}>{gc.view.card!.word}</Text>
          <Text style={styles.cardMeta}>
            {gc.view.card!.points} pts · {gc.view.card!.difficulty}
          </Text>
          {gc.view.card!.taboo && gc.view.card!.taboo.length > 0 ? (
            <View style={styles.tabooBox}>
              <Text style={styles.tabooLabel}>Forbidden</Text>
              {gc.view.card!.taboo.map((w) => (
                <Text key={w} style={styles.tabooWord}>
                  {w}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.cardActions}>
            <View style={{ flex: 1 }}>
              <Button title="Skip  −1" variant="secondary" compact onPress={gc.skipCard} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="End turn" variant="danger" compact onPress={gc.endTurn} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.listenCard}>
          <Kicker>On the clock</Kicker>
          <Text style={styles.listenTitle}>{describerName}</Text>
          <Text style={styles.listenSub}>describing for {teamName}</Text>
          <Text style={styles.listenHint}>
            {gc.iCanGuess ? 'Type what you think it is.' : 'Listen. Don’t spoil the table.'}
          </Text>
        </View>
      )}

      {gc.iCanGuess && (
        <View style={styles.guessRow}>
          <TextInput
            placeholder="Your guess"
            placeholderTextColor={color.mute}
            selectionColor={color.gold}
            value={guessText}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="send"
            onChangeText={setGuessText}
            onSubmitEditing={submitGuess}
            style={styles.guessInput}
          />
          <Button title="Send" compact onPress={submitGuess} />
        </View>
      )}

      <View style={styles.feed}>
        {gc.view.feed.slice(-5).map((f: import('@shared/game').GuessFeedItem) => (
          <Text key={f.key} style={[styles.feedItem, f.correct ? styles.feedGood : styles.feedBad]}>
            {f.correct ? `Hit  ${f.value}  +${f.pointsAwarded}` : `Miss  ${f.value}`}
          </Text>
        ))}
      </View>
    </Screen>
  );
}

function nameOf(roster: { id: string; name: string }[], id: string | null): string {
  if (!id) return 'Someone';
  return roster.find((p) => p.id === id)?.name ?? 'Someone';
}

function ScorePill({
  name,
  score,
  active,
  accent,
}: {
  name: string;
  score: number;
  active: boolean;
  accent: string;
}) {
  return (
    <View style={[styles.pill, active && { borderColor: accent, backgroundColor: accent + '22' }]}>
      <Text style={[styles.pillName, active && { color: accent }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.pillScore}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ticketLabel: { ...type.mute, marginTop: 10, marginBottom: 8 },
  ticket: {
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.gold,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  code: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 12,
    color: color.gold,
  },
  hint: { ...type.mute, textAlign: 'center', marginTop: 10, marginBottom: 18 },
  hintInline: { ...type.mute },
  teamsRow: { flexDirection: 'row', gap: 12, flex: 1, minHeight: 220 },
  teamCard: {
    flex: 1,
    borderRadius: 18,
    padding: 12,
    paddingTop: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    overflow: 'hidden',
  },
  teamStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  teamName: { fontWeight: '800', fontSize: 15, marginBottom: 10, letterSpacing: 0.4 },
  members: { flex: 1, gap: 6 },
  emptySeat: { ...type.mute, fontStyle: 'italic' },
  chip: {
    backgroundColor: color.ink2,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipText: { color: color.cream, fontSize: 12, fontWeight: '600' },
  sitBtn: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.line,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sitLabel: { fontWeight: '700', fontSize: 13 },
  waiting: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
  },
  warn: { color: color.warn, textAlign: 'center', marginBottom: 8, fontWeight: '600' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundBadge: { alignItems: 'center', minWidth: 56 },
  roundKicker: { ...type.kicker, fontSize: 9, color: color.mute },
  roundNum: { color: color.cream, fontSize: 18, fontWeight: '800' },
  roundMax: { color: color.mute, fontWeight: '600', fontSize: 13 },
  pill: {
    flex: 1,
    backgroundColor: color.panel,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: color.line,
  },
  pillName: { color: color.mute, fontSize: 11, fontWeight: '700' },
  pillScore: { color: color.cream, fontSize: 22, fontWeight: '800', marginTop: 2 },
  timerBlock: { marginTop: 16, marginBottom: 8, alignItems: 'center' },
  timerText: {
    fontSize: 42,
    fontWeight: '300',
    color: color.gold,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  timerHot: { color: color.blaze, fontWeight: '700' },
  timerTrack: {
    height: 4,
    width: '100%',
    backgroundColor: color.panelLift,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  timerFill: { height: 4, borderRadius: 2 },
  playingCard: {
    flex: 1,
    marginVertical: 12,
    backgroundColor: '#f3e6d0',
    borderRadius: 20,
    padding: 22,
    justifyContent: 'center',
  },
  cardKicker: {
    ...type.kicker,
    color: '#7a5a28',
    textAlign: 'center',
    marginBottom: 12,
  },
  cardWord: {
    fontFamily: type.display.fontFamily,
    fontSize: 42,
    color: '#1a1008',
    textAlign: 'center',
    fontWeight: '500',
  },
  cardMeta: { textAlign: 'center', color: '#7a5a28', marginTop: 8, fontWeight: '700' },
  tabooBox: { marginTop: 18, alignItems: 'center', gap: 4 },
  tabooLabel: { ...type.kicker, color: color.blazeDeep, marginBottom: 4 },
  tabooWord: { color: '#5c2a2a', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  listenCard: {
    flex: 1,
    marginVertical: 12,
    backgroundColor: color.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listenTitle: { ...type.display, textAlign: 'center', marginTop: 12 },
  listenSub: { ...type.mute, marginTop: 6, fontSize: 15 },
  listenHint: { ...type.body, textAlign: 'center', marginTop: 22, color: color.mute },
  guessRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  guessInput: {
    flex: 1,
    backgroundColor: color.panel,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: 14,
    color: color.cream,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  feed: { minHeight: 72, gap: 4 },
  feedItem: { fontSize: 13, fontWeight: '600' },
  feedGood: { color: color.ok },
  feedBad: { color: color.blaze },
});
