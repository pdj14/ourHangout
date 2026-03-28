package com.ourhangout

import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.RemoteMessage
import com.ourhangout.location.LocationCaptureService
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class OurFirebaseMessagingService : ExpoFirebaseMessagingService() {
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

    super.onMessageReceived(remoteMessage)
  }
}
