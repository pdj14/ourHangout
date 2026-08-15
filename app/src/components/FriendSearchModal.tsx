import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { colors, radius, spacing, type } from '../theme';
import type { FriendRequestView, FriendSearchResult } from '../types';

type FriendSearchModalProps = {
  visible: boolean;
  query: string;
  results: FriendSearchResult[];
  requests: FriendRequestView[];
  message: string;
  searching: boolean;
  actionKey: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSendRequest: (userId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onClose: () => void;
};

export function FriendSearchModal({
  visible,
  query,
  results,
  requests,
  message,
  searching,
  actionKey,
  onQueryChange,
  onSearch,
  onSendRequest,
  onAcceptRequest,
  onClose,
}: FriendSearchModalProps) {
  const incomingByUserId = useMemo(
    () => new Map(
      requests
        .filter((request) => request.direction === 'incoming' && request.status === 'pending')
        .map((request) => [request.userId, request])
    ),
    [requests]
  );
  const outgoingUserIds = useMemo(
    () => new Set(
      requests
        .filter((request) => request.direction === 'outgoing' && request.status === 'pending')
        .map((request) => request.userId)
    ),
    [requests]
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>친구 추가</Text>
              <Text style={styles.detail}>이메일로 정확히 검색합니다.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="친구 추가 닫기" onPress={onClose} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <Ionicons name="mail-outline" size={18} color={colors.inkMuted} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={onQueryChange}
                onSubmitEditing={onSearch}
                accessibilityLabel="친구 이메일 검색"
                placeholder="email@example.com"
                placeholderTextColor={colors.inkMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.input}
              />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="이메일 지우기" onPress={() => onQueryChange('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="친구 검색"
              disabled={!query.trim() || searching}
              onPress={onSearch}
              style={[styles.searchButton, (!query.trim() || searching) && styles.disabled]}
            >
              {searching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="search" size={19} color="#FFFFFF" />}
            </Pressable>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const incoming = incomingByUserId.get(item.id);
              const pending = item.outgoingPending || item.incomingPending || outgoingUserIds.has(item.id);
              const busy = !!actionKey;
              const currentAction =
                actionKey === `send:${item.id}` ||
                (!!incoming && actionKey === `accept:${incoming.id}`);
              const label = item.isFriend ? '친구' : incoming ? '수락' : pending ? '요청 중' : '요청 보내기';
              const disabled = item.isFriend || (!incoming && pending) || busy;
              return (
                <View style={styles.resultRow}>
                  <Avatar name={item.name} color={colors.blue} uri={item.avatarUri} size={44} />
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.resultDetail} numberOfLines={1}>{item.status || item.email}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name} ${label}`}
                    disabled={disabled}
                    onPress={() => incoming ? onAcceptRequest(incoming.id) : onSendRequest(item.id)}
                    style={[styles.actionButton, disabled && styles.actionDisabled]}
                  >
                    {currentAction ? <ActivityIndicator size="small" color={colors.tealDark} /> : <Text style={styles.actionText}>{label}</Text>}
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={
              !searching && !message ? (
                <View style={styles.empty}>
                  <Ionicons name="person-add-outline" size={28} color={colors.inkMuted} />
                  <Text style={styles.emptyText}>추가할 사람의 이메일을 검색해 주세요.</Text>
                </View>
              ) : null
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  detail: { marginTop: 3, color: colors.inkMuted, fontSize: type.small },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  searchRow: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchField: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  input: { flex: 1, color: colors.ink, fontSize: type.body, paddingVertical: 0 },
  clearButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealDark,
  },
  disabled: { opacity: 0.45 },
  message: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.inkSoft,
    fontSize: type.small,
    fontWeight: '700',
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  resultRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultCopy: { flex: 1, minWidth: 0 },
  resultName: { color: colors.ink, fontSize: type.section, fontWeight: '800' },
  resultDetail: { marginTop: 3, color: colors.inkMuted, fontSize: type.small },
  actionButton: {
    minWidth: 74,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  actionDisabled: { opacity: 0.58 },
  actionText: { color: colors.tealDark, fontSize: type.small, fontWeight: '800' },
  empty: { paddingVertical: 64, alignItems: 'center', gap: spacing.md },
  emptyText: { color: colors.inkMuted, fontSize: type.body, textAlign: 'center' },
});
