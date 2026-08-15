import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { FriendRequestView, User } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');

type PeopleScreenProps = {
  users: Record<string, User>;
  currentUserId: string;
  requests: FriendRequestView[];
  loading: boolean;
  onRefresh: () => void;
  onOpenPerson: (userId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
};

export function PeopleScreen({
  users,
  currentUserId,
  requests,
  loading,
  onRefresh,
  onOpenPerson,
  onAcceptRequest,
  onRejectRequest,
}: PeopleScreenProps) {
  const people = Object.values(users).filter((user) => user.id !== currentUserId);
  const family = people.filter((user) => user.role === 'family');
  const friends = people.filter((user) => user.role === 'friend');
  const sortedPeople = [...family, ...friends];
  const incomingRequests = requests.filter((request) => request.direction === 'incoming' && request.status === 'pending');

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="People"
        title="사람"
        detail={`가족 ${family.length}명 · 친구 ${friends.length}명`}
        action={
          <Pressable style={styles.iconBtn} onPress={onRefresh}>
            <Ionicons name={loading ? 'sync' : 'refresh'} size={21} color={colors.ink} />
          </Pressable>
        }
      />
      <FlatList
        data={sortedPeople}
        keyExtractor={(user) => user.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <View style={styles.familyCard}>
              <View style={styles.familyCopy}>
                <Text style={styles.familyTitle}>우리 가족 숲</Text>
                <Text style={styles.familyText}>가까운 사람들과 바로 이야기하고, 가족은 가족 탭에서 더 자세히 볼 수 있어요.</Text>
              </View>
              <Image source={guardianMascot} resizeMode="contain" style={styles.mascot} />
            </View>
            {incomingRequests.length ? (
              <View style={styles.requestGroup}>
                {incomingRequests.map((request) => (
                  <View key={request.id} style={styles.requestCard}>
                    <Avatar name={request.name} color={colors.coral} uri={request.avatarUri} size={38} />
                    <View style={styles.requestCopy}>
                      <Text style={styles.requestTitle}>{request.name}</Text>
                      <Text style={styles.requestText}>친구 요청을 보냈어요.</Text>
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable style={styles.miniBtn} onPress={() => onAcceptRequest(request.id)}>
                        <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                      </Pressable>
                      <Pressable style={[styles.miniBtn, styles.miniBtnLight]} onPress={() => onRejectRequest(request.id)}>
                        <Ionicons name="close" size={17} color={colors.inkSoft} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const sectionStart = index === 0 || sortedPeople[index - 1]?.role !== item.role;
          return (
            <View>
              {sectionStart ? (
                <Text style={styles.section}>{item.role === 'family' ? '가족' : '친구'}</Text>
              ) : null}
              <View style={styles.personCard}>
                <Avatar name={item.alias || item.name} color={item.color} uri={item.avatarUri} online={item.online} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {item.alias ? `${item.alias} · ${item.name}` : item.name}
                  </Text>
                  <Text style={styles.personStatus} numberOfLines={1}>
                    {item.relation ? `${item.relation} · ${item.status || '상태 메시지 없음'}` : item.status || '상태 메시지 없음'}
                  </Text>
                </View>
                <Pressable style={styles.iconSmall} onPress={() => onOpenPerson(item.id)}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.tealDark} />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image source={guardianMascot} resizeMode="contain" style={styles.emptyMascot} />
            <Text style={styles.emptyTitle}>아직 보이는 사람이 없어요</Text>
            <Text style={styles.emptyText}>친구를 추가하거나 가족방에 초대되면 이곳에 나타나요.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  headerStack: {
    gap: spacing.md,
  },
  familyCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow,
  },
  familyCopy: {
    flex: 1,
    minWidth: 0,
  },
  familyTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  familyText: {
    marginTop: spacing.sm,
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    fontWeight: '700',
  },
  mascot: {
    width: 104,
    height: 104,
    marginRight: -12,
  },
  requestGroup: {
    gap: spacing.sm,
  },
  requestCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E8C2AF',
    backgroundColor: colors.surface,
  },
  requestCopy: {
    flex: 1,
  },
  requestTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '900',
    marginBottom: 3,
  },
  requestText: {
    color: colors.coral,
    fontSize: type.small,
    fontWeight: '800',
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  miniBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  miniBtnLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  section: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    fontWeight: '900',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  personCard: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '900',
  },
  personStatus: {
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 17,
    marginTop: 5,
  },
  iconSmall: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  empty: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  emptyMascot: {
    width: 92,
    height: 92,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
