import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type } from '../theme';
export const guardianStarters = ['오늘 있었던 일, 잠깐 들어줄래?', '마음이 복잡해. 같이 정리해 볼까?', '오늘 일기에 무엇을 적으면 좋을까?'];
export function GuardianWelcome({ name, avatarUri, ready, busy, onSetup, onChoose }: {
  name: string; avatarUri?: string; ready: boolean; busy: boolean; onSetup: () => void; onChoose: (prompt: string) => void;
}) {
  return <View style={styles.wrap}>
    <View style={styles.scene}><Image source={avatarUri ? { uri: avatarUri } : require('../../assets/forest-guardian.png')} resizeMode="contain" style={styles.mascot} /></View>
    <Text style={styles.title}>오늘 하루, 어땠어요?</Text><Text style={styles.copy}>작은 기쁨도, 조금 복잡한 마음도.{ '\n' }{name}가 천천히 들어줄게요.</Text>
    {ready ? <View style={styles.starters}>{guardianStarters.map((prompt, index) => <Pressable key={prompt} accessibilityRole="button" onPress={() => onChoose(prompt)} style={styles.starter}><Ionicons name={index === 2 ? 'book-outline' : index === 1 ? 'heart-outline' : 'chatbubble-outline'} size={19} color={colors.tealDark} /><Text style={styles.prompt}>{prompt}</Text><Ionicons name="arrow-forward" size={16} color={colors.inkMuted} /></Pressable>)}</View>
      : !busy ? <Pressable accessibilityRole="button" onPress={onSetup} style={styles.setup}><Ionicons name="sparkles-outline" size={18} color={colors.actionInk} /><Text style={styles.setupText}>대화 연결하기</Text></Pressable> : null}
    <Text style={styles.privacy}>일기는 직접 첨부할 때만 함께 읽어요.</Text>
  </View>;
}
const styles = StyleSheet.create({ wrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, alignItems: 'center', width: '100%' }, scene: { marginTop: 12, width: 144, height: 144, borderRadius: 50, backgroundColor: '#F1E7F5', alignItems: 'center', justifyContent: 'center' }, mascot: { width: 148, height: 148 }, title: { fontSize: 25, color: colors.ink, fontWeight: '800', marginTop: 25 }, copy: { color: colors.inkSoft, textAlign: 'center', fontSize: type.body, lineHeight: 27, marginTop: 12 }, starters: { marginTop: 28, width: '100%', gap: 10 }, starter: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18 }, prompt: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 21 }, setup: { marginTop: 26, minHeight: 52, paddingHorizontal: 24, borderRadius: 18, backgroundColor: colors.action, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, setupText: { color: colors.actionInk, fontSize: type.body, fontWeight: '700' }, privacy: { marginTop: 25, color: colors.inkMuted, fontSize: 12 }, });
