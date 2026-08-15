package com.ourhangout.browser

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.ourhangout.R

class BrowserForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_CANCEL) {
      sendBroadcast(Intent(ACTION_CANCELLED).setPackage(packageName))
      stopForegroundCompat()
      stopSelfResult(startId)
      return START_NOT_STICKY
    }
    startBrowserForeground()
    return START_NOT_STICKY
  }

  private fun startBrowserForeground() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "지킴이 웹 확인",
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "지킴이가 요청한 웹 정보를 확인하는 동안 표시됩니다."
          setShowBadge(false)
          setSound(null, null)
          enableVibration(false)
        }
      )
    }

    val cancelIntent = Intent(this, BrowserForegroundService::class.java).apply {
      action = ACTION_CANCEL
    }
    val cancelPendingIntent = PendingIntent.getService(
      this,
      0,
      cancelIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        1,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentTitle("지킴이가 웹에서 확인하고 있어요")
      .setContentText("답변에 필요한 공개 정보를 읽는 중입니다.")
      .addAction(0, "취소", cancelPendingIntent)
      .apply { if (contentIntent != null) setContentIntent(contentIntent) }
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  companion object {
    const val ACTION_START = "com.ourhangout.browser.START"
    const val ACTION_CANCEL = "com.ourhangout.browser.CANCEL"
    const val ACTION_CANCELLED = "com.ourhangout.browser.CANCELLED"
    private const val CHANNEL_ID = "ourhangout-browser-tool"
    private const val NOTIFICATION_ID = 32002
  }
}
