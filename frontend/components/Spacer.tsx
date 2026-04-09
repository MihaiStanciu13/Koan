import React from 'react';
import { View } from 'react-native';

export default function Spacer({ minHeight = 0 }: { minHeight?: number }) {
  return <View style={{ flex: 1, minHeight }} />;
}
