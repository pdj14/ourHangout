import { StyleSheet, Text, View } from 'react-native';
import type { HideoutInteractiveTarget, HideoutLocale } from './types';

type HideoutPanelContentProps = {
  locale: HideoutLocale;
  target: HideoutInteractiveTarget;
};

const HIDEOUT = {
  text: '#223748',
  textSoft: 'rgba(56, 73, 89, 0.82)',
  textMuted: 'rgba(97, 111, 121, 0.82)',
  border: 'rgba(172, 179, 193, 0.32)',
  card: 'rgba(255,255,255,0.78)',
  accent: '#E9B264',
  accentSoft: 'rgba(233,178,100,0.16)',
  blueSoft: 'rgba(111,143,179,0.14)',
  greenSoft: 'rgba(143,178,124,0.14)',
  roseSoft: 'rgba(229,143,143,0.14)',
};

const weekdayLabels = (locale: HideoutLocale) =>
  locale === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const upcomingItems = (locale: HideoutLocale) =>
  locale === 'ko'
    ? ['4월 16일 치과 예약', '4월 19일 가족 외식', '4월 24일 반 친구 생일']
    : ['Apr 16 Dentist appointment', 'Apr 19 Family dinner', 'Apr 24 Class friend birthday'];

const timetableItems = (locale: HideoutLocale) =>
  locale === 'ko'
    ? [
        ['08:30', '1교시 수학'],
        ['10:10', '3교시 과학'],
        ['15:00', '피아노 학원'],
        ['20:00', '취침 준비'],
      ]
    : [
        ['08:30', '1st period math'],
        ['10:10', '3rd period science'],
        ['15:00', 'Piano lesson'],
        ['20:00', 'Bedtime routine'],
      ];

const todoItems = (locale: HideoutLocale) =>
  locale === 'ko'
    ? [
        ['done', '숙제 확인'],
        ['todo', '물통 챙기기'],
        ['todo', '독서 20분'],
      ]
    : [
        ['done', 'Check homework'],
        ['todo', 'Pack water bottle'],
        ['todo', 'Read for 20 minutes'],
      ];

const musicItems = (locale: HideoutLocale) =>
  locale === 'ko'
    ? ['잔잔한 피아노', '비 오는 날 배경음', '좋아하는 밤 노래']
    : ['Soft piano', 'Rainy-day ambient', 'Favorite night song'];

export function HideoutPanelContent({ locale, target }: HideoutPanelContentProps) {
  if (target === 'calendar') {
    return (
      <View style={styles.wrap}>
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarMonth}>{locale === 'ko' ? '2026년 4월' : 'April 2026'}</Text>
        </View>
        <View style={styles.weekRow}>
          {weekdayLabels(locale).map((label) => (
            <Text key={label} style={styles.weekLabel}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {Array.from({ length: 28 }, (_, index) => {
            const day = index + 1;
            const marked = day === 16 || day === 19 || day === 24;
            return (
              <View key={day} style={[styles.dayCell, marked && styles.dayCellMarked]}>
                <Text style={[styles.dayText, marked && styles.dayTextMarked]}>{day}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.listWrap}>
          {upcomingItems(locale).map((line) => (
            <View key={line} style={styles.listRow}>
              <View style={styles.dot} />
              <Text style={styles.listText}>{line}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (target === 'timetable') {
    return (
      <View style={styles.wrap}>
        {timetableItems(locale).map(([time, title]) => (
          <View key={`${time}-${title}`} style={styles.timelineRow}>
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeText}>{time}</Text>
            </View>
            <View style={styles.timelineCard}>
              <Text style={styles.timelineText}>{title}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (target === 'todo') {
    return (
      <View style={styles.wrap}>
        {todoItems(locale).map(([state, title]) => (
          <View key={`${state}-${title}`} style={styles.todoRow}>
            <View style={[styles.todoDot, state === 'done' && styles.todoDotDone]} />
            <Text style={[styles.todoText, state === 'done' && styles.todoTextDone]}>{title}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (target === 'album') {
    return (
      <View style={styles.wrap}>
        <View style={styles.albumGrid}>
          <View style={[styles.albumCard, { backgroundColor: HIDEOUT.blueSoft }]} />
          <View style={[styles.albumCard, { backgroundColor: HIDEOUT.roseSoft }]} />
          <View style={[styles.albumCard, { backgroundColor: HIDEOUT.greenSoft }]} />
          <View style={[styles.albumCard, { backgroundColor: HIDEOUT.accentSoft }]} />
        </View>
        <Text style={styles.albumCaption}>
          {locale === 'ko' ? '봄 소풍 사진 12장과 오늘의 하늘 사진이 있어요.' : '12 spring outing photos and a new sky photo are saved here.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.playerCard}>
        <View style={styles.playerDisc} />
        <View style={styles.playerBar} />
      </View>
      <View style={styles.listWrap}>
        {musicItems(locale).map((line) => (
          <View key={line} style={styles.listRow}>
            <View style={styles.dot} />
            <Text style={styles.listText}>{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  calendarHeader: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: HIDEOUT.accentSoft,
  },
  calendarMonth: {
    color: HIDEOUT.text,
    fontSize: 20,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekLabel: {
    width: 36,
    color: HIDEOUT.textMuted,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HIDEOUT.card,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  dayCellMarked: {
    backgroundColor: '#FFF5E6',
    borderColor: 'rgba(233,178,100,0.34)',
  },
  dayText: {
    color: HIDEOUT.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  dayTextMarked: {
    color: '#8D6545',
  },
  listWrap: {
    gap: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HIDEOUT.accent,
  },
  listText: {
    flex: 1,
    color: HIDEOUT.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeBadge: {
    width: 68,
    borderRadius: 14,
    paddingVertical: 10,
    backgroundColor: HIDEOUT.blueSoft,
  },
  timeBadgeText: {
    color: HIDEOUT.text,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: HIDEOUT.card,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  timelineText: {
    color: HIDEOUT.text,
    fontSize: 14,
    fontWeight: '700',
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  todoDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(140, 153, 164, 0.42)',
    backgroundColor: '#FFFFFF',
  },
  todoDotDone: {
    backgroundColor: HIDEOUT.accent,
    borderColor: HIDEOUT.accent,
  },
  todoText: {
    color: HIDEOUT.text,
    fontSize: 15,
    fontWeight: '700',
  },
  todoTextDone: {
    color: HIDEOUT.textMuted,
    textDecorationLine: 'line-through',
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  albumCard: {
    width: 122,
    height: 94,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
  },
  albumCaption: {
    color: HIDEOUT.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  playerCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: HIDEOUT.card,
    borderWidth: 1,
    borderColor: HIDEOUT.border,
    alignItems: 'center',
    gap: 12,
  },
  playerDisc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: HIDEOUT.accentSoft,
    borderWidth: 6,
    borderColor: '#E8BE7E',
  },
  playerBar: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: HIDEOUT.blueSoft,
  },
});
