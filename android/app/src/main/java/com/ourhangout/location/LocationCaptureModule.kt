package com.ourhangout.location

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.core.content.ContextCompat

class LocationCaptureModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LocationCaptureModule"

  @ReactMethod
  fun storeSession(accessToken: String, refreshToken: String?, promise: Promise) {
    LocationSessionStore.save(reactContext, accessToken, refreshToken?.trim().orEmpty())
    promise.resolve(true)
  }

  @ReactMethod
  fun readSession(promise: Promise) {
    val session = LocationSessionStore.read(reactContext)
    val map = Arguments.createMap().apply {
      putString("accessToken", session.accessToken)
      putString("refreshToken", session.refreshToken)
    }
    promise.resolve(map)
  }

  @ReactMethod
  fun clearSession(promise: Promise) {
    LocationSessionStore.clear(reactContext)
    promise.resolve(true)
  }

  @ReactMethod
  fun startCapture(
    baseUrl: String,
    accessToken: String,
    refreshToken: String?,
    source: String,
    precise: Boolean,
    promise: Promise
  ) {
    val normalizedBaseUrl = baseUrl.trim().trimEnd('/')
    val normalizedToken = accessToken.trim()
    val normalizedRefreshToken = refreshToken?.trim().orEmpty()
    val normalizedSource = source.trim()
    if (normalizedBaseUrl.isEmpty() || (normalizedToken.isEmpty() && normalizedRefreshToken.isEmpty()) || normalizedSource.isEmpty()) {
      promise.resolve(false)
      return
    }

    LocationSessionStore.save(reactContext, normalizedToken, normalizedRefreshToken)

    val intent = Intent(reactContext, LocationCaptureService::class.java).apply {
      action = LocationCaptureService.ACTION_START
      putExtra(LocationCaptureService.EXTRA_BASE_URL, normalizedBaseUrl)
      putExtra(LocationCaptureService.EXTRA_ACCESS_TOKEN, normalizedToken)
      putExtra(LocationCaptureService.EXTRA_REFRESH_TOKEN, normalizedRefreshToken)
      putExtra(LocationCaptureService.EXTRA_SOURCE, normalizedSource)
      putExtra(LocationCaptureService.EXTRA_PRECISE, precise)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ContextCompat.startForegroundService(reactContext, intent)
    } else {
      reactContext.startService(intent)
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun startCaptureWithRequest(
    baseUrl: String,
    requestToken: String,
    source: String,
    precise: Boolean,
    promise: Promise
  ) {
    val normalizedBaseUrl = baseUrl.trim().trimEnd('/')
    val normalizedRequestToken = requestToken.trim()
    val normalizedSource = source.trim()
    if (normalizedBaseUrl.isEmpty() || normalizedRequestToken.isEmpty() || normalizedSource.isEmpty()) {
      promise.resolve(false)
      return
    }

    val intent = Intent(reactContext, LocationCaptureService::class.java).apply {
      action = LocationCaptureService.ACTION_START
      putExtra(LocationCaptureService.EXTRA_BASE_URL, normalizedBaseUrl)
      putExtra(LocationCaptureService.EXTRA_REQUEST_TOKEN, normalizedRequestToken)
      putExtra(LocationCaptureService.EXTRA_SOURCE, normalizedSource)
      putExtra(LocationCaptureService.EXTRA_PRECISE, precise)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ContextCompat.startForegroundService(reactContext, intent)
    } else {
      reactContext.startService(intent)
    }
    promise.resolve(true)
  }
}
