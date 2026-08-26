import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Kicker, Screen } from '../components/ui';
import { color, space, type } from '../theme';
import type { useGameConnection } from '../hooks/useGameConnection';

type GC = ReturnType<typeof useGameConnection>;

/** Parse taboo://room/CODE or https://<host>/room/CODE deep links. */
export function parseRoomUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:taboo:\/\/room|\/room)\/([A-Za-z0-9]{4,10})/);
  return m ? m[1].toUpperCase() : null;
}

export function HomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <Screen>
      <View style={styles.homeTop}>
        <Kicker>Live table · 2 teams</Kicker>
        <Text style={styles.wordmark}>TABOO</Text>
        <View style={styles.rule} />
        <Text style={styles.tagline}>Describe the word.{'\n'}Never say the forbidden ones.</Text>
      </View>
      <View style={styles.homeActions}>
        <Button title="Host a table" onPress={onCreate} />
        <Button title="Join with a code" onPress={onJoin} variant="secondary" />
        <Text style={styles.footnote}>Up to 8 players · host runs the deck</Text>
      </View>
    </Screen>
  );
}

export function CreateGameScreen({
  gc,
  onCancel,
}: {
  gc: GC;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const create = async () => {
    await gc.createGame(name.trim() || 'Host');
  };
  return (
    <Screen>
      <Pressable onPress={onCancel} hitSlop={12}>
        <Text style={styles.back}>‹  Table</Text>
      </Pressable>
      <View style={styles.formHero}>
        <Kicker>New table</Kicker>
        <Text style={styles.heading}>Host the night</Text>
        <Text style={styles.lede}>
          You’ll hold the word deck. Friends join with a six-letter code — no accounts.
        </Text>
      </View>
      <Field
        label="What should we call you?"
        placeholder="Your name"
        value={name}
        maxLength={24}
        autoFocus
        onChangeText={setName}
      />
      <View style={{ marginTop: 'auto' }}>
        <Button
          title="Open the table"
          onPress={() => void create()}
          disabled={name.trim().length === 0}
        />
        <Button title="Cancel" onPress={onCancel} variant="ghost" />
      </View>
    </Screen>
  );
}

export function JoinGameScreen({
  gc,
  onCancel,
  initialCode,
}: {
  gc: GC;
  onCancel: () => void;
  initialCode?: string | null;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState((initialCode ?? '').toUpperCase());

  React.useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const c = parseRoomUrl(url);
      if (c) setCode(c.toUpperCase());
    });
    return () => sub.remove();
  }, []);

  const join = async () => {
    await gc.joinGame(code.trim(), name.trim() || 'Player');
  };

  return (
    <Screen>
      <Pressable onPress={onCancel} hitSlop={12}>
        <Text style={styles.back}>‹  Table</Text>
      </Pressable>
      <View style={styles.formHero}>
        <Kicker>Take a seat</Kicker>
        <Text style={styles.heading}>Join the table</Text>
        <Text style={styles.lede}>Enter the host’s code. You’ll land on a team in the lobby.</Text>
      </View>
      <Field
        label="Table code"
        placeholder="XXXXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        style={styles.codeField}
      />
      <Field
        label="Your name"
        placeholder="What should we call you?"
        value={name}
        maxLength={24}
        onChangeText={setName}
      />
      <View style={{ marginTop: 'auto' }}>
        <Button
          title="Sit down"
          onPress={() => void join()}
          disabled={code.trim().length !== 6 || name.trim().length === 0}
        />
        <Button title="Cancel" onPress={onCancel} variant="ghost" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  homeTop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  wordmark: { ...type.wordmark, textAlign: 'center', marginTop: 14 },
  rule: {
    width: 56,
    height: 2,
    backgroundColor: color.gold,
    marginVertical: 18,
    opacity: 0.85,
  },
  tagline: {
    ...type.body,
    textAlign: 'center',
    color: color.mute,
    fontSize: 16,
    lineHeight: 24,
  },
  homeActions: { paddingBottom: space.sm },
  footnote: { ...type.mute, textAlign: 'center', marginTop: 8 },
  back: { color: color.gold, fontSize: 16, fontWeight: '600', marginBottom: 28 },
  formHero: { marginBottom: 28 },
  heading: { ...type.display, marginTop: 8, marginBottom: 10 },
  lede: { ...type.mute, fontSize: 15, lineHeight: 22 },
  codeField: {
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 10,
    fontWeight: '800',
    paddingVertical: 18,
    color: color.gold,
  },
});
