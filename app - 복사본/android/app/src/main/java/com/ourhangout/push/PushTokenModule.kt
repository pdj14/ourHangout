package com.ourhangout.push

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

class PushTokenModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PushTokenModule"

  @ReactMethod
  fun getToken(promise: Promise) {
    FirebaseApp.initializeApp(reactContext)
    FirebaseMessaging.getInstance().token
      .addOnSuccessListener { token -> promise.resolve(token?.trim().orEmpty()) }
      .addOnFailureListener { error -> promise.reject("FCM_TOKEN_FAILED", error.message, error) }
  }

  @ReactMethod
  fun deleteToken(promise: Promise) {
    FirebaseMessaging.getInstance().deleteToken()
      .addOnSuccessListener { promise.resolve(true) }
      .addOnFailureListener { error -> promise.reject("FCM_TOKEN_DELETE_FAILED", error.message, error) }
  }
}
