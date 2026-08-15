import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { ChatKeyboardLayout } from '../components/ChatKeyboardLayout';
import { MessageBubble } from '../components/MessageBubble';
import { useChatKeyboard } from '../hooks/useChatKeyboard';
import { colors, radius, spacing, type } from '../theme';
import type { AttachmentDraft, Message, Room, User } from '../types';

type RoomScreenProps = {
  room: Room;
  users: Record<string, User>;
  currentUserId: string;
  messages: Message[];
  initialUnreadCount?: number;
  firstUnreadMessageId?: string;
  draft: string;
  attachment: AttachmentDraft | null;
  loading: boolean;
  errorMessage?: string;
  sending: boolean;
  retryingMessageId?: string;
  roomActionKey?: string;
  onDraftChange: (value: string) => void;
  onBack: () => void;
  onRetryLoad: () => void;
  onSend: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onRemoveAttachment: () => void;
  onRetryAttachment?: () => void;
  onRetryMessage?: (messageId: string) => void;
  onOpenProfile: (userId: string) => void;
  onToggleFavorite: () => void;
  onToggleMuted: () => void;
};

export function RoomScreen({
  room,
  users,
  currentUserId,
  messages,
  initialUnreadCount = 0,
  firstUnreadMessageId = '',
  draft,
  attachment,
  loading,
  errorMessage,
  sending,
  retryingMessageId = '',
  roomActionKey = '',
  onDraftChange,
  onBack,
  onRetryLoad,
  onSend,
  onPickImage,
  onPickVideo,
  onRemoveAttachment,
  onRetryAttachment,
  onRetryMessage,
  onOpenProfile,
  onToggleFavorite,
  onToggleMuted,
}: RoomScreenProps) {
  const listRef = useRef<FlatList<Message> | null>(null);
  const initialScrollDoneRef = useRef(false);
  const initialScrollGenerationRef = useRef(0);
  const initialScrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const initialScrollKeyRef = useRef('');
  const previousRoomIdRef = useRef(room.id);
  const isNearBottomRef = useRef(true);
  const lastContentHeightRef = useRef(0);
  const [selectedImageUri, setSelectedImageUri] = useState('');
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const otherMembers = room.memberIds.map((id) => users[id]).filter((user) => user && user.id !== currentUserId);
  const peer = otherMembers[0];
  const roomColor = room.type === 'family' ? colors.teal : peer?.color || colors.blue;
  const canSend = (!!draft.trim() || !!attachment) && !sending && attachment?.status !== 'uploading';
  const showErrorBanner = !!errorMessage && !loading && messages.length > 0;
  const unreadCount = Math.max(0, Math.min(initialUnreadCount, messages.length));
  const exactUnreadIndex = firstUnreadMessageId
    ? messages.findIndex((message) => message.id === firstUnreadMessageId)
    : -1;
  let fallbackUnreadIndex = -1;
  if (exactUnreadIndex < 0 && unreadCount > 0) {
    let remainingUnread = unreadCount;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || message.kind === 'system' || message.senderId === currentUserId) continue;
      remainingUnread -= 1;
      fallbackUnreadIndex = index;
      if (remainingUnread <= 0) break;
    }
  }
  const firstUnreadIndex = exactUnreadIndex >= 0 ? exactUnreadIndex : fallbackUnreadIndex;

  const clearInitialScrollTimers = useCallback(() => {
    initialScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
    initialScrollTimersRef.current = [];
  }, []);

  const {
    cancelScheduledScroll,
    handleComposerFocus,
    handleScroll: handleKeyboardAwareScroll,
    scrollToLatest,
  } = useChatKeyboard(listRef, { nearBottomRef: isNearBottomRef });

  const scrollToInitialPosition = useCallback((animated = false) => {
    if (firstUnreadIndex >= 0) {
      listRef.current?.scrollToIndex({
        index: firstUnreadIndex,
        animated,
        viewPosition: 0.12,
        viewOffset: 8,
      });
      return;
    }
    listRef.current?.scrollToEnd({ animated });
  }, [firstUnreadIndex]);

  const scheduleInitialScroll = useCallback(() => {
    if (initialScrollDoneRef.current || messages.length === 0) return;
    // Keep an in-progress initial positioning sequence stable when a realtime
    // message is appended. Restarting all timers for every count change causes
    // the list to jump repeatedly while the user is already looking at it.
    const scrollKey = `${room.id}:${firstUnreadMessageId || `unread:${unreadCount}`}`;
    if (initialScrollKeyRef.current === scrollKey) return;
    initialScrollKeyRef.current = scrollKey;
    initialScrollGenerationRef.current += 1;
    const generation = initialScrollGenerationRef.current;
    clearInitialScrollTimers();
    isNearBottomRef.current = firstUnreadIndex < 0;

    const delays = firstUnreadIndex >= 0 ? [0, 100, 260, 600] : [0, 80, 220];
    delays.forEach((delayMs, index) => {
      const timer = setTimeout(() => {
        if (initialScrollGenerationRef.current !== generation) return;
        scrollToInitialPosition(false);
        if (index === delays.length - 1) initialScrollDoneRef.current = true;
      }, delayMs);
      initialScrollTimersRef.current.push(timer);
    });
  }, [clearInitialScrollTimers, firstUnreadMessageId, messages.length, room.id, scrollToInitialPosition, unreadCount]);

  useEffect(() => {
    const roomChanged = previousRoomIdRef.current !== room.id;
    if (roomChanged) {
      initialScrollGenerationRef.current += 1;
      clearInitialScrollTimers();
      initialScrollDoneRef.current = false;
      initialScrollKeyRef.current = '';
      previousRoomIdRef.current = room.id;
      isNearBottomRef.current = firstUnreadIndex < 0;
      lastContentHeightRef.current = 0;
      cancelScheduledScroll();
      setShowRoomMenu(false);
      setSelectedImageUri('');
    }
    scheduleInitialScroll();
  }, [cancelScheduledScroll, clearInitialScrollTimers, firstUnreadIndex, messages.length, room.id, scheduleInitialScroll]);

  const handleListContentSizeChange = useCallback((_width: number, height: number) => {
    if (!initialScrollDoneRef.current) {
      lastContentHeightRef.current = height;
      scheduleInitialScroll();
      return;
    }
    if (lastContentHeightRef.current === height) return;
    lastContentHeightRef.current = height;
    if (isNearBottomRef.current) scrollToLatest(false);
  }, [scheduleInitialScroll, scrollToLatest]);

  const handleScrollBeginDrag = useCallback(() => {
    initialScrollGenerationRef.current += 1;
    clearInitialScrollTimers();
    cancelScheduledScroll();
    initialScrollDoneRef.current = true;
  }, [cancelScheduledScroll, clearInitialScrollTimers]);

  const handleListLayout = useCallback(() => {
    if (!initialScrollDoneRef.current) {
      scheduleInitialScroll();
      return;
    }
    if (isNearBottomRef.current) scrollToLatest(false);
  }, [scheduleInitialScroll, scrollToLatest]);

  const handleOpenMedia = useCallback((message: Message) => {
    if (message.kind === 'image' && message.uri) setSelectedImageUri(message.uri);
  }, []);

  useEffect(
    () => () => {
      clearInitialScrollTimers();
      cancelScheduledScroll();
    },
    [cancelScheduledScroll, clearInitialScrollTimers]
  );

  return (
    <ChatKeyboardLayout style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="대화방 나가기" onPress={onBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Pressable
          accessibilityRole={room.type === 'direct' && peer ? 'button' : undefined}
          accessibilityLabel={room.type === 'direct' && peer ? `${peer.alias || peer.name} 프로필 보기` : undefined}
          disabled={room.type !== 'direct' || !peer}
          onPress={() => peer && onOpenProfile(peer.id)}
          style={styles.headerAvatarButton}
        >
          <Avatar
            name={room.type === 'direct' ? peer?.alias || peer?.name || room.title : room.title}
            color={roomColor}
            uri={room.type === 'direct' ? peer?.avatarUri : undefined}
            size={38}
            online={otherMembers.some((user) => user.online)}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {room.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {room.memberIds.length}명 · {room.type === 'family' ? '가족방' : room.type === 'group' ? '그룹' : '1:1'}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" color={colors.tealDark} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대화방 설정"
          onPress={() => setShowRoomMenu(true)}
          style={styles.headerMenuButton}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>

      {room.type === 'family' ? (
        <View style={styles.familyStrip}>
          <Ionicons name="shield-checkmark" size={16} color={colors.tealDark} />
          <Text style={styles.familyText} numberOfLines={1}>
            {room.familySignal || '가족 기능 사용 가능'}
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.messageList}
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={handleListContentSizeChange}
        onLayout={handleListLayout}
        onScroll={handleKeyboardAwareScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        scrollEventThrottle={32}
        onScrollToIndexFailed={(info) => {
          const offset = Math.max(0, info.averageItemLength * Math.max(0, info.index - 1));
          listRef.current?.scrollToOffset({ offset, animated: false });
          const timer = setTimeout(() => scrollToInitialPosition(false), 120);
          initialScrollTimersRef.current.push(timer);
        }}
        initialNumToRender={20}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          showErrorBanner ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorCopy}>
                <Text style={styles.errorTitle}>최근 메시지를 새로 불러오지 못했어요.</Text>
                <Text style={styles.errorText} numberOfLines={2}>
                  {errorMessage}
                </Text>
              </View>
              <Pressable style={styles.errorRetry} onPress={onRetryLoad}>
                <Ionicons name="refresh" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const mine = item.senderId === currentUserId;
          const previous = messages[index - 1];
          return (
            <>
              {index === firstUnreadIndex ? (
                <View style={styles.unreadDivider}>
                  <View style={styles.unreadLine} />
                  <Text style={styles.unreadLabel}>여기부터 읽지 않은 메시지 {unreadCount}개</Text>
                  <View style={styles.unreadLine} />
                </View>
              ) : null}
              <MessageBubble
                message={item}
                sender={users[item.senderId]}
                mine={mine}
                roomIsGroup={room.type === 'group' || room.type === 'family'}
                showSender={!previous || previous.senderId !== item.senderId}
                retrying={retryingMessageId === item.id}
                onRetry={onRetryMessage}
                onOpenMedia={handleOpenMedia}
                onOpenProfile={onOpenProfile}
              />
            </>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            {errorMessage && !loading ? (
              <>
                <Text style={styles.emptyTitle}>메시지를 불러오지 못했습니다.</Text>
                <Text style={styles.emptyText}>{errorMessage}</Text>
                <Pressable style={styles.retryBtn} onPress={onRetryLoad}>
                  <Ionicons name="refresh" size={16} color="#FFFFFF" />
                  <Text style={styles.retryText}>다시 시도</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.emptyText}>{loading ? '메시지를 불러오는 중입니다.' : '아직 메시지가 없습니다.'}</Text>
            )}
          </View>
        }
      />

      {attachment ? (
        <View style={[styles.attachment, attachment.status === 'failed' && styles.attachmentFailed]}>
          {attachment.kind === 'image' ? (
            <Image source={{ uri: attachment.uri }} resizeMode="cover" style={styles.attachmentPreview} />
          ) : (
            <View style={styles.attachmentPreviewFallback}>
              <Ionicons name="videocam-outline" size={18} color={colors.tealDark} />
            </View>
          )}
          <View style={styles.attachmentCopy}>
            <Text style={styles.attachmentTitle}>{attachment.kind === 'image' ? '사진 첨부' : '영상 첨부'}</Text>
            <Text style={[styles.attachmentStatus, attachment.status === 'failed' && styles.attachmentStatusFailed]}>
              {attachment.status === 'uploading' ? '업로드 중' : attachment.status === 'failed' ? attachment.error || '업로드 실패' : '전송 대기'}
            </Text>
          </View>
          {attachment.status === 'failed' && onRetryAttachment ? (
            <Pressable accessibilityRole="button" accessibilityLabel="첨부 다시 보내기" onPress={onRetryAttachment} style={styles.attachmentAction}>
              <Ionicons name="refresh" size={18} color={colors.coral} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="첨부 삭제" onPress={onRemoveAttachment} style={styles.attachmentAction}>
            <Ionicons name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable accessibilityRole="button" accessibilityLabel="사진 첨부" style={styles.attachBtn} onPress={onPickImage} disabled={sending}>
          <Ionicons name="image-outline" size={20} color={colors.inkSoft} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="영상 첨부" style={styles.attachBtn} onPress={onPickVideo} disabled={sending}>
          <Ionicons name="videocam-outline" size={20} color={colors.inkSoft} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder="메시지 입력"
          placeholderTextColor={colors.inkMuted}
          multiline
          onFocus={handleComposerFocus}
          accessibilityLabel="메시지 입력"
          style={styles.input}
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="메시지 보내기"
          style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
        >
          {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
        </Pressable>
      </View>

      <Modal
        visible={!!selectedImageUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedImageUri('')}
      >
        <View style={styles.viewer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이미지 닫기"
            onPress={() => setSelectedImageUri('')}
            style={styles.viewerClose}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} resizeMode="contain" style={styles.viewerImage} />
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={showRoomMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRoomMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowRoomMenu(false)}>
          <View style={styles.roomMenu}>
            <View style={styles.roomMenuHeader}>
              <Text style={styles.roomMenuTitle}>대화방 설정</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="대화방 설정 닫기" onPress={() => setShowRoomMenu(false)} style={styles.roomMenuClose}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={room.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              disabled={!!roomActionKey}
              onPress={onToggleFavorite}
              style={styles.roomMenuRow}
            >
              {roomActionKey === `favorite:${room.id}` ? (
                <ActivityIndicator size="small" color={colors.amber} />
              ) : (
                <Ionicons name={room.favorite ? 'star' : 'star-outline'} size={20} color={colors.amber} />
              )}
              <Text style={styles.roomMenuRowText}>{room.favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={room.muted ? '알림 켜기' : '알림 끄기'}
              disabled={!!roomActionKey}
              onPress={onToggleMuted}
              style={styles.roomMenuRow}
            >
              {roomActionKey === `muted:${room.id}` ? (
                <ActivityIndicator size="small" color={colors.tealDark} />
              ) : (
                <Ionicons name={room.muted ? 'notifications-outline' : 'notifications-off-outline'} size={20} color={colors.tealDark} />
              )}
              <Text style={styles.roomMenuRowText}>{room.muted ? '메시지 알림 켜기' : '메시지 알림 끄기'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ChatKeyboardLayout>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerAvatarButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMenuButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  title: {
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    fontWeight: '700',
    marginTop: 3,
  },
  familyStrip: {
    height: 38,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#DDF4EF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  familyText: {
    flex: 1,
    color: colors.tealDark,
    fontSize: type.small,
    fontWeight: '800',
  },
  messages: {
    flexGrow: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageList: {
    flex: 1,
  },
  unreadDivider: {
    minHeight: 32,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.coral,
    opacity: 0.55,
  },
  unreadLabel: {
    color: colors.coral,
    fontSize: type.tiny,
    fontWeight: '800',
  },
  errorBanner: {
    minHeight: 68,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#F4C5BD',
    backgroundColor: colors.surfaceWarm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  errorCopy: {
    flex: 1,
    minWidth: 0,
  },
  errorTitle: {
    color: colors.ink,
    fontSize: type.small,
    fontWeight: '900',
  },
  errorText: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  errorRetry: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.tealDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '900',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.inkMuted,
    fontSize: type.body,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  retryBtn: {
    height: 40,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: type.small,
    fontWeight: '900',
  },
  attachment: {
    minHeight: 58,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  attachmentFailed: {
    borderColor: '#F4C5BD',
    backgroundColor: colors.surfaceWarm,
  },
  attachmentCopy: {
    flex: 1,
  },
  attachmentPreview: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
  },
  attachmentPreviewFallback: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  attachmentTitle: {
    color: colors.ink,
    fontSize: type.small,
    fontWeight: '900',
  },
  attachmentStatus: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    fontWeight: '700',
    marginTop: 2,
  },
  attachmentStatusFailed: {
    color: colors.coral,
  },
  attachmentAction: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: type.body,
    lineHeight: 20,
    fontWeight: '700',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealDark,
  },
  sendBtnOff: {
    backgroundColor: colors.inkMuted,
  },
  viewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 14, 12, 0.96)',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    zIndex: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(9, 14, 12, 0.42)',
  },
  roomMenu: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 32,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.surface,
  },
  roomMenuHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  roomMenuTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '900',
  },
  roomMenuClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomMenuRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  roomMenuRowText: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '800',
  },
});
