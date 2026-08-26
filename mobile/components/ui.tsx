import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { color, shadowGold, shadowSoft, space, type } from '../theme';

export function Atmosphere({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={[styles.orb, styles.orbGold]} />
      <View style={[styles.orb, styles.orbTide]} />
      <View style={[styles.orb, styles.orbBlaze]} />
      {children}
    </View>
  );
}

export function Screen({
  children,
  pad = true,
}: {
  children: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, pad && styles.screenPad]}>{children}</View>
    </KeyboardAvoidingView>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  compact?: boolean;
}) {
  const labelTone =
    variant === 'primary'
      ? styles.labelOnGold
      : variant === 'danger'
        ? styles.labelOnDanger
        : styles.labelLight;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        variant === 'ghost' && styles.btnGhost,
        variant === 'primary' && shadowGold,
        pressed && styles.btnPressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text style={[styles.btnLabel, labelTone]}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...input
}: { label?: string } & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={color.mute}
        selectionColor={color.gold}
        {...input}
        style={[styles.input, style]}
      />
    </View>
  );
}

export function Kicker({ children }: { children: string }) {
  return <Text style={type.kicker}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: color.ink, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  orbGold: {
    width: 280,
    height: 280,
    backgroundColor: 'rgba(232, 184, 74, 0.12)',
    top: -90,
    right: -70,
  },
  orbTide: {
    width: 220,
    height: 220,
    backgroundColor: 'rgba(62, 224, 197, 0.08)',
    bottom: 80,
    left: -80,
  },
  orbBlaze: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(255, 107, 107, 0.07)',
    bottom: -40,
    right: -30,
  },
  screen: { flex: 1 },
  screenPad: {
    paddingHorizontal: space.lg,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: space.lg,
  },
  btn: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginVertical: 5,
  },
  btnCompact: { paddingVertical: 11, paddingHorizontal: 14, marginVertical: 0 },
  btnPrimary: { backgroundColor: color.gold },
  btnSecondary: {
    backgroundColor: color.goldDim,
    borderWidth: 1,
    borderColor: color.line,
  },
  btnDanger: {
    backgroundColor: 'rgba(226, 61, 74, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(226, 61, 74, 0.45)',
  },
  btnGhost: { backgroundColor: 'transparent' },
  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  btnDisabled: { opacity: 0.35 },
  btnLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  labelOnGold: { color: '#1a1004' },
  labelOnDanger: { color: '#ffd0d4' },
  labelLight: { color: color.cream },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { ...type.kicker, marginBottom: 8, fontSize: 10 },
  input: {
    backgroundColor: color.panel,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: 14,
    color: color.cream,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
});

export { color, shadowSoft, space, type };
