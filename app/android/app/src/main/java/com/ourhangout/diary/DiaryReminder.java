package com.ourhangout.diary;
import com.ourhangout.R;

import android.app.*;
import android.content.*;
import android.os.Build;
import java.util.Calendar;

/** Daily, inexact reminder: no diary contents are copied into notifications. */
public final class DiaryReminder extends BroadcastReceiver {
    static final String PREFS="diary-tools", CHANNEL="diary-writing", ACTION_REMIND="com.ourhangout.diary.action.REMIND";
    static void schedule(Context context) {
        SharedPreferences p=context.getApplicationContext().getSharedPreferences(PREFS,0);
        AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent legacy=PendingIntent.getBroadcast(context,41,new Intent(context,DiaryReminder.class),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
        if(legacy!=null){manager.cancel(legacy);legacy.cancel();}
        PendingIntent pending=PendingIntent.getBroadcast(context,41,new Intent(context,DiaryReminder.class).setAction(ACTION_REMIND),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        manager.cancel(pending);
        if(!p.getBoolean("reminder",false))return;
        Calendar next=Calendar.getInstance(); next.set(Calendar.HOUR_OF_DAY,p.getInt("hour",21)); next.set(Calendar.MINUTE,p.getInt("minute",0)); next.set(Calendar.SECOND,0); next.set(Calendar.MILLISECOND,0);
        if(next.getTimeInMillis()<=System.currentTimeMillis())next.add(Calendar.DAY_OF_YEAR,1);
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pending);
    }
    @Override public void onReceive(Context c, Intent intent) {
        if((intent.getAction()==null || ACTION_REMIND.equals(intent.getAction())) && c.getSharedPreferences(PREFS,0).getBoolean("reminder",false)) {
            NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,"일기 쓰기 알림",NotificationManager.IMPORTANCE_DEFAULT));
            PendingIntent open=PendingIntent.getActivity(c,42,new Intent(c,com.ourhangout.MainActivity.class).setAction(Intent.ACTION_VIEW).setData(android.net.Uri.parse("ourhangout://diary")).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            try { manager.notify(41,new Notification.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("오늘의 이야기를 남겨볼까요?").setContentText("작은 순간도 소중한 기록이 돼요.").setContentIntent(open).setAutoCancel(true).build()); }catch(SecurityException ignored){}
        }
        schedule(c);
    }
}
