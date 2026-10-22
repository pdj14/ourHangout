package com.ourhangout.location

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture

internal data class RefreshOutcome(
  val session: StoredSession? = null,
  val errorCode: String? = null,
  val errorMessage: String? = null
)

internal object LocationAuthSessionManager {
  private const val LOG_TAG = "OurHangoutAuth"
  private const val NETWORK_TIMEOUT_MS = 15_000

  private val refreshLock = Any()
  @Volatile
  private var refreshInFlight: CompletableFuture<RefreshOutcome>? = null

  fun refreshSession(context: Context, baseUrl: String, preferredRefreshToken: String = ""): RefreshOutcome {
    val normalizedBaseUrl = baseUrl.trim().trimEnd('/')
    if (normalizedBaseUrl.isEmpty()) {
      return RefreshOutcome(
        errorCode = "AUTH_REFRESH_FAILED",
        errorMessage = "Backend base URL is missing."
      )
    }

    val existingFuture = synchronized(refreshLock) { refreshInFlight }
    if (existingFuture != null) {
      return waitForExistingRefresh(existingFuture)
    }

    val future = CompletableFuture<RefreshOutcome>()
    val shouldRunRefresh = synchronized(refreshLock) {
      if (refreshInFlight != null) {
        false
      } else {
        refreshInFlight = future
        true
      }
    }

    if (!shouldRunRefresh) {
      val currentFuture = synchronized(refreshLock) { refreshInFlight }
      return if (currentFuture != null) {
        waitForExistingRefresh(currentFuture)
      } else {
        RefreshOutcome(
          errorCode = "AUTH_REFRESH_FAILED",
          errorMessage = "Token refresh state was lost."
        )
      }
    }

    try {
      val outcome = performRefresh(context, normalizedBaseUrl, preferredRefreshToken)
      future.complete(outcome)
      return outcome
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Token refresh failed", error)
      val outcome = RefreshOutcome(
        errorCode = "NETWORK_ERROR",
        errorMessage = error.message?.takeIf { it.isNotBlank() } ?: "Token refresh failed."
      )
      future.complete(outcome)
      return outcome
    } finally {
      synchronized(refreshLock) {
        if (refreshInFlight === future) {
          refreshInFlight = null
        }
      }
    }
  }

  private fun waitForExistingRefresh(future: CompletableFuture<RefreshOutcome>): RefreshOutcome {
    return try {
      future.get()
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Waiting for shared token refresh failed", error)
      RefreshOutcome(
        errorCode = "AUTH_REFRESH_FAILED",
        errorMessage = error.cause?.message?.takeIf { it.isNotBlank() } ?: "Token refresh failed."
      )
    }
  }

  private fun performRefresh(context: Context, baseUrl: String, preferredRefreshToken: String): RefreshOutcome {
    val storedSession = LocationSessionStore.read(context)
    val tokenToUse = storedSession.refreshToken.ifBlank { preferredRefreshToken.trim() }
    if (tokenToUse.isBlank()) {
      return RefreshOutcome(
        errorCode = "AUTH_REFRESH_INVALID",
        errorMessage = "Refresh token is invalid or expired."
      )
    }

    val payload = JSONObject().apply {
      put("refreshToken", tokenToUse)
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
      val responseText = readConnectionBody(connection)
      if (responseCode !in 200..299) {
        if (responseCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
          LocationSessionStore.clear(context)
          return RefreshOutcome(
            errorCode = "AUTH_REFRESH_INVALID",
            errorMessage = "Refresh token is invalid or expired."
          )
        }

        return RefreshOutcome(
          errorCode = "AUTH_REFRESH_FAILED",
          errorMessage = parseErrorMessage(responseText, responseCode)
        )
      }

      val root = JSONObject(responseText.ifBlank { "{}" })
      val data = if (root.optBoolean("success")) root.optJSONObject("data") else root
      val accessToken = data?.optString("accessToken").orEmpty().trim().ifBlank {
        data?.optJSONObject("tokens")?.optString("accessToken").orEmpty().trim()
      }
      val refreshToken = data?.optString("refreshToken").orEmpty().trim().ifBlank {
        data?.optJSONObject("tokens")?.optString("refreshToken").orEmpty().trim()
      }.ifBlank { tokenToUse }

      if (accessToken.isBlank()) {
        return RefreshOutcome(
          errorCode = "AUTH_REFRESH_FAILED",
          errorMessage = "Refresh response did not include a valid access token."
        )
      }

      val session = StoredSession(
        accessToken = accessToken,
        refreshToken = refreshToken
      )
      LocationSessionStore.save(context, session.accessToken, session.refreshToken)
      RefreshOutcome(session = session)
    } finally {
      connection.disconnect()
    }
  }

  private fun readConnectionBody(connection: HttpURLConnection): String {
    return try {
      connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
    } catch (_: Exception) {
      try {
        connection.errorStream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
      } catch (_: Exception) {
        ""
      }
    }
  }

  private fun parseErrorMessage(responseText: String, responseCode: Int): String {
    if (responseText.isBlank()) {
      return "Refresh request failed ($responseCode)."
    }

    return try {
      val root = JSONObject(responseText)
      val error = root.optJSONObject("error")
      error?.optString("message").orEmpty().trim().ifBlank {
        root.optString("message").trim()
      }.ifBlank {
        "Refresh request failed ($responseCode)."
      }
    } catch (_: Exception) {
      "Refresh request failed ($responseCode)."
    }
  }
}
