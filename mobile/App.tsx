/**
 * App shell — screen state machine (mirrors the web app's pattern:
 * room → lobby → game → gameover), no navigation dependency.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SignalingClient } from './services/signaling/signalingClient';
import { useGameConnection } from './hooks/useGameConnection';
import { Atmosphere, Button, Screen } from './components/ui';
import { color } from './theme';
import {
  CreateGameScreen,
  HomeScreen,
  JoinGameScreen,
  parseRoomUrl,
} from './screens/entryScreens';
import { GameScreen, LobbyScreen } from './screens/LobbyGameScreens';
import { GameOverScreen } from './screens/GameOverScreen';

type Entry = 'home' | 'create' | 'join';

export default function App() {
  // Stable per-install-ish player id (session-scoped MVP).
  const myId = useMemo(() => SignalingClient.playerIdFor('p'), []);
  const gc = useGameConnection(myId);
  const [entry, setEntry] = useState<Entry>('home');
  const [deepLinkCode, setDeepLinkCode] = useState<string | null>(null);

  // Deep link: taboo://room/CODE
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      const code = parseRoomUrl(url);
      if (code) {
        setDeepLinkCode(code);
        setEntry('join');
      }
    });
  }, []);

  const inRoom = !!gc.roomId;

  let body: React.ReactNode;
  if (!inRoom) {
    if (entry === 'create') body = <CreateGameScreen gc={gc} onCancel={() => setEntry('home')} />;
    else if (entry === 'join')
      body = <JoinGameScreen gc={gc} onCancel={() => setEntry('home')} initialCode={deepLinkCode} />;
    else body = <HomeScreen onCreate={() => setEntry('create')} onJoin={() => setEntry('join')} />;
  } else if (gc.view.phase === 'game_over') {
    body = <GameOverScreen gc={gc} />;
  } else if (gc.view.phase === 'playing') {
    body = <GameScreen gc={gc} />;
  } else {
    body = <LobbyScreen gc={gc} onStart={gc.startGame} />;
  }

  return (
    <Atmosphere>
      <StatusBar style="light" />
      {body}

      {/* Global overlays */}
      {(gc.error || gc.hostLost || gc.signalingStatus === 'reconnecting') && inRoom && (
        <View pointerEvents="box-none" style={styles.overlayWrap}>
          {gc.signalingStatus === 'reconnecting' && !gc.hostLost && (
            <Banner text="Reconnecting to signaling…" tone="warn" />
          )}
          {gc.hostLost && (
            <>
              <Banner
                text={'The host left the table.\nThis round can’t continue.'}
                tone="bad"
              />
              <Button title="Leave table" variant="danger" onPress={gc.leaveGame} />
            </>
          )}
          {gc.error && !gc.hostLost && (
            <Banner text={gc.error} tone="bad" onDismiss={gc.clearError} />
          )}
        </View>
      )}
      {!inRoom && gc.error ? (
        <Banner text={gc.error} tone="bad" onDismiss={gc.clearError} />
      ) : null}
    </Atmosphere>
  );
}

function Banner({
  text,
  tone,
  onDismiss,
}: {
  text: string;
  tone: 'warn' | 'bad';
  onDismiss?: () => void;
}) {
  return (
    <View style={[styles.banner, tone === 'warn' ? styles.bannerWarn : styles.bannerBad]}>
      <Text style={styles.bannerText}>{text}</Text>
      {onDismiss && <Button title="Dismiss" variant="secondary" compact onPress={onDismiss} />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    gap: 8,
  },
  banner: { borderRadius: 16, padding: 16, borderWidth: 1 },
  bannerWarn: { backgroundColor: '#2a1c08ee', borderColor: color.gold },
  bannerBad: { backgroundColor: '#2a0c12ee', borderColor: color.blaze },
  bannerText: { color: color.cream, textAlign: 'center', fontWeight: '600', lineHeight: 20 },
});

// Re-export for convenience of entry file.
export { Screen };
