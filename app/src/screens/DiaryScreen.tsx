import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { NativeDiary } from '../services/diary';
import type { BackendClient } from '../services/backend';
import { colors, radius, spacing, type } from '../theme';

export function DiaryScreen({ client, userId }: { client: BackendClient; userId: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [summary, setSummary] = useState<{ entryCount: number; version: number } | null>(null);
  useEffect(() => { let current = true; client.request<{ entryCount: number; version: number }>('/v1/diary', { method: 'GET' }, { queue: false }).then(data => { if (current) setSummary(data); }).catch(() => {}); return () => { current = false; }; }, [client]);
  const open = async (compose: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (!NativeDiary) throw new Error('일기는 업데이트된 Android 앱에서 사용할 수 있어요.');
      // Refresh an expired app session before giving the native diary a process-local access token.
      await client.request('/v1/me', { method: 'GET' }, { queue: false, timeoutMs: 2000, rateLimitRetries: 0 }).catch(() => undefined);
      await NativeDiary.open(userId, client.getBaseUrl(), client.getAccessToken(), compose);
    } catch (e) { setError(e instanceof Error ? e.message : '일기를 열지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.screen}><ScreenHeader title="일기" detail="나만의 작은 순간을 모으는 곳" tone="diary" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><View style={styles.date}><Text style={styles.dateText}>{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</Text></View>
        <Text style={styles.heroTitle}>오늘의 작은 순간을{ '\n' }간직해 보세요.</Text><Text style={styles.body}>잘 쓴 글이 아니어도 괜찮아요.{ '\n' }오늘의 나를 한 줄로 남겨보세요.</Text>
        <View style={styles.art}><Ionicons name="book-outline" size={82} color="#AC92C5" /><Ionicons name="heart" size={28} color="#DCA8BE" style={styles.heart} /></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="새 일기 쓰기" onPress={() => void open(true)} disabled={busy} style={styles.write}>
        {busy ? <ActivityIndicator color="white" /> : <Ionicons name="add" size={24} color="white" />}<Text style={styles.writeText}>오늘의 이야기 쓰기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void open(false)} disabled={busy} style={styles.library}><View style={styles.libraryIcon}><Ionicons name="albums-outline" size={26} color={colors.tealDark} /></View><View style={{ flex: 1 }}><Text style={styles.libraryTitle}>나의 일기 펼치기</Text><Text style={styles.sub}>{summary?.version ? `서버에 보관한 ${summary.entryCount}편의 이야기` : '기록 · 달력 · 나를 돌아보기'}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.inkMuted} /></Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.note}><Ionicons name="lock-closed-outline" size={16} color={colors.inkMuted} /><Text style={styles.noteText}>기기에서는 암호화해 보관해요. 연결되면 첨부와 함께 서버에 백업하며 마스터가 조회·백업·복구할 수 있어요.</Text></View>
      {Platform.OS !== 'android' ? <Text style={styles.noteText}>전체 일기 편집·기기 잠금·위젯 기능은 Android 앱에서 제공됩니다.</Text> : null}
    </ScrollView></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.xl, gap: spacing.xl },
  hero: { padding: 25, paddingBottom: 110, borderRadius: 30, backgroundColor: '#EDE2F7', overflow: 'hidden' }, date: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: '#F7F0FC' }, dateText: { color: colors.inkSoft, fontSize: type.small },
  heroTitle: { color: colors.ink, fontSize: 27, lineHeight: 39, fontWeight: '800', marginTop: 22 }, body: { color: colors.inkSoft, fontSize: type.body, lineHeight: 26, marginTop: 14 },
  art: { position: 'absolute', right: 24, bottom: 15, transform: [{ rotate: '10deg' }] }, heart: { position: 'absolute', top: 30, left: 28 },
  write: { minHeight: 58, borderRadius: 20, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', gap: 9, flexDirection: 'row' }, writeText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '800' },
  library: { paddingVertical: 20, gap: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line }, libraryIcon: { padding: 12, backgroundColor: colors.surfaceLavender, borderRadius: 18 }, libraryTitle: { color: colors.ink, fontSize: type.section, fontWeight: '700' }, sub: { fontSize: type.small, color: colors.inkSoft, marginTop: 7 },
  note: { flexDirection: 'row', gap: 9 }, noteText: { flex: 1, fontSize: type.small, color: colors.inkMuted, lineHeight: 22 }, error: { color: colors.coral, fontSize: type.small, lineHeight: 22 },
});
