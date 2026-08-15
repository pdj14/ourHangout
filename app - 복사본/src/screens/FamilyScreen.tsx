import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { FamilyLocation, Profile, Room, User } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');

type FamilyScreenProps = {
  profile: Profile;
  users: Record<string, User>;
  rooms: Room[];
  locations: FamilyLocation[];
  locationRoomId: string;
  locationLoading: boolean;
  locationActionKey: string;
  locationNotice: string;
  onToggleLocationConsent: () => void;
  onRefresh: () => void;
  onOpenRoom: (roomId: string) => void;
  onRefreshLocations: (roomId: string) => void;
  onRequestLocation: (roomId: string, userId: string) => void;
  onOpenLocationMap: (latitude: number, longitude: number) => void;
};

function formatLocationTime(value?: string): string {
  if (!value) return '아직 없음';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '최근 위치';
  const diffMin = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return new Date(timestamp).toLocaleDateString('ko-KR');
}

export function FamilyScreen({
  profile,
  users,
  rooms,
  locations,
  locationRoomId,
  locationLoading,
  locationActionKey,
  locationNotice,
  onToggleLocationConsent,
  onRefresh,
  onOpenRoom,
  onRefreshLocations,
  onRequestLocation,
  onOpenLocationMap,
}: FamilyScreenProps) {
  const family = Object.values(users).filter((user) => user.role === 'family');
  const familyRooms = rooms.filter((room) => room.type === 'family');
  const activeLocationRoomId = locationRoomId || familyRooms[0]?.id || '';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Family"
        title="가족"
        detail="가족 구성, 가족방, 위치 공유 상태를 한곳에서 확인해요."
        action={
          <Pressable style={styles.iconBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={21} color={colors.ink} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>우리 가족을 지키는 작은 숲</Text>
            <Text style={styles.heroText}>부모는 가족 연결과 위치 공유 상태를 확인하고, 아이는 가족과 안전하게 대화할 수 있어요.</Text>
          </View>
          <Image source={guardianMascot} resizeMode="contain" style={styles.heroMascot} />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <View style={styles.panelCopy}>
              <Text style={styles.panelTitle}>가족 구성</Text>
              <Text style={styles.panelSub}>가족 {family.length}명 · 가족방 {familyRooms.length}개</Text>
            </View>
            <View style={styles.familyMark}>
              <Ionicons name="shield-checkmark" size={19} color={colors.tealDark} />
            </View>
          </View>
          <View style={styles.memberGrid}>
            {family.length ? (
              family.map((member) => (
                <View key={member.id} style={styles.memberCard}>
                  <Avatar name={member.alias || member.name} color={member.color} uri={member.avatarUri} size={38} online={member.online} />
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.alias || member.name}
                    </Text>
                    <Text style={styles.memberDetail} numberOfLines={1}>
                      {member.relation || member.status || '가족'}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>아직 가족으로 연결된 사람이 없어요.</Text>
            )}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <View style={styles.panelCopy}>
              <Text style={styles.panelTitle}>가족방</Text>
              <Text style={styles.panelSub}>가족 구성과 위치 확인은 가족방 흐름과 연결돼요.</Text>
            </View>
          </View>
          <View style={styles.roomList}>
            {familyRooms.length ? (
              familyRooms.map((room) => (
                <Pressable key={room.id} style={styles.roomCard} onPress={() => onOpenRoom(room.id)}>
                  <View style={styles.roomIcon}>
                    <Ionicons name="home-outline" size={18} color={colors.tealDark} />
                  </View>
                  <View style={styles.roomCopy}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {room.title}
                    </Text>
                    <Text style={styles.memberDetail} numberOfLines={1}>
                      {room.memberIds.length}명 · {room.preview || '가족 대화를 시작해 보세요'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>가족방을 만들면 가족 대화와 위치 확인을 함께 관리할 수 있어요.</Text>
            )}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <View style={styles.panelCopy}>
              <Text style={styles.panelTitle}>위치 공유</Text>
              <Text style={styles.panelSub}>{locationNotice}</Text>
            </View>
            <Pressable
              onPress={onToggleLocationConsent}
              style={[styles.toggle, profile.locationSharingEnabled && styles.toggleOn]}
            >
              <View style={[styles.toggleKnob, profile.locationSharingEnabled && styles.toggleKnobOn]} />
            </Pressable>
          </View>
          <Text style={styles.locationHint}>
            위치 공유는 가족 기능이 켜진 방에서만 쓰이며, 기기 권한과 서버 동기화가 함께 필요해요.
          </Text>
        </View>
        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <View style={styles.panelCopy}>
              <Text style={styles.panelTitle}>자녀 위치 확인</Text>
              <Text style={styles.panelSub}>
                가족방 멤버의 최근 위치를 보고, 필요할 때 최신 위치를 요청할 수 있어요.
              </Text>
            </View>
            <Pressable
              style={styles.locationRefreshBtn}
              disabled={!activeLocationRoomId || locationLoading}
              onPress={() => activeLocationRoomId && onRefreshLocations(activeLocationRoomId)}
            >
              {locationLoading ? (
                <ActivityIndicator size="small" color={colors.tealDark} />
              ) : (
                <Ionicons name="locate-outline" size={18} color={colors.tealDark} />
              )}
            </Pressable>
          </View>

          {!familyRooms.length ? (
            <Text style={styles.emptyText}>가족방을 만들면 자녀 위치 확인을 연결할 수 있어요.</Text>
          ) : locations.length ? (
            <View style={styles.locationList}>
              {locations.map((location) => {
                const member = users[location.userId];
                const name = member?.alias || member?.name || location.name || '가족';
                const actionKey = `${activeLocationRoomId}:${location.userId}`;
                const checking = locationActionKey === actionKey;
                return (
                  <View key={location.userId} style={styles.locationCard}>
                    <View style={styles.locationIcon}>
                      <Ionicons name="location" size={18} color={colors.tealDark} />
                    </View>
                    <View style={styles.locationCopy}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.memberDetail} numberOfLines={1}>
                        {formatLocationTime(location.capturedAt)}
                        {location.accuracyM ? ` · 오차 ${Math.round(location.accuracyM)}m` : ''}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.locationAction}
                      onPress={() => onOpenLocationMap(location.latitude, location.longitude)}
                    >
                      <Ionicons name="map-outline" size={17} color={colors.inkSoft} />
                    </Pressable>
                    <Pressable
                      style={styles.locationActionPrimary}
                      disabled={!activeLocationRoomId || checking}
                      onPress={() => activeLocationRoomId && onRequestLocation(activeLocationRoomId, location.userId)}
                    >
                      {checking ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="refresh" size={16} color="#FFFFFF" />
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.locationEmpty}>
              <Image source={guardianMascot} resizeMode="contain" style={styles.locationMascot} />
              <Text style={styles.emptyText}>아직 저장된 가족 위치가 없어요. 위치 공유를 켠 뒤 새로고침해 주세요.</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  hero: {
    minHeight: 148,
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
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  heroText: {
    marginTop: spacing.sm,
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    fontWeight: '700',
  },
  heroMascot: {
    width: 116,
    height: 116,
    marginRight: -14,
  },
  panel: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.lg,
    ...shadow,
  },
  panelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  panelCopy: {
    flex: 1,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  panelSub: {
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  familyMark: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  memberGrid: {
    gap: spacing.sm,
  },
  memberCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  memberCopy: {
    flex: 1,
  },
  memberName: {
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '900',
  },
  memberDetail: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '700',
    marginTop: 3,
  },
  emptyText: {
    color: colors.inkMuted,
    fontSize: type.body,
    fontWeight: '800',
    lineHeight: 20,
  },
  roomList: {
    gap: spacing.sm,
  },
  roomCard: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  roomIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  roomCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggle: {
    width: 54,
    height: 30,
    borderRadius: 15,
    padding: 3,
    backgroundColor: colors.line,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: colors.teal,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  toggleKnobOn: {
    transform: [{ translateX: 24 }],
  },
  locationHint: {
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 18,
    fontWeight: '700',
  },
  locationRefreshBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  locationList: {
    gap: spacing.sm,
  },
  locationCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationAction: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  locationActionPrimary: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealDark,
  },
  locationEmpty: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationMascot: {
    width: 72,
    height: 72,
  },
});
