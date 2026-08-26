import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Screen({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={styles.screen}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 6,
  },
  primary: { backgroundColor: '#06b6d4' },
  secondary: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  danger: { backgroundColor: '#dc2626' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  label: { color: '#082f49', fontWeight: '700', fontSize: 16 },
  labelSecondary: { color: '#e2e8f0' },
  screen: { flex: 1, backgroundColor: '#0b1120', padding: 20 },
});
