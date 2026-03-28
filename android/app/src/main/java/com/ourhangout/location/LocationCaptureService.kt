package com.ourhangout.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.ourhangout.R
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class LocationCaptureService : Service() {
  private data class RefreshedTokens(
    val accessToken: String,
    val refreshToken: String
  )

  private val handler = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action != ACTION_START) {
      stopSelfResult(startId)
      return START_NOT_STICKY
    }

    val baseUrl = intent.getStringExtra(EXTRA_BASE_URL)?.trim()?.trimEnd('/') ?: ""
    val storedSession = LocationSessionStore.read(this)
    val accessToken = (intent.getStringExtra(EXTRA_ACCESS_TOKEN)?.trim() ?: "").ifEmpty { storedSession.accessToken }
    val refreshToken = (intent.getStringExtra(EXTRA_REFRESH_TOKEN)?.trim() ?: "").ifEmpty { storedSession.refreshToken }
    val requestToken = intent.getStringExtra(EXTRA_REQUEST_TOKEN)?.trim() ?: ""
    val source = intent.getStringExtra(EXTRA_SOURCE)?.trim() ?: ""
    val precise = intent.getBooleanExtra(EXTRA_PRECISE, false)
    if (baseUrl.isEmpty() || ((accessToken.isEmpty() && refreshToken.isEmpty()) && requestToken.isEmpty()) || source.isEmpty()) {
      stopSelfResult(startId)
      return START_NOT_STICKY
    }

    startLocationForeground()
    captureOnce(baseUrl, accessToken, refreshToken, requestToken, source, precise, startId)
    return START_NOT_STICKY
  }

  private fun startLocationForeground() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Location",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
        description = "One-time location capture"
      }
      manager.createNotificationChannel(channel)
    }

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentTitle(" ")
      .setContentText(" ")
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun captureOnce(
    baseUrl: String,
    accessToken: String,
    refreshToken: String,
    requestToken: String,
    source: String,
    precise: Boolean,
    startId: Int
  ) {
    val client = LocationServices.getFusedLocationProviderClient(this)
    val tokenSource = CancellationTokenSource()
    handler.postDelayed({
      tokenSource.cancel()
    }, CAPTURE_TIMEOUT_MS)

    val request = CurrentLocationRequest.Builder()
      .setPriority(if (precise) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY)
      .setDurationMillis(CAPTURE_TIMEOUT_MS)
      .setMaxUpdateAgeMillis(0)
      .build()

    Log.i(LOG_TAG, "Starting native location capture source=$source precise=$precise")

    client.getCurrentLocation(request, tokenSource.token)
      .addOnSuccessListener { location ->
        if (location == null) {
          Log.w(LOG_TAG, "Location capture returned null")
          finishService(startId)
          return@addOnSuccessListener
        }
        Thread {
          try {
            uploadLocation(baseUrl, accessToken, refreshToken, requestToken, source, location)
            Log.i(LOG_TAG, "Location upload finished source=$source")
          } catch (error: Exception) {
            Log.e(LOG_TAG, "Location upload failed", error)
          } finally {
            finishService(startId)
          }
        }.start()
      }
      .addOnFailureListener { error ->
        Log.e(LOG_TAG, "Location capture failed", error)
        finishService(startId)
      }
  }

  private fun uploadLocation(baseUrl: String, accessToken: String, refreshToken: String, requestToken: String, source: String, location: Location) {
    if (requestToken.isNotEmpty()) {
      uploadLocationWithRequestToken(baseUrl, requestToken, source, location)
      return
    }
    val tokens = ensureTokens(baseUrl, accessToken, refreshToken) ?: return
    patchLocationSharingEnabled(baseUrl, tokens)
    val payload = JSONObject().apply {
      put("latitude", location.latitude)
      put("longitude", location.longitude)
      if (location.hasAccuracy()) {
        put("accuracyM", location.accuracy.toDouble())
      }
      // For precision refresh, the freshness check should reflect when this upload completed,
      // not the age of the location fix returned by the provider.
      put("capturedAt", isoTimestamp(System.currentTimeMillis()))
      put("source", source)
    }

    val connection = (URL("$baseUrl/v1/me/location").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = NETWORK_TIMEOUT_MS
      readTimeout = NETWORK_TIMEOUT_MS
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer ${tokens.accessToken}")
    }
    try {
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }
      val responseCode = connection.responseCode
      if (responseCode == HttpURLConnection.HTTP_UNAUTHORIZED && tokens.refreshToken.isNotEmpty()) {
        connection.disconnect()
        val refreshedTokens = refreshAccessToken(baseUrl, tokens.refreshToken) ?: return
        uploadLocation(baseUrl, refreshedTokens.accessToken, refreshedTokens.refreshToken, "", source, location)
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun uploadLocationWithRequestToken(baseUrl: String, requestToken: String, source: String, location: Location) {
    val payload = JSONObject().apply {
      put("requestToken", requestToken)
      put("latitude", location.latitude)
      put("longitude", location.longitude)
      if (location.hasAccuracy()) {
        put("accuracyM", location.accuracy.toDouble())
      }
      put("capturedAt", isoTimestamp(System.currentTimeMillis()))
      put("source", if (source == "manual_refresh") "manual_refresh" else "precision_refresh")
    }

    val connection = (URL("$baseUrl/v1/location-precision/consume").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = NETWORK_TIMEOUT_MS
      readTimeout = NETWORK_TIMEOUT_MS
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
    }
    try {
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }
      if (connection.responseCode !in 200..299) {
        throw IllegalStateException("Location consume failed (${connection.responseCode})")
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun patchLocationSharingEnabled(baseUrl: String, tokens: RefreshedTokens) {
    val payload = JSONObject().apply {
      put("locationSharingEnabled", true)
    }
    val connection = (URL("$baseUrl/v1/me").openConnection() as HttpURLConnection).apply {
      requestMethod = "PATCH"
      connectTimeout = NETWORK_TIMEOUT_MS
      readTimeout = NETWORK_TIMEOUT_MS
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer ${tokens.accessToken}")
    }
    try {
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }
      val responseCode = connection.responseCode
      if (responseCode == HttpURLConnection.HTTP_UNAUTHORIZED && tokens.refreshToken.isNotEmpty()) {
        connection.disconnect()
        val refreshedTokens = refreshAccessToken(baseUrl, tokens.refreshToken) ?: return
        patchLocationSharingEnabled(baseUrl, refreshedTokens)
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun ensureTokens(baseUrl: String, accessToken: String, refreshToken: String): RefreshedTokens? {
    if (accessToken.isNotEmpty()) {
      return RefreshedTokens(accessToken = accessToken, refreshToken = refreshToken)
    }
    if (refreshToken.isEmpty()) return null
    return refreshAccessToken(baseUrl, refreshToken)
  }

  private fun refreshAccessToken(baseUrl: String, refreshToken: String): RefreshedTokens? {
    val payload = JSONObject().apply {
      put("refreshToken", refreshToken)
    }
    val connection = (URL("$baseUrl/v1/auth/refresh").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = NETWORK_TIMEOUT_MS
      readTimeout = NETWORK_TIMEOUT_MS
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
    }
    return try {
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }
      val responseCode = connection.responseCode
      if (responseCode !in 200..299) {
        if (responseCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
          LocationSessionStore.clear(this)
        }
        null
      } else {
        val responseText = connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
        val root = JSONObject(responseText)
        val data = if (root.optBoolean("success")) root.optJSONObject("data") else root
        val accessToken = data?.optString("accessToken").orEmpty().trim()
        val tokens = data?.optJSONObject("tokens")
        val nextRefreshToken = data?.optString("refreshToken").orEmpty().ifBlank {
          tokens?.optString("refreshToken").orEmpty()
        }.trim().ifEmpty { refreshToken }
        if (accessToken.isBlank()) {
          null
        } else {
          LocationSessionStore.save(this, accessToken, nextRefreshToken)
          RefreshedTokens(accessToken = accessToken, refreshToken = nextRefreshToken)
        }
      }
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Token refresh failed", error)
      null
    } finally {
      connection.disconnect()
    }
  }

  private fun finishService(startId: Int) {
    handler.post {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
      stopSelfResult(startId)
    }
  }

  companion object {
    const val ACTION_START = "com.ourhangout.location.START_CAPTURE"
    const val EXTRA_BASE_URL = "baseUrl"
    const val EXTRA_ACCESS_TOKEN = "accessToken"
    const val EXTRA_REFRESH_TOKEN = "refreshToken"
    const val EXTRA_REQUEST_TOKEN = "requestToken"
    const val EXTRA_SOURCE = "source"
    const val EXTRA_PRECISE = "precise"

    private const val LOG_TAG = "OurHangoutLocation"
    private const val CHANNEL_ID = "ourhangout-location-capture"
    private const val NOTIFICATION_ID = 32001
    private const val CAPTURE_TIMEOUT_MS = 12_000L
    private const val NETWORK_TIMEOUT_MS = 15_000
  }

  private fun isoTimestamp(timestampMs: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date(timestampMs))
  }
}
