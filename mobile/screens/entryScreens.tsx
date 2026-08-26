import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Screen } from '../components/ui';
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
      <View style={styles.center}>
        <Text style={styles.title}>TABOO</Text>
        <Text style={styles.subtitle}>P2P multiplayer · WebRTC</Text>
        <View style={{ height: 40 }} />
        <Button title="Create Game" onPress={onCreate} />
        <Button title="Join Game" onPress={onJoin} variant="secondary" />
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
    const ok = await gc.createGame(name.trim() || 'Host');
    if (!ok) return; // error shown by banner
  };
  return (
    <Screen>
      <Text style={styles.heading}>Create Game</Text>
      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor="#475569"
        value={name}
        maxLength={24}
        onChangeText={setName}
      />
      <Button title="Create Room" onPress={() => void create()} disabled={name.trim().length === 0} />
      <Button title="Back" onPress={onCancel} variant="secondary" />
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
      <Text style={styles.heading}>Join Game</Text>
      <TextInput
        style={[styles.input, styles.codeInput]}
        placeholder="ROOM CODE"
        placeholderTextColor="#475569"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
      />
      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor="#475569"
        value={name}
        maxLength={24}
        onChangeText={setName}
      />
      <Button
        title="Join"
        onPress={() => void join()}
        disabled={code.trim().length !== 6 || name.trim().length === 0}
      />
      <Button title="Back" onPress={onCancel} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 56, fontWeight: '900', color: '#22d3ee', textAlign: 'center', letterSpacing: 4 },
  subtitle: { color: '#64748b', textAlign: 'center', marginTop: 8 },
  heading: { fontSize: 24, fontWeight: '700', color: '#e2e8f0', marginBottom: 20 },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  codeInput: { fontSize: 28, textAlign: 'center', letterSpacing: 8, fontWeight: '800' },
});
