import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';
import { colors, radius, spacing, type } from '../theme';
import type { Profile, TabKey } from '../types';

export function SettingsScreen({ profile, onNavigate, onGuardianSettings }: {
  profile: Profile; onNavigate: (tab: TabKey) => void; onGuardianSettings: () => void;
}) {
  const rows = [
    { icon: 'people-outline' as const, title: '가족과 안심', detail: '가족 연결 · 위치 공유 · 보호자 관계', action: () => onNavigate('family') },
    { icon: 'sparkles-outline' as const, title: '나의 지키미', detail: '말투 · AI 연결 · 대화 방식', action: onGuardianSettings },
    { icon: 'person-circle-outline' as const, title: '프로필과 앱 관리', detail: '프로필 사진 · 업데이트 · 로그아웃', action: () => onNavigate('me') },
  ];
  return <View style={styles.screen}><ScreenHeader title="설정" detail="우리의 공간을 내게 맞게" tone="settings" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profile}><Avatar name={profile.name} uri={profile.avatarUri} color={profile.color} size={58} /><View style={{ flex: 1 }}><Text style={styles.name}>{profile.name}</Text><Text style={styles.detail}>{profile.status || '가까운 사람들과, 소중한 하루를.'}</Text></View></View>
      <Text style={styles.label}>나와 우리</Text>
      <View style={styles.group}>{rows.map(row => <Pressable key={row.title} accessibilityRole="button" onPress={row.action} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
        <View style={styles.icon}><Ionicons name={row.icon} size={23} color={colors.tealDark} /></View><View style={{ flex: 1 }}><Text style={styles.title}>{row.title}</Text><Text style={styles.detail}>{row.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </Pressable>)}</View>
      <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={20} color={colors.tealDark} /><Text style={styles.noteText}>일기는 계정별로 저장돼요. 마스터 관리자는 서버 기록을 조회·백업·복구할 수 있어요. 지키미에는 직접 선택한 일기만 전달됩니다.</Text></View>
      <Text style={styles.footer}>우리들의 아지트 · 소중한 일상을 함께</Text>
    </ScrollView></View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.xl, gap: spacing.xl },
  profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center', paddingVertical: spacing.md },
  name: { color: colors.ink, fontSize: type.title, fontWeight: '800' }, detail: { color: colors.inkSoft, fontSize: type.small, lineHeight: 21, marginTop: 5 },
  label: { color: colors.inkMuted, fontSize: type.small, fontWeight: '700' }, group: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { minHeight: 88, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceLavender },
  title: { color: colors.ink, fontSize: type.body, fontWeight: '700' }, note: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceLavender },
  noteText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 22 }, footer: { color: colors.inkMuted, fontSize: type.small, textAlign: 'center' },
});
