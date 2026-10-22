package com.ourhangout

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.ourhangout.location.LocationCaptureService

class OurFirebaseMessagingService : FirebaseMessagingService() {
  override fun onCreate() {
    super.onCreate()
    FirebaseApp.initializeApp(applicationContext)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    val locationAction = data["locationAction"]?.trim().orEmpty()
    val requestToken = data["requestToken"]?.trim().orEmpty()
    val backendBaseUrl = data["backendBaseUrl"]?.trim()?.trimEnd('/').orEmpty()

    if (locationAction == "refresh" && requestToken.isNotEmpty() && backendBaseUrl.isNotEmpty()) {
      val intent = Intent(this, LocationCaptureService::class.java).apply {
        action = LocationCaptureService.ACTION_START
        putExtra(LocationCaptureService.EXTRA_BASE_URL, backendBaseUrl)
        putExtra(LocationCaptureService.EXTRA_REQUEST_TOKEN, requestToken)
        putExtra(LocationCaptureService.EXTRA_SOURCE, "precision_refresh")
        putExtra(LocationCaptureService.EXTRA_PRECISE, true)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(this, intent)
      } else {
        startService(intent)
      }
      return
    }

    showMessageNotification(remoteMessage)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    Log.i(LOG_TAG, "FCM token refreshed")
  }

  private fun showMessageNotification(remoteMessage: RemoteMessage) {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val data = remoteMessage.data
    val notification = remoteMessage.notification
    val title = firstNonBlank(
      notification?.title,
      data["title"],
      data["notificationTitle"],
      "우리들의 아지트"
    )
    val body = firstNonBlank(
      notification?.body,
      data["body"],
      data["message"],
      data["text"],
      "New message"
    )
    if (title.isEmpty() && body.isEmpty()) return

    ensureMessageChannel()

    val roomId = data["roomId"]?.trim().orEmpty()
    val launchIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      if (roomId.isNotEmpty()) {
        putExtra("roomId", roomId)
        this.data = Uri.parse("ourhangout://room/${Uri.encode(roomId)}")
      }
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val requestCode = if (roomId.isNotEmpty()) roomId.hashCode() else remoteMessage.messageId?.hashCode() ?: 0
    val pendingIntent = PendingIntent.getActivity(this, requestCode, launchIntent, flags)

    val notificationId = if (roomId.isNotEmpty()) roomId.hashCode() else (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
    val builtNotification = NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setColor(ContextCompat.getColor(this, R.color.notification_icon_color))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .build()

    NotificationManagerCompat.from(this).notify(notificationId, builtNotification)
  }

  private fun ensureMessageChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      MESSAGE_CHANNEL_ID,
      "Messages",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "우리들의 아지트 메시지 알림"
      enableVibration(true)
    }
    manager.createNotificationChannel(channel)
  }

  private fun firstNonBlank(vararg values: String?): String {
    return values.firstOrNull { !it.isNullOrBlank() }?.trim().orEmpty()
  }

  companion object {
    private const val LOG_TAG = "OurHangoutPush"
    private const val MESSAGE_CHANNEL_ID = "messages"
  }
}
