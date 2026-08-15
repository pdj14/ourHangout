import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { MessageBubble } from '../components/MessageBubble';
import { colors, radius, spacing, type } from '../theme';
import type { AttachmentDraft, Message, Room, User } from '../types';

type RoomScreenProps = {
  room: Room;
  users: Record<string, User>;
  currentUserId: string;
  messages: Message[];
  initialUnreadCount?: number;
  directReadCutoff?: number;
  draft: string;
  attachment: AttachmentDraft | null;
  loading: boolean;
  errorMessage?: string;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onBack: () => void;
  onRetryLoad: () => void;
  onSend: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onRemoveAttachment: () => void;
  onRetryAttachment?: () => void;
};

export function RoomScreen({
  room,
  users,
  currentUserId,
  messages,
  initialUnreadCount = 0,
  directReadCutoff = 0,
  draft,
  attachment,
  loading,
  errorMessage,
  sending,
  onDraftChange,
  onBack,
  onRetryLoad,
  onSend,
  onPickImage,
  onPickVideo,
  onRemoveAttachment,
  onRetryAttachment,
}: RoomScreenProps) {
  const listRef = useRef<FlatList<Message> | null>(null);
  const initialScrollDoneRef = useRef(false);
  const initialScrollGenerationRef = useRef(0);
  const initialScrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousRoomIdRef = useRef(room.id);
  const otherMembers = room.memberIds.map((id) => users[id]).filter((user) => user && user.id !== currentUserId);
  const peer = otherMembers[0];
  const roomColor = room.type === 'family' ? colors.teal : peer?.color || colors.blue;
  const canSend = (!!draft.trim() || !!attachment) && !sending && attachment?.status !== 'uploading';
  const showErrorBanner = !!errorMessage && !loading && messages.length > 0;

  const clearInitialScrollTimers = useCallback(() => {
    initialScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
    initialScrollTimersRef.current = [];
  }, []);

  const scrollToInitialPosition = useCallback((animated = false) => {
    const unreadCount = Math.max(0, Math.min(initialUnreadCount, messages.length));
    if (unreadCount > 0) {
      const firstUnreadIndex = Math.max(0, messages.length - unreadCount);
      listRef.current?.scrollToIndex({
        index: firstUnreadIndex,
        animated,
        viewPosition: 0.18,
      });
      return;
    }
    listRef.current?.scrollToEnd({ animated });
  }, [initialUnreadCount, messages.length]);

  const scheduleInitialScroll = useCallback(() => {
    if (initialScrollDoneRef.current || messages.length === 0) return;
    initialScrollDoneRef.current = true;
    initialScrollGenerationRef.current += 1;
    const generation = initialScrollGenerationRef.current;
    clearInitialScrollTimers();

    [0, 80, 180, 360, 700, 1200].forEach((delayMs) => {
      const timer = setTimeout(() => {
        if (initialScrollGenerationRef.current !== generation) return;
        scrollToInitialPosition(false);
      }, delayMs);
      initialScrollTimersRef.current.push(timer);
    });
  }, [clearInitialScrollTimers, messages.length, scrollToInitialPosition]);

  useEffect(() => {
    const roomChanged = previousRoomIdRef.current !== room.id;
    if (roomChanged) {
      initialScrollGenerationRef.current += 1;
      clearInitialScrollTimers();
      initialScrollDoneRef.current = false;
      previousRoomIdRef.current = room.id;
    }
    scheduleInitialScroll();
  }, [clearInitialScrollTimers, messages.length, room.id, scheduleInitialScroll]);

  const handleListReadyForScroll = useCallback(() => {
    scheduleInitialScroll();
  }, [scheduleInitialScroll]);

  useEffect(() => () => clearInitialScrollTimers(), [clearInitialScrollTimers]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Avatar
          name={room.type === 'direct' ? peer?.name || room.title : room.title}
          color={roomColor}
          uri={room.type === 'direct' ? peer?.avatarUri : undefined}
          size={38}
          online={otherMembers.some((user) => user.online)}
        />
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {room.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {room.memberIds.length}명 · {room.type === 'family' ? '가족방' : room.type === 'group' ? '그룹' : '1:1'}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" color={colors.tealDark} /> : null}
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
        onContentSizeChange={handleListReadyForScroll}
        onLayout={handleListReadyForScroll}
        onScrollToIndexFailed={(info) => {
          const offset = Math.max(0, info.averageItemLength * info.index);
          listRef.current?.scrollToOffset({ offset, animated: false });
          setTimeout(() => scrollToInitialPosition(false), 120);
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
            <MessageBubble
              message={item}
              sender={users[item.senderId]}
              mine={mine}
              roomIsGroup={room.type === 'group' || room.type === 'family'}
              directReadCutoff={directReadCutoff}
              showSender={!previous || previous.senderId !== item.senderId}
            />
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
          <Ionicons name={attachment.kind === 'image' ? 'image-outline' : 'videocam-outline'} size={18} color={colors.tealDark} />
          <View style={styles.attachmentCopy}>
            <Text style={styles.attachmentTitle}>{attachment.kind === 'image' ? '사진 첨부' : '영상 첨부'}</Text>
            <Text style={[styles.attachmentStatus, attachment.status === 'failed' && styles.attachmentStatusFailed]}>
              {attachment.status === 'uploading' ? '업로드 중' : attachment.status === 'failed' ? attachment.error || '업로드 실패' : '전송 대기'}
            </Text>
          </View>
          {attachment.status === 'failed' && onRetryAttachment ? (
            <Pressable onPress={onRetryAttachment} style={styles.attachmentAction}>
              <Ionicons name="refresh" size={18} color={colors.coral} />
            </Pressable>
          ) : null}
          <Pressable onPress={onRemoveAttachment} style={styles.attachmentAction}>
            <Ionicons name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable style={styles.attachBtn} onPress={onPickImage} disabled={sending}>
          <Ionicons name="image-outline" size={20} color={colors.inkSoft} />
        </Pressable>
        <Pressable style={styles.attachBtn} onPress={onPickVideo} disabled={sending}>
          <Ionicons name="videocam-outline" size={20} color={colors.inkSoft} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder="메시지 입력"
          placeholderTextColor={colors.inkMuted}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
        >
          {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
});
