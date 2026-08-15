import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { Profile, Room } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');

type ProfileScreenProps = {
  profile: Profile;
  rooms: Room[];
  backendBaseUrl: string;
  syncMessage: string;
  onPickAvatar: () => void;
  onSignOut: () => void;
};

export function ProfileScreen({
  profile,
  rooms,
  backendBaseUrl,
  syncMessage,
  onPickAvatar,
  onSignOut,
}: ProfileScreenProps) {
  const familyRooms = rooms.filter((room) => room.type === 'family').length;
  const unreadTotal = rooms.reduce((sum, room) => sum + room.unread, 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Account" title="프로필" detail="가족 계정, 사진, 연결 상태" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profilePanel}>
          <Pressable onPress={onPickAvatar} style={styles.avatarButton}>
            <Avatar name={profile.name} color={profile.color} uri={profile.avatarUri} size={68} online />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={15} color="#FFFFFF" />
            </View>
          </Pressable>
          <View style={styles.profileCopy}>
            <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
            <Text style={styles.status} numberOfLines={2}>
              {profile.status || profile.email || '가족에게 보여줄 한마디를 남겨보세요.'}
            </Text>
          </View>
        </View>

        <View style={styles.guardianPanel}>
          <View style={styles.guardianCopy}>
            <Text style={styles.guardianTitle}>작은 숲 지킴이와 함께</Text>
            <Text style={styles.guardianText}>부모와 아이가 같은 앱에서 대화하고, 가족 탭에서 필요한 연결을 확인해요.</Text>
          </View>
          <Image source={guardianMascot} resizeMode="contain" style={styles.guardianImage} />
        </View>

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

        <View style={styles.menu}>
          <MenuRow icon="image-outline" title="프로필 사진" detail="가족과 친구에게 보이는 사진" onPress={onPickAvatar} />
          <MenuRow icon="lock-closed-outline" title="로그인 세션" detail="기기 안에 안전하게 보관됩니다" />
          <MenuRow icon="server-outline" title="연결 서버" detail={backendBaseUrl} />
        </View>

        <Pressable onPress={onSignOut} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.coral} />
          <Text style={styles.signOutText}>로그아웃</Text>
        </Pressable>
      </ScrollView>
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
    <Pressable style={styles.menuRow} onPress={onPress} disabled={!onPress}>
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
  guardianPanel: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow,
  },
  guardianCopy: {
    flex: 1,
    minWidth: 0,
  },
  guardianTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  guardianText: {
    marginTop: spacing.sm,
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    fontWeight: '700',
  },
  guardianImage: {
    width: 94,
    height: 94,
    marginRight: -8,
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
