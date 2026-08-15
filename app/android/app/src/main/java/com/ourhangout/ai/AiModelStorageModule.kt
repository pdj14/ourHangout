package com.ourhangout.ai

import android.app.Activity
import android.app.ActivityManager
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

class AiModelStorageModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val REQUEST_MODELS_DIRECTORY = 48173
    private const val PREFERENCES_NAME = "on_device_ai"
    private const val DIRECTORY_URI_KEY = "models_directory_uri"
    private const val COPY_BUFFER_BYTES = 1024 * 1024
    private const val RESERVED_DISK_BYTES = 128L * 1024L * 1024L
  }

  private val executor = Executors.newSingleThreadExecutor()
  private var directoryPromise: Promise? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
    ) {
      if (requestCode != REQUEST_MODELS_DIRECTORY) return
      val promise = directoryPromise ?: return
      directoryPromise = null

      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.reject("AI_MODELS_PICK_CANCELLED", "AiModels folder selection was cancelled.")
        return
      }

      val directoryUri = data.data!!
      val takeFlags = data.flags and
        (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      try {
        reactContext.contentResolver.takePersistableUriPermission(directoryUri, takeFlags)
        preferences().edit().putString(DIRECTORY_URI_KEY, directoryUri.toString()).apply()
      } catch (error: Exception) {
        promise.reject("AI_MODELS_PERMISSION_FAILED", error.message, error)
        return
      }

      executor.execute { resolveDirectory(directoryUri, promise) }
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "AiModelStorageModule"

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    executor.shutdownNow()
    super.invalidate()
  }

  @ReactMethod
  fun pickModelsDirectory(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (directoryPromise != null) {
        promise.reject("AI_MODELS_PICK_IN_PROGRESS", "A folder picker is already open.")
        return@runOnUiThread
      }
      val activity = reactContext.getCurrentActivity()
      if (activity == null) {
        promise.reject("AI_MODELS_NO_ACTIVITY", "The Android activity is not available.")
        return@runOnUiThread
      }

      directoryPromise = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
      }
      try {
        activity.startActivityForResult(intent, REQUEST_MODELS_DIRECTORY)
      } catch (error: Exception) {
        directoryPromise = null
        promise.reject("AI_MODELS_PICK_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun getModels(promise: Promise) {
    val storedUri = preferences().getString(DIRECTORY_URI_KEY, null)
    if (storedUri.isNullOrBlank()) {
      promise.resolve(emptyDirectoryResult())
      return
    }
    executor.execute { resolveDirectory(Uri.parse(storedUri), promise) }
  }

  @ReactMethod
  fun prepareModel(modelUri: String, promise: Promise) {
    executor.execute {
      try {
        val document = findAllowedModel(modelUri)
          ?: throw IllegalArgumentException("The selected GGUF file is not in the granted AiModels folder.")
        val size = document.length().coerceAtLeast(0L)
        val modifiedAt = document.lastModified().coerceAtLeast(0L)
        val destinationDirectory = preparedModelsDirectory()
        if (!destinationDirectory.exists() && !destinationDirectory.mkdirs()) {
          throw IllegalStateException("Unable to create the app model directory.")
        }

        val safeName = sanitizeModelName(document.name ?: "model.gguf")
        val identity = sha256("${document.uri}|$size|$modifiedAt").take(12)
        val destination = File(destinationDirectory, "${safeName.removeSuffix(".gguf")}-$identity.gguf")
        if (destination.isFile && (size <= 0L || destination.length() == size)) {
          promise.resolve(destination.absolutePath)
          return@execute
        }

        if (size > 0L && destinationDirectory.usableSpace < size + RESERVED_DISK_BYTES) {
          throw IllegalStateException(
            "Not enough storage. At least ${size + RESERVED_DISK_BYTES} bytes of free space are required."
          )
        }

        val partial = File(destinationDirectory, "${destination.name}.part")
        if (partial.exists()) partial.delete()
        var copied = 0L
        var lastProgressAt = 0L
        reactContext.contentResolver.openInputStream(document.uri).use { input ->
          requireNotNull(input) { "Unable to open the selected model file." }
          FileOutputStream(partial).use { output ->
            val buffer = ByteArray(COPY_BUFFER_BYTES)
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              output.write(buffer, 0, read)
              copied += read
              val now = System.currentTimeMillis()
              if (now - lastProgressAt >= 250L) {
                emitCopyProgress(copied, size)
                lastProgressAt = now
              }
            }
            output.fd.sync()
          }
        }
        if (size > 0L && partial.length() != size) {
          partial.delete()
          throw IllegalStateException("The copied model size does not match the source file.")
        }
        if (destination.exists()) destination.delete()
        if (!partial.renameTo(destination)) {
          partial.delete()
          throw IllegalStateException("Unable to finalize the prepared model file.")
        }
        emitCopyProgress(destination.length(), size)
        promise.resolve(destination.absolutePath)
      } catch (error: Exception) {
        promise.reject("AI_MODEL_PREPARE_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun getRuntimeCapacity(promise: Promise) {
    executor.execute {
      try {
        val manager = reactContext.getSystemService(ActivityManager::class.java)
        val info = ActivityManager.MemoryInfo()
        manager.getMemoryInfo(info)
        val directory = preparedModelsDirectory()
        if (!directory.exists()) directory.mkdirs()
        val storageProbe = if (directory.exists()) directory else directory.parentFile ?: reactContext.filesDir
        val result = Arguments.createMap().apply {
          putDouble("totalMemoryBytes", info.totalMem.toDouble())
          putDouble("availableMemoryBytes", info.availMem.toDouble())
          putDouble("lowMemoryThresholdBytes", info.threshold.toDouble())
          putBoolean("lowMemory", info.lowMemory)
          putDouble("availableStorageBytes", storageProbe.usableSpace.toDouble())
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("AI_RUNTIME_CAPACITY_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun resolveDirectory(directoryUri: Uri, promise: Promise) {
    try {
      val directory = DocumentFile.fromTreeUri(reactContext, directoryUri)
        ?: throw IllegalStateException("Unable to open the selected folder.")
      if (!directory.exists() || !directory.isDirectory) {
        preferences().edit().remove(DIRECTORY_URI_KEY).apply()
        promise.resolve(emptyDirectoryResult())
        return
      }

      val models = scanModels(directory)
      val result = Arguments.createMap().apply {
        putString("directoryUri", directory.uri.toString())
        putString("directoryName", directory.name ?: "AiModels")
        putArray("models", models)
      }
      promise.resolve(result)
    } catch (error: SecurityException) {
      preferences().edit().remove(DIRECTORY_URI_KEY).apply()
      promise.resolve(emptyDirectoryResult())
    } catch (error: Exception) {
      promise.reject("AI_MODELS_READ_FAILED", error.message, error)
    }
  }

  private fun scanModels(directory: DocumentFile): WritableArray {
    val entries = directory.listFiles()
      .asSequence()
      .filter { it.isFile && it.name?.endsWith(".gguf", ignoreCase = true) == true }
      .sortedBy { it.name?.lowercase().orEmpty() }
      .take(200)
      .toList()

    return Arguments.createArray().apply {
      entries.forEach { document -> pushMap(modelMap(document)) }
    }
  }

  private fun modelMap(document: DocumentFile): WritableMap {
    val size = document.length().coerceAtLeast(0L)
    val modifiedAt = document.lastModified().coerceAtLeast(0L)
    val name = document.name ?: "model.gguf"
    val identity = sha256("${document.uri}|$size|$modifiedAt").take(12)
    val prepared = File(
      preparedModelsDirectory(),
      "${sanitizeModelName(name).removeSuffix(".gguf")}-$identity.gguf"
    )
    return Arguments.createMap().apply {
      putString("uri", document.uri.toString())
      putString("name", name)
      putDouble("sizeBytes", size.toDouble())
      putDouble("modifiedAt", modifiedAt.toDouble())
      putBoolean("prepared", prepared.isFile && (size <= 0L || prepared.length() == size))
    }
  }

  private fun findAllowedModel(modelUri: String): DocumentFile? {
    val storedUri = preferences().getString(DIRECTORY_URI_KEY, null) ?: return null
    val directory = DocumentFile.fromTreeUri(reactContext, Uri.parse(storedUri)) ?: return null
    return directory.listFiles().firstOrNull {
      it.isFile &&
        it.uri.toString() == modelUri &&
        it.name?.endsWith(".gguf", ignoreCase = true) == true
    }
  }

  private fun emitCopyProgress(copiedBytes: Long, totalBytes: Long) {
    if (!reactContext.hasActiveReactInstance()) return
    val event = Arguments.createMap().apply {
      putDouble("copiedBytes", copiedBytes.toDouble())
      putDouble("totalBytes", totalBytes.toDouble())
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AiModelCopyProgress", event)
  }

  private fun emptyDirectoryResult(): WritableMap = Arguments.createMap().apply {
    putNull("directoryUri")
    putNull("directoryName")
    putArray("models", Arguments.createArray())
  }

  private fun preferences() =
    reactContext.getSharedPreferences(PREFERENCES_NAME, Activity.MODE_PRIVATE)

  private fun preparedModelsDirectory(): File {
    val root = reactContext.getExternalFilesDir(null) ?: reactContext.filesDir
    return File(root, "AiModels")
  }

  private fun sanitizeModelName(value: String): String {
    val sanitized = value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(96)
    return if (sanitized.endsWith(".gguf", ignoreCase = true)) sanitized else "$sanitized.gguf"
  }

  private fun sha256(value: String): String {
    return MessageDigest.getInstance("SHA-256")
      .digest(value.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }
}
