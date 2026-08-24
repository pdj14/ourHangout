import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, shadow, spacing, type } from '../theme';
import { formatAppUpdateFileSize, type AppUpdateInstallPhase, type AppUpdateState } from '../services/appUpdate';
import {
  setDebugModeEnabled,
  useDebugMode,
} from '../services/debugMode';
// 진단 로그 모듈은 선택 의존성이다. 진단 패치가 적용되지 않은 빌드에서도
// 화면이 깨지지 않도록 namespace import + 기능 감지로 접근한다.
import * as aiTransport from '../services/aiProviders';
import type { Profile, Room } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');

// 숨겨진 개발자 모드 토글: 마스코트를 4초 안에 7번 탭하면 켜짐/꺼짐이 바뀐다.
const DEBUG_TAPS_REQUIRED = 7;
const DEBUG_TAP_WINDOW_MS = 4000;
const DEBUG_TAP_HINT_FROM = 4;

type AiTransportLogEntry = {
  at?: unknown;
  source?: unknown;
  event?: unknown;
  detail?: unknown;
};

type AiTransportLogModule = {
  getAiTransportLogs?: () => unknown[];
  clearAiTransportLogs?: () => void;
};

const aiTransportLogs = aiTransport as unknown as AiTransportLogModule;

function formatAiTransportEntry(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return String(entry);
  const record = entry as AiTransportLogEntry;
  const at = typeof record.at === 'string' ? record.at : '';
  const source = typeof record.source === 'string' ? record.source : '?';
  const event = typeof record.event === 'string' ? record.event : '?';
  let detail = '';
  if (record.detail !== undefined && record.detail !== null) {
    try {
      detail = ` ${JSON.stringify(record.detail)}`;
    } catch {
      detail = ' [detail 직렬화 실패]';
    }
  }
  return `[${at}] ${source}/${event}${detail}`;
}

type ProfileScreenProps = {
  profile: Profile;
  rooms: Room[];
  serverLabel: string;
  syncMessage: string;
  busy: boolean;
  updateSupported: boolean;
  currentAppVersion: string;
  appUpdate: AppUpdateState;
  appUpdateInstallPhase: AppUpdateInstallPhase;
  onPickAvatar: () => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onToggleServer: () => void;
  onSignOut: () => void;
};

export function ProfileScreen({
  profile,
  rooms,
  serverLabel,
  syncMessage,
  busy,
  updateSupported,
  currentAppVersion,
  appUpdate,
  appUpdateInstallPhase,
  onPickAvatar,
  onCheckUpdate,
  onInstallUpdate,
  onToggleServer,
  onSignOut,
}: ProfileScreenProps) {
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [devLogOpen, setDevLogOpen] = useState(false);
  const [devLogLines, setDevLogLines] = useState<string[]>([]);
  const [tapHintRemaining, setTapHintRemaining] = useState<number | null>(null);
  const debugEnabled = useDebugMode();
  const tapStampsRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const familyRooms = rooms.filter((room) => room.type === 'family').length;
  const unreadTotal = rooms.reduce((sum, room) => sum + room.unread, 0);
  const updateFileSize = formatAppUpdateFileSize(appUpdate.release?.sizeBytes);
  const installingUpdate = appUpdateInstallPhase !== 'idle';
  const updateSummary = appUpdate.checking
    ? '서버에서 최신 버전을 확인하고 있습니다.'
    : appUpdate.errorMessage
      ? appUpdate.errorMessage
      : appUpdate.needsUpdate
        ? `새 버전 ${appUpdate.latestVersion}을 설치할 수 있습니다.`
        : appUpdate.checked
          ? '현재 최신 버전을 사용하고 있습니다.'
          : '서버에 새 버전이 있는지 확인할 수 있습니다.';
  const installButtonLabel =
    appUpdateInstallPhase === 'downloading'
      ? '업데이트 다운로드 중...'
      : appUpdateInstallPhase === 'openingInstaller'
        ? '설치 화면 여는 중...'
        : '최신 버전 업데이트';

  useEffect(() => () => {
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
  }, []);

  const handleGuardianMascotTap = useCallback(() => {
    const now = Date.now();
    const stamps = tapStampsRef.current.filter((stamp) => now - stamp <= DEBUG_TAP_WINDOW_MS);
    stamps.push(now);
    tapStampsRef.current = stamps;

    if (stamps.length >= DEBUG_TAPS_REQUIRED) {
      tapStampsRef.current = [];
      setTapHintRemaining(null);
      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
      const next = !debugEnabled;
      void setDebugModeEnabled(next);
      Alert.alert(
        '개발자 모드',
        next
          ? '개발자 모드를 켰어요.\n프로필 화면에 진단 도구가 나타납니다.'
          : '개발자 모드를 껐어요.'
      );
      return;
    }

    if (stamps.length >= DEBUG_TAP_HINT_FROM) {
      setTapHintRemaining(DEBUG_TAPS_REQUIRED - stamps.length);
      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
      tapResetTimerRef.current = setTimeout(() => {
        tapStampsRef.current = [];
        setTapHintRemaining(null);
      }, DEBUG_TAP_WINDOW_MS);
    }
  }, [debugEnabled]);

  const collectDevLogLines = useCallback((): string[] => {
    const readLogs = aiTransportLogs.getAiTransportLogs;
    if (typeof readLogs !== 'function') {
      return [
        'AI 전송 로그 모듈이 이 빌드에 없습니다.',
        '진단 패치(openAiCompatibleTransport.ts 교체)를 적용한 뒤 다시 빌드해 주세요.',
      ];
    }
    try {
      const entries = readLogs() || [];
      const lines = entries.map(formatAiTransportEntry);
      return lines.length ? lines : ['기록된 AI 전송 로그가 없습니다. 대화를 한 번 시도한 뒤 다시 열어 주세요.'];
    } catch (error) {
      return [`로그를 읽는 중 오류: ${error instanceof Error ? error.message : String(error)}`];
    }
  }, []);

  const openDevLogs = useCallback(() => {
    setDevLogLines(collectDevLogLines());
    setDevLogOpen(true);
  }, [collectDevLogLines]);

  const shareDevLogs = useCallback(async () => {
    try {
      await Share.share({ message: collectDevLogLines().join('\n') });
    } catch {
      // 공유 취소 등은 무시한다.
    }
  }, [collectDevLogLines]);

  const clearDevLogs = useCallback(() => {
    const clearLogs = aiTransportLogs.clearAiTransportLogs;
    if (typeof clearLogs === 'function') clearLogs();
    setDevLogLines([]);
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="프로필" detail="가족 계정, 사진, 연결 상태" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profilePanel}>
          <View style={styles.avatarButton}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={profile.avatarUri ? '프로필 사진 크게 보기' : '프로필 사진 등록'}
              disabled={busy}
              onPress={() => (profile.avatarUri ? setPhotoViewerOpen(true) : onPickAvatar())}
            >
              <Avatar name={profile.name} color={profile.color} uri={profile.avatarUri} size={68} online />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="프로필 사진 변경"
              disabled={busy}
              hitSlop={8}
              onPress={onPickAvatar}
              style={styles.cameraBadge}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={15} color="#FFFFFF" />}
            </Pressable>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
            <Text style={styles.status} numberOfLines={2}>
              {profile.status || profile.email || '가족에게 보여줄 한마디를 남겨보세요.'}
            </Text>
          </View>
        </View>

        {tapHintRemaining !== null ? (
          <Text style={styles.debugTapHint}>개발자 모드 전환까지 {tapHintRemaining}번 더 탭</Text>
        ) : null}

        {syncMessage ? <Text style={styles.syncMessage}>{syncMessage}</Text> : null}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{rooms.length}</Text>
            <Text style={styles.statLabel}>대화방</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{familyRooms}</Text>
            <Text style={styles.statLabel}>가족방</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{unreadTotal}</Text>
            <Text style={styles.statLabel}>읽지 않음</Text>
          </View>
        </View>

        {debugEnabled ? (
          <View style={styles.devCard}>
            <View style={styles.devHeader}>
              <View style={styles.devBadge}>
                <Ionicons name="terminal-outline" size={18} color="#FFFFFF" />
              </View>
              <View style={styles.devHeaderCopy}>
                <Text style={styles.devTitle}>개발자 모드</Text>
                <Text style={styles.devSummary}>릴리스 빌드용 진단 도구입니다.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="개발자 모드 끄기"
                onPress={() => void setDebugModeEnabled(false)}
                style={styles.devOffButton}
              >
                <Ionicons name="power-outline" size={15} color={colors.coral} />
                <Text style={styles.devOffButtonText}>끄기</Text>
              </Pressable>
            </View>
            <View style={styles.devMetaRow}>
              <Text style={styles.devMetaLabel}>앱 버전</Text>
              <Text style={styles.devMetaValue}>{currentAppVersion}</Text>
            </View>
            <View style={styles.devMetaRow}>
              <Text style={styles.devMetaLabel}>연결 서버</Text>
              <Text style={styles.devMetaValue} numberOfLines={1}>{serverLabel}</Text>
            </View>
            <View style={styles.devActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="AI 전송 로그 보기"
                onPress={openDevLogs}
                style={styles.devActionButton}
              >
                <Ionicons name="bug-outline" size={15} color={colors.tealDark} />
                <Text style={styles.devActionButtonText}>AI 로그</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="AI 전송 로그 공유"
                onPress={() => void shareDevLogs()}
                style={styles.devActionButton}
              >
                <Ionicons name="share-social-outline" size={15} color={colors.tealDark} />
                <Text style={styles.devActionButtonText}>공유</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="AI 전송 로그 비우기"
                onPress={clearDevLogs}
                style={styles.devActionButton}
              >
                <Ionicons name="trash-outline" size={15} color={colors.coral} />
                <Text style={[styles.devActionButtonText, styles.devActionButtonDanger]}>비우기</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {updateSupported ? (
          <View style={styles.updateCard}>
            <View style={styles.updateHeader}>
              <View style={styles.updateIcon}>
                <Ionicons name="cloud-download-outline" size={20} color={colors.tealDark} />
              </View>
              <View style={styles.updateHeaderCopy}>
                <Text style={styles.updateTitle}>앱 업데이트</Text>
                <Text style={styles.updateSummary}>{updateSummary}</Text>
              </View>
            </View>
            <View style={styles.updateMetaRow}>
              <Text style={styles.updateMetaLabel}>현재 버전</Text>
              <Text style={styles.updateMetaValue}>{currentAppVersion}</Text>
            </View>
            {appUpdate.latestVersion ? (
              <View style={styles.updateMetaRow}>
                <Text style={styles.updateMetaLabel}>서버 최신 버전</Text>
                <Text style={styles.updateMetaValue}>{appUpdate.latestVersion}</Text>
              </View>
            ) : null}
            {updateFileSize ? (
              <View style={styles.updateMetaRow}>
                <Text style={styles.updateMetaLabel}>파일 크기</Text>
                <Text style={styles.updateMetaValue}>{updateFileSize}</Text>
              </View>
            ) : null}
            {appUpdate.release?.notes?.trim() ? (
              <Text style={styles.updateNotes}>{appUpdate.release.notes.trim()}</Text>
            ) : null}
            <View style={styles.updateActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="앱 업데이트 확인"
                disabled={appUpdate.checking || installingUpdate}
                onPress={onCheckUpdate}
                style={[styles.updateCheckButton, (appUpdate.checking || installingUpdate) && styles.updateButtonDisabled]}
              >
                {appUpdate.checking ? (
                  <ActivityIndicator size="small" color={colors.tealDark} />
                ) : (
                  <Ionicons name="refresh" size={17} color={colors.tealDark} />
                )}
                <Text style={styles.updateCheckButtonText}>업데이트 확인</Text>
              </Pressable>
              {appUpdate.needsUpdate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="최신 버전 업데이트"
                  disabled={installingUpdate}
                  onPress={onInstallUpdate}
                  style={[styles.updateInstallButton, installingUpdate && styles.updateButtonDisabled]}
                >
                  {installingUpdate ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="download-outline" size={17} color="#FFFFFF" />}
                  <Text style={styles.updateInstallButtonText}>{installButtonLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.menu}>
          <MenuRow icon="image-outline" title="프로필 사진" detail={busy ? '사진을 업로드하는 중입니다' : '가족과 친구에게 보이는 사진'} onPress={busy ? undefined : onPickAvatar} />
          <MenuRow icon="lock-closed-outline" title="로그인 세션" detail="기기 안에 안전하게 보관됩니다" />
          <MenuRow icon="server-outline" title="연결 서버" detail={serverLabel} onPress={onToggleServer} />
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" disabled={busy} onPress={onSignOut} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.coral} />
          <Text style={styles.signOutText}>로그아웃</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={devLogOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDevLogOpen(false)}
      >
        <View style={styles.devLogOverlay}>
          <View style={styles.devLogSheet}>
            <View style={styles.devLogHeader}>
              <Text style={styles.devLogTitle}>AI 전송 로그</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="AI 전송 로그 닫기"
                onPress={() => setDevLogOpen(false)}
                style={styles.devLogClose}
              >
                <Text style={styles.devLogCloseText}>닫기</Text>
              </Pressable>
            </View>
            <Text style={styles.devLogHint}>줄을 길게 눌러 선택하면 복사할 수 있어요. 오류 직후에 열면 원인이 기록되어 있어요.</Text>
            <FlatList
              data={devLogLines}
              keyExtractor={(item, index) => `${index}-${item.slice(0, 32)}`}
              renderItem={({ item }) => (
                <Text selectable style={styles.devLogLine}>{item}</Text>
              )}
              contentContainerStyle={styles.devLogListContent}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={photoViewerOpen && !!profile.avatarUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPhotoViewerOpen(false)}
      >
        <View style={styles.photoViewer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="프로필 사진 닫기"
            onPress={() => setPhotoViewerOpen(false)}
            style={styles.photoViewerBackdrop}
          />
          {profile.avatarUri ? (
            <Image source={{ uri: profile.avatarUri }} resizeMode="contain" style={styles.photoViewerImage} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="프로필 사진 닫기"
            onPress={() => setPhotoViewerOpen(false)}
            style={styles.photoViewerClose}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? title : undefined} style={styles.menuRow} onPress={onPress} disabled={!onPress}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={18} color={colors.tealDark} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDetail} numberOfLines={1}>{detail}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  profilePanel: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  avatarButton: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  photoViewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 12, 11, 0.96)',
  },
  photoViewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  photoViewerImage: {
    width: '100%',
    height: '82%',
  },
  photoViewerClose: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  status: {
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  debugTapHint: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '800',
    textAlign: 'right',
  },
  syncMessage: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '800',
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    minHeight: 78,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '800',
    marginTop: 4,
  },
  devCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#F0D9A8',
    backgroundColor: '#FFF8EA',
    gap: spacing.sm,
    ...shadow,
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  devBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bark,
  },
  devHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  devTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '900',
  },
  devSummary: {
    marginTop: 2,
    color: colors.inkSoft,
    fontSize: type.small,
    fontWeight: '700',
  },
  devOffButton: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F4C5BD',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  devOffButtonText: {
    color: colors.coral,
    fontSize: type.small,
    fontWeight: '900',
  },
  devMetaRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  devMetaLabel: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '700',
  },
  devMetaValue: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: type.small,
    fontWeight: '900',
    textAlign: 'right',
  },
  devActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  devActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  devActionButtonText: {
    color: colors.tealDark,
    fontSize: type.small,
    fontWeight: '900',
  },
  devActionButtonDanger: {
    color: colors.coral,
  },
  devLogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(23, 32, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  devLogSheet: {
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  devLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  devLogTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  devLogClose: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devLogCloseText: {
    color: colors.tealDark,
    fontSize: type.small,
    fontWeight: '900',
  },
  devLogHint: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    marginBottom: spacing.sm,
  },
  devLogLine: {
    color: colors.inkSoft,
    fontSize: type.tiny,
    lineHeight: 16,
    paddingVertical: 2,
  },
  devLogListContent: {
    paddingBottom: spacing.md,
  },
  updateCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    ...shadow,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  updateIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDF4EF',
  },
  updateHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  updateTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '900',
  },
  updateSummary: {
    marginTop: 3,
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 18,
    fontWeight: '700',
  },
  updateMetaRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  updateMetaLabel: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '700',
  },
  updateMetaValue: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: type.small,
    fontWeight: '900',
    textAlign: 'right',
  },
  updateNotes: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 18,
  },
  updateActions: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  updateCheckButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.tealDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  updateCheckButtonText: {
    color: colors.tealDark,
    fontSize: type.small,
    fontWeight: '900',
  },
  updateInstallButton: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealDark,
  },
  updateInstallButtonText: {
    color: '#FFFFFF',
    fontSize: type.small,
    fontWeight: '900',
  },
  updateButtonDisabled: {
    opacity: 0.55,
  },
  menu: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: '#DDF4EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '900',
  },
  menuDetail: {
    color: colors.inkMuted,
    fontSize: type.small,
    marginTop: 3,
  },
  signOut: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F4C5BD',
    backgroundColor: colors.surfaceWarm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  signOutText: {
    color: colors.coral,
    fontSize: type.body,
    fontWeight: '900',
  },
});
