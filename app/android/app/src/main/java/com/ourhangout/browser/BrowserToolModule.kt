package com.ourhangout.browser

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class BrowserToolModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val PAGE_TIMEOUT_MS = 15_000L
    private const val EXTRACT_DELAY_MS = 450L
    private const val MAX_TEXT_CHARS = 8_000
    private const val MAX_LINKS = 16
  }

  private data class PendingOperation(
    val id: Long,
    val promise: Promise,
    val requestedUrl: String
  )

  private val handler = Handler(Looper.getMainLooper())
  private var webView: WebView? = null
  private var pending: PendingOperation? = null
  private var operationId = 0L
  private var timeoutRunnable: Runnable? = null

  private val cancelReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == BrowserForegroundService.ACTION_CANCELLED) {
        UiThreadUtil.runOnUiThread { cancelPending("웹 확인을 취소했어요.") }
      }
    }
  }

  init {
    val filter = IntentFilter(BrowserForegroundService.ACTION_CANCELLED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(cancelReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      reactContext.registerReceiver(cancelReceiver, filter)
    }
  }

  override fun getName(): String = "BrowserToolModule"

  @ReactMethod
  fun search(query: String, promise: Promise) {
    val normalized = query.trim().take(300)
    if (normalized.isEmpty()) {
      promise.reject("BROWSER_INVALID_QUERY", "검색어를 입력해 주세요.")
      return
    }
    val encoded = URLEncoder.encode(normalized, StandardCharsets.UTF_8.name())
    browse("https://www.bing.com/search?q=$encoded", promise)
  }

  @ReactMethod
  fun openUrl(url: String, promise: Promise) {
    val normalized = normalizeHttpUrl(url)
    if (normalized == null) {
      promise.reject("BROWSER_INVALID_URL", "http 또는 https 주소만 열 수 있어요.")
      return
    }
    browse(normalized, promise)
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val cancelled = pending != null
      cancelPending("웹 확인을 취소했어요.")
      promise.resolve(cancelled)
    }
  }

  private fun browse(url: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (pending != null) {
        promise.reject("BROWSER_BUSY", "다른 웹 페이지를 확인하고 있어요.")
        return@runOnUiThread
      }
      try {
        startForegroundService()
        val browser = ensureWebView()
        val id = ++operationId
        pending = PendingOperation(id, promise, url)
        scheduleTimeout(id)
        browser.stopLoading()
        browser.loadUrl(url)
      } catch (error: Exception) {
        stopForegroundService()
        promise.reject("BROWSER_START_FAILED", error.message, error)
      }
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun ensureWebView(): WebView {
    webView?.let { return it }
    return WebView(reactContext).also { browser ->
      browser.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = false
        allowFileAccess = false
        allowContentAccess = false
        loadsImagesAutomatically = false
        blockNetworkImage = true
        mediaPlaybackRequiresUserGesture = true
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        setSupportMultipleWindows(false)
        javaScriptCanOpenWindowsAutomatically = false
        cacheMode = WebSettings.LOAD_NO_CACHE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
      }
      CookieManager.getInstance().setAcceptCookie(true)
      CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false)
      browser.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
          val target = request?.url?.toString() ?: return true
          return normalizeHttpUrl(target) == null
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
          super.onPageStarted(view, url, favicon)
        }

        override fun onPageFinished(view: WebView?, url: String?) {
          val operation = pending ?: return
          val currentUrl = url ?: return
          if (normalizeHttpUrl(currentUrl) == null) {
            rejectPending(operation.id, "BROWSER_BLOCKED_URL", "안전하지 않은 주소로 이동해 중단했어요.")
            return
          }
          handler.postDelayed({ extractPage(operation.id) }, EXTRACT_DELAY_MS)
        }

        override fun onReceivedError(
          view: WebView?,
          request: WebResourceRequest?,
          error: WebResourceError?
        ) {
          if (request?.isForMainFrame != true) return
          val operation = pending ?: return
          rejectPending(
            operation.id,
            "BROWSER_LOAD_FAILED",
            error?.description?.toString()?.take(200) ?: "페이지를 불러오지 못했어요."
          )
        }
      }
      webView = browser
    }
  }

  private fun extractPage(id: Long) {
    val operation = pending ?: return
    if (operation.id != id) return
    val browser = webView ?: return
    val script = """
      (function() {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const root = document.querySelector('main, article, [role="main"]') || document.body;
        const text = clean(root && root.innerText).slice(0, $MAX_TEXT_CHARS);
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map((link) => ({ title: clean(link.innerText || link.getAttribute('aria-label')), url: link.href }))
          .filter((link) => link.title && /^https?:\\/\\//i.test(link.url))
          .filter((link, index, all) => all.findIndex((item) => item.url === link.url) === index)
          .slice(0, $MAX_LINKS);
        return JSON.stringify({ title: clean(document.title), url: location.href, text, links });
      })();
    """.trimIndent()
    browser.evaluateJavascript(script) { encoded ->
      val current = pending
      if (current == null || current.id != id) return@evaluateJavascript
      try {
        val decoded = JSONTokener(encoded).nextValue() as? String
          ?: throw IllegalStateException("페이지 내용을 해석하지 못했어요.")
        val page = JSONObject(decoded)
        val result = Arguments.createMap().apply {
          putString("title", page.optString("title").take(300))
          putString("url", page.optString("url", operation.requestedUrl))
          putString("text", page.optString("text").take(MAX_TEXT_CHARS))
          val outputLinks = Arguments.createArray()
          val links = page.optJSONArray("links") ?: JSONArray()
          for (index in 0 until minOf(links.length(), MAX_LINKS)) {
            val link = links.optJSONObject(index) ?: continue
            val target = normalizeHttpUrl(link.optString("url")) ?: continue
            outputLinks.pushMap(Arguments.createMap().apply {
              putString("title", link.optString("title").take(240))
              putString("url", target)
            })
          }
          putArray("links", outputLinks)
        }
        resolvePending(id, result)
      } catch (error: Exception) {
        rejectPending(id, "BROWSER_EXTRACT_FAILED", error.message ?: "페이지 본문을 읽지 못했어요.")
      }
    }
  }

  private fun scheduleTimeout(id: Long) {
    timeoutRunnable?.let(handler::removeCallbacks)
    timeoutRunnable = Runnable {
      rejectPending(id, "BROWSER_TIMEOUT", "페이지 응답 시간이 너무 길어 확인을 중단했어요.")
    }.also { handler.postDelayed(it, PAGE_TIMEOUT_MS) }
  }

  private fun resolvePending(id: Long, result: Any) {
    val operation = pending ?: return
    if (operation.id != id) return
    clearPendingState()
    operation.promise.resolve(result)
  }

  private fun rejectPending(id: Long, code: String, message: String) {
    val operation = pending ?: return
    if (operation.id != id) return
    clearPendingState()
    operation.promise.reject(code, message)
  }

  private fun cancelPending(message: String) {
    val operation = pending ?: run {
      stopForegroundService()
      return
    }
    webView?.stopLoading()
    clearPendingState()
    operation.promise.reject("BROWSER_CANCELLED", message)
  }

  private fun clearPendingState() {
    timeoutRunnable?.let(handler::removeCallbacks)
    timeoutRunnable = null
    pending = null
    stopForegroundService()
  }

  private fun startForegroundService() {
    val intent = Intent(reactContext, BrowserForegroundService::class.java).apply {
      action = BrowserForegroundService.ACTION_START
    }
    ContextCompat.startForegroundService(reactContext, intent)
  }

  private fun stopForegroundService() {
    reactContext.stopService(Intent(reactContext, BrowserForegroundService::class.java))
  }

  private fun normalizeHttpUrl(value: String): String? {
    return try {
      val uri = Uri.parse(value.trim())
      if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host.isNullOrBlank()) null
      else uri.toString()
    } catch (_: Exception) {
      null
    }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread {
      cancelPending("브라우저 도구를 종료했어요.")
      webView?.apply {
        stopLoading()
        loadUrl("about:blank")
        clearHistory()
        removeAllViews()
        destroy()
      }
      webView = null
    }
    try {
      reactContext.unregisterReceiver(cancelReceiver)
    } catch (_: IllegalArgumentException) {
      // The receiver was already removed with the React context.
    }
    super.invalidate()
  }
}
