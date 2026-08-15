package com.ourhangout.auth

import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.security.SecureRandom

class OpenRouterAuthCallbackModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val MAX_REQUEST_LINE_BYTES = 4_096
    private const val SOCKET_READ_TIMEOUT_MS = 5_000
    private const val APP_CALLBACK_URI = "ourhangout://openrouter-callback"
  }

  private val lock = Any()
  private var activeServer: ServerSocket? = null

  override fun getName(): String = "OpenRouterAuthCallbackModule"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val server: ServerSocket
      val callbackPath: String
      synchronized(lock) {
        stopLocked()
        val nonceBytes = ByteArray(24).also { SecureRandom().nextBytes(it) }
        val nonce = Base64.encodeToString(nonceBytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        callbackPath = "/openrouter-callback/$nonce"
        server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        activeServer = server
      }

      Thread({ serveSingleCallback(server, callbackPath) }, "OpenRouterAuthCallback").apply {
        isDaemon = true
        start()
      }
      promise.resolve("http://127.0.0.1:${server.localPort}$callbackPath")
    } catch (error: Exception) {
      promise.reject("OPENROUTER_CALLBACK_START_FAILED", "OpenRouter 인증 콜백을 준비하지 못했어요.", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val stopped = synchronized(lock) {
      val wasActive = activeServer != null
      stopLocked()
      wasActive
    }
    promise.resolve(stopped)
  }

  override fun invalidate() {
    synchronized(lock) { stopLocked() }
    super.invalidate()
  }

  private fun serveSingleCallback(server: ServerSocket, callbackPath: String) {
    try {
      server.accept().use { socket ->
        socket.soTimeout = SOCKET_READ_TIMEOUT_MS
        val requestLine = readRequestLine(socket)
        val redirectUri = buildAppRedirect(requestLine, callbackPath)
        if (redirectUri == null) {
          writeResponse(socket, "400 Bad Request", null, "잘못된 OpenRouter 인증 요청입니다.")
        } else {
          writeResponse(socket, "302 Found", redirectUri, "OurHangout 앱으로 돌아갑니다.")
        }
      }
    } catch (_: Exception) {
      // Closing the server is the normal cancellation path.
    } finally {
      synchronized(lock) {
        if (activeServer === server) {
          activeServer = null
        }
      }
      runCatching { server.close() }
    }
  }

  private fun readRequestLine(socket: Socket): String? {
    val input = socket.getInputStream()
    val output = ByteArrayOutputStream()
    while (output.size() < MAX_REQUEST_LINE_BYTES) {
      val value = input.read()
      if (value == -1 || value == '\n'.code) break
      if (value != '\r'.code) output.write(value)
    }
    if (output.size() == 0 || output.size() >= MAX_REQUEST_LINE_BYTES) return null
    return output.toString(StandardCharsets.US_ASCII.name())
  }

  private fun buildAppRedirect(requestLine: String?, callbackPath: String): String? {
    val parts = requestLine?.split(' ') ?: return null
    if (parts.size < 2 || parts[0] != "GET") return null
    val requestUri = runCatching { Uri.parse("http://127.0.0.1${parts[1]}") }.getOrNull() ?: return null
    if (requestUri.path != callbackPath) return null

    val code = requestUri.getQueryParameter("code")?.trim()
    val error = requestUri.getQueryParameter("error")?.trim()
    if (code.isNullOrEmpty() && error.isNullOrEmpty()) return null

    return Uri.parse(APP_CALLBACK_URI).buildUpon().apply {
      if (!code.isNullOrEmpty()) appendQueryParameter("code", code)
      if (!error.isNullOrEmpty()) appendQueryParameter("error", error)
      requestUri.getQueryParameter("error_description")?.take(300)?.let {
        appendQueryParameter("error_description", it)
      }
    }.build().toString()
  }

  private fun writeResponse(socket: Socket, status: String, location: String?, message: String) {
    val body = """
      <!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OurHangout</title></head><body><p>$message</p></body></html>
    """.trimIndent().toByteArray(StandardCharsets.UTF_8)
    val headers = buildString {
      append("HTTP/1.1 $status\r\n")
      if (location != null) append("Location: $location\r\n")
      append("Content-Type: text/html; charset=utf-8\r\n")
      append("Content-Security-Policy: default-src 'none'\r\n")
      append("Cache-Control: no-store\r\n")
      append("Connection: close\r\n")
      append("Content-Length: ${body.size}\r\n\r\n")
    }.toByteArray(StandardCharsets.US_ASCII)
    socket.getOutputStream().apply {
      write(headers)
      write(body)
      flush()
    }
  }

  private fun stopLocked() {
    val server = activeServer
    activeServer = null
    runCatching { server?.close() }
  }
}
