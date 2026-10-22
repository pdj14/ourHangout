package com.ourhangout.location

import android.content.Context

internal object LocationSessionStore {
  private const val PREFS_NAME = "ourhangout_location_session"
  private const val KEY_ACCESS_TOKEN = "accessToken"
  private const val KEY_REFRESH_TOKEN = "refreshToken"

  fun save(context: Context, accessToken: String, refreshToken: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_ACCESS_TOKEN, accessToken.trim())
      .putString(KEY_REFRESH_TOKEN, refreshToken.trim())
      .apply()
  }

  fun read(context: Context): StoredSession {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    return StoredSession(
      accessToken = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty().trim(),
      refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "").orEmpty().trim()
    )
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_ACCESS_TOKEN)
      .remove(KEY_REFRESH_TOKEN)
      .apply()
  }
}

internal data class StoredSession(
  val accessToken: String,
  val refreshToken: String
)
