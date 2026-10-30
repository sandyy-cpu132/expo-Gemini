import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

interface PersonaAvatarProps {
  name: string;
  avatarKey?: string;
  size?: number;
}

export const PersonaAvatar: React.FC<PersonaAvatarProps> = ({
  name,
  avatarKey,
  size = 40,
}) => {
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  let bgColor = theme.avatarColors.default;
  const key = (avatarKey || name).toLowerCase();
  if (key.includes('clover')) bgColor = theme.avatarColors.clover;
  else if (key.includes('aegis')) bgColor = theme.avatarColors.aegis;
  else if (key.includes('athena')) bgColor = theme.avatarColors.athena;
  else if (key.includes('kaelen')) bgColor = theme.avatarColors.kaelen;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text style={[styles.letter, { fontSize: Math.max(12, Math.round(size * 0.45)) }]}>
        {initial}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  letter: {
    fontWeight: '700',
    color: '#ffffff',
  },
});
