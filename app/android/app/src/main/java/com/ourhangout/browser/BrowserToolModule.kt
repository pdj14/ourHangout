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
import android.util.Log
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
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
    private const val LOG_TAG = "GuardianBrowserTool"
    private const val PAGE_TIMEOUT_MS = 15_000L
    // Naver search cards are hydrated after onPageFinished on some WebView/device combinations.
    private const val EXTRACT_DELAY_MS = 800L
    private const val EXTRACT_RETRY_DELAY_MS = 1_200L
    private const val MAX_EXTRACT_RETRIES = 2
    private const val MAX_TEXT_CHARS = 8_000
    private const val MAX_LINKS = 16
  }

  private data class PendingOperation(
    val id: Long,
    val promise: Promise,
    var requestedUrl: String,
    val fallbackUrl: String? = null,
    var fallbackAttempted: Boolean = false,
    var extractRetries: Int = 0
  )

  private val handler = Handler(Looper.getMainLooper())
  private var webView: WebView? = null
  private var pending: PendingOperation? = null
  private var operationId = 0L
  private var timeoutRunnable: Runnable? = null
  private var extractRunnable: Runnable? = null

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
    browse(
      "https://search.naver.com/search.naver?where=nexearch&ie=utf8&query=$encoded",
      promise,
      "https://www.bing.com/search?q=$encoded"
    )
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

  private fun browse(url: String, promise: Promise, fallbackUrl: String? = null) {
    UiThreadUtil.runOnUiThread {
      if (pending != null) {
        promise.reject("BROWSER_BUSY", "다른 웹 페이지를 확인하고 있어요.")
        return@runOnUiThread
      }
      try {
        startForegroundService()
        val browser = ensureWebView()
        val id = ++operationId
        pending = PendingOperation(id, promise, url, fallbackUrl)
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
          extractRunnable?.let(handler::removeCallbacks)
          extractRunnable = Runnable { extractPage(operation.id) }
            .also { handler.postDelayed(it, EXTRACT_DELAY_MS) }
        }

        override fun onReceivedError(
          view: WebView?,
          request: WebResourceRequest?,
          error: WebResourceError?
        ) {
          if (request?.isForMainFrame != true) return
          val operation = pending ?: return
          if (loadFallback(operation)) return
          rejectPending(
            operation.id,
            "BROWSER_LOAD_FAILED",
            error?.description?.toString()?.take(200) ?: "페이지를 불러오지 못했어요."
          )
        }

        override fun onReceivedHttpError(
          view: WebView?,
          request: WebResourceRequest?,
          errorResponse: WebResourceResponse?
        ) {
          if (request?.isForMainFrame != true || (errorResponse?.statusCode ?: 0) < 400) return
          val operation = pending ?: return
          if (loadFallback(operation)) return
          rejectPending(
            operation.id,
            "BROWSER_HTTP_FAILED",
            "웹 페이지가 ${errorResponse?.statusCode ?: 0} 오류를 반환했어요."
          )
        }

        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
          val operation = pending
          view?.destroy()
          webView = null
          if (operation != null && loadFallback(operation)) return true
          if (operation != null) {
            rejectPending(operation.id, "BROWSER_RENDERER_GONE", "웹 페이지 처리기가 종료되어 확인을 중단했어요.")
          }
          return true
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
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const host = location.hostname.toLowerCase();
        const isNaverSearch = host === 'search.naver.com'
          && location.pathname.toLowerCase() === '/search.naver';
        const isBingSearch = (host === 'bing.com' || host.endsWith('.bing.com'))
          && location.pathname.toLowerCase() === '/search';
        const naverRoot = isNaverSearch
          ? document.querySelector('#main_pack, #content, main, [role="main"]')
          : null;
        const searchResults = isNaverSearch
          ? Array.from((naverRoot || document).querySelectorAll('.sc_new, .api_subject_bx, .fds-collection-root, section'))
          : isBingSearch
          ? Array.from(document.querySelectorAll('#b_results > li.b_algo, #b_results > li.b_ans'))
          : [];
        const root = naverRoot || document.querySelector('main, article, [role="main"]') || document.body;
        const text = (searchResults.length
          ? searchResults.map((result) => clean(result.innerText)).filter(Boolean).join('\\n\\n')
          : clean(root && root.innerText)).slice(0, $MAX_TEXT_CHARS);
        const primaryLinks = isNaverSearch
          ? Array.from((naverRoot || document).querySelectorAll('a[href]'))
          : isBingSearch
          ? Array.from(document.querySelectorAll('#b_results li.b_algo h2 a[href]'))
          : [];
        const linkRoot = searchResults.length ? document.querySelector('#b_results') : document;
        const linkElements = primaryLinks.length
          ? primaryLinks
          : Array.from((linkRoot || document).querySelectorAll('a[href]'));
        const links = linkElements
          .map((link) => ({ title: clean(link.innerText || link.getAttribute('aria-label')), url: link.href }))
          .filter((link) => link.title && /^https?:\/\//i.test(link.url))
          .filter((link, index, all) => all.findIndex((item) => item.url === link.url) === index)
          .slice(0, $MAX_LINKS);
        return JSON.stringify({ title: clean(document.title), url: location.href, text, links });
      })();
    """.trimIndent()
    browser.evaluateJavascript(script) { encoded ->
      val current = pending
      if (current == null || current.id != id) return@evaluateJavascript
      try {
        val decoded = JSONTokener(encoded).nextValue()
        val page = when (decoded) {
          is String -> JSONObject(decoded)
          is JSONObject -> decoded
          else -> throw IllegalStateException("페이지 내용을 해석하지 못했어요.")
        }
        if (shouldFallbackSearch(page)) {
          if (retryExtraction(current)) return@evaluateJavascript
          if (loadFallback(current)) return@evaluateJavascript
        }
        if (page.optString("text").isBlank() && retryExtraction(current)) {
          return@evaluateJavascript
        }
        val extractedText = page.optString("text")
        val extractedLinks = page.optJSONArray("links") ?: JSONArray()
        val resolvedHost = Uri.parse(page.optString("url", operation.requestedUrl)).host ?: "unknown"
        Log.i(
          LOG_TAG,
          "resolved host=$resolvedHost chars=${extractedText.length} links=${extractedLinks.length()} fallback=${current.fallbackAttempted}"
        )
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
        Log.w(LOG_TAG, "extract exception=${error.javaClass.simpleName}")
        if (retryExtraction(current)) return@evaluateJavascript
        if (loadFallback(current)) return@evaluateJavascript
        rejectPending(id, "BROWSER_EXTRACT_FAILED", error.message ?: "페이지 본문을 읽지 못했어요.")
      }
    }
  }

  private fun scheduleTimeout(id: Long) {
    timeoutRunnable?.let(handler::removeCallbacks)
    timeoutRunnable = Runnable {
      val operation = pending
      if (operation != null && operation.id == id && loadFallback(operation)) return@Runnable
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
    Log.w(LOG_TAG, "rejected code=$code fallback=${operation.fallbackAttempted}")
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
    extractRunnable?.let(handler::removeCallbacks)
    extractRunnable = null
    pending = null
    stopForegroundService()
  }

  private fun shouldFallbackSearch(page: JSONObject): Boolean {
    val operation = pending ?: return false
    if (operation.fallbackUrl == null || operation.fallbackAttempted) return false
    val title = page.optString("title").lowercase()
    val text = page.optString("text").replace(Regex("\\s+"), " ").trim()
    if (text.length < 80) {
      Log.i(LOG_TAG, "search content too short chars=${text.length}")
      return true
    }
    val blockedHints = listOf("비정상적인 접근", "자동입력 방지", "접근이 제한", "temporarily unavailable")
    return blockedHints.any { title.contains(it) || text.contains(it) }
  }

  private fun loadFallback(operation: PendingOperation): Boolean {
    val fallback = operation.fallbackUrl ?: return false
    if (operation.fallbackAttempted) return false
    operation.fallbackAttempted = true
    operation.extractRetries = 0
    Log.i(LOG_TAG, "loading fallback search provider")
    operation.requestedUrl = fallback
    extractRunnable?.let(handler::removeCallbacks)
    extractRunnable = null
    scheduleTimeout(operation.id)
    val browser = webView ?: ensureWebView()
    browser.apply {
      stopLoading()
      loadUrl(fallback)
    }
    return true
  }

  private fun retryExtraction(operation: PendingOperation): Boolean {
    if (operation.extractRetries >= MAX_EXTRACT_RETRIES) return false
    operation.extractRetries += 1
    extractRunnable?.let(handler::removeCallbacks)
    extractRunnable = Runnable { extractPage(operation.id) }
      .also { handler.postDelayed(it, EXTRACT_RETRY_DELAY_MS) }
    Log.i(LOG_TAG, "retrying extraction attempt=${operation.extractRetries}")
    return true
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
