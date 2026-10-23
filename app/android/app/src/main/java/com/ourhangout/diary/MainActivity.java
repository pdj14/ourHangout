package com.ourhangout.diary;
import com.ourhangout.R;

import android.app.Activity;
import android.app.AlertDialog;
import android.Manifest;
import android.content.ClipData;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.TextView;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Offline app shell. All persistent diary data remains in this app's sandbox. */
public final class MainActivity extends Activity {
    private static final String HOME = "file:///android_asset/diary/index.html";
    private final String diaryAccount = DiarySession.account;
    String keyAlias() { return "ourhangout.diary." + diaryAccount; }
    private static final int PHOTO = 10, EXPORT = 11, IMPORT = 12, AUTH = 13, ATTACHMENT = 14, MICROPHONE = 44;
    private static final int MAX_DATA_BYTES = 40 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Object storeMutex = new Object();
    private WebView web;
    private FrameLayout frame;
    private AtomicFile store;
    private boolean ready, foreground, saveBlocked, pickerBusy, pendingStartRecording, pendingCompose, fileOperationBusy;
    private android.os.CancellationSignal biometricCancellation;
    private String pendingExport, pendingAttachmentKind;
    private final java.util.ArrayDeque<String> pendingJavascript = new java.util.ArrayDeque<>();
    private AttachmentStore attachments;
    private DiaryTools diaryTools;
    private DiarySync hangoutSync;
    @Override public File getFilesDir() { File d=new File(super.getFilesDir(), "diary/"+diaryAccount);d.mkdirs();return d; }
    @Override public File getCacheDir() { File d=new File(super.getCacheDir(), "diary/"+diaryAccount);d.mkdirs();return d; }
    @Override public android.content.SharedPreferences getSharedPreferences(String name,int mode) { return super.getSharedPreferences(name+"-"+diaryAccount,mode); }
    void reloadDiary() { runOnUiThread(()->web.reload()); }
    private MediaRecorder recorder;
    private File recordingFile;
    private AlertDialog recordingDialog;
    private long recordingStarted;
    private final Handler recordingHandler = new Handler(Looper.getMainLooper());
    private final Runnable recordingTicker = new Runnable() {
        @Override public void run() {
            if (recorder == null) return;
            long elapsed = (SystemClock.elapsedRealtime() - recordingStarted) / 1000;
            if (recordingDialog != null) recordingDialog.setMessage(String.format(Locale.KOREAN, "%02d:%02d\n앱을 벗어나면 녹음을 마치고 첨부해요.", elapsed / 60, elapsed % 60));
            if (elapsed >= 1800) finishRecording(true); else recordingHandler.postDelayed(this, 500);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if(DiarySession.account.isEmpty()) { startActivity(new Intent(this,com.ourhangout.MainActivity.class)); finish(); return; }
        pendingCompose = state != null ? state.getBoolean("pendingCompose", false) : getIntent() != null && getIntent().getBooleanExtra("compose", false);
        pendingAttachmentKind = state != null ? state.getString("attachmentKind") : null;
        if (pendingAttachmentKind == null) pendingAttachmentKind = getSharedPreferences("native-pending", 0).getString("attachmentKind", "file");
        pickerBusy = state != null && state.getBoolean("pickerBusy", false);
        store = new AtomicFile(new File(getFilesDir(), "ongi-v1.bin"));
        attachments = new AttachmentStore(getFilesDir(), getCacheDir(), () -> getKey(true));
        frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(250, 248, 255));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(250, 248, 255));
        web.setSaveEnabled(false);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return insets;
            });
            frame.requestApplyInsets();
        }
        setSystemTheme("sage");
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false); // Packaged android_asset remains available.
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.addJavascriptInterface(new NativeBridge(), "NativeStore");
        diaryTools = new DiaryTools(this, web);
        web.addJavascriptInterface(diaryTools, "DiaryTools");
        hangoutSync=new DiarySync(this,new NativeBridge(),attachments);
        web.addJavascriptInterface(hangoutSync,"HangoutDiary");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOME.equals(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://diary.local/media/")) {
                    try { return attachments.response(request.getUrl().getLastPathSegment(), request.getRequestHeaders()); }
                    catch (Exception error) { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
                }
                if (url.startsWith("file:///android_asset/") || url.startsWith("data:")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) { if (HOME.equals(url)) ready = false; }
            @Override public void onPageFinished(WebView view, String url) {
                if (!HOME.equals(url)) return;
                ready = true;
                if (foreground) javascript("if(window.onAppResume)window.onAppResume();");
                flushJavascript();
                if(hangoutSync!=null)hangoutSync.syncNow();
                if (foreground) dispatchCompose();
            }
        });
        web.loadUrl(HOME);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void setSystemTheme(String theme) {
        runOnUiThread(() -> {
            boolean dark = "night".equals(theme);
            int color = dark ? Color.rgb(37, 35, 51) : ("rose".equals(theme) ? Color.rgb(255, 247, 250) : Color.rgb(250, 248, 255));
            frame.setBackgroundColor(color);
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    controller.setSystemBarsAppearance(dark ? 0 : mask, mask);
                }
            } else {
                getWindow().setStatusBarColor(color);
                getWindow().setNavigationBarColor(color);
                web.setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        });
    }
    private void setRecordProtection(JSONObject settings) {
        boolean protectedScreen = settings.optBoolean("lockEnabled", false);
        runOnUiThread(() -> {
            if (protectedScreen) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
        setSystemTheme(settings.optString("theme", "sage"));
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (pendingStartRecording) { pendingStartRecording = false; recordingHandler.post(this::beginRecording); }
        if (web != null) web.onResume();
        if (ready) { javascript("if(window.onAppResume)window.onAppResume();"); dispatchCompose(); }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("pendingCompose", pendingCompose);
        state.putBoolean("pickerBusy", pickerBusy);
        state.putString("attachmentKind", pendingAttachmentKind);
        super.onSaveInstanceState(state);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (intent != null && intent.getBooleanExtra("compose", false)) { pendingCompose = true; dispatchCompose(); }
    }
    private void dispatchCompose() {
        if (!pendingCompose || !ready || !foreground) return;
        pendingCompose = false; callback("onNativeCompose", "null");
    }
    @Override protected void onPause() {
        foreground = false;
        if (recorder != null) finishRecording(true);
        if (ready) javascript("if(window.onAppPause)window.onAppPause();");
        if (web != null) web.onPause();
        super.onPause();
    }
    @Override protected void onDestroy() {
        finishRecording(false);
        if (biometricCancellation != null) biometricCancellation.cancel();
        ready = false;
        pendingJavascript.clear();
        io.shutdown();
        if(hangoutSync!=null)hangoutSync.close();
        if (web != null) { web.removeJavascriptInterface("NativeStore"); web.removeJavascriptInterface("DiaryTools"); web.destroy(); }
        super.onDestroy();
    }
    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        if (!ready) { finish(); return; }
        web.evaluateJavascript("!!(window.handleBack && window.handleBack())", result -> {
            if (!"true".equals(result)) finish();
        });
    }
    private void javascript(String code) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || web == null) return;
            if (!ready) { pendingJavascript.addLast(code); return; }
            web.evaluateJavascript(code, null);
        });
    }
    private void flushJavascript() {
        if (!ready || isFinishing() || isDestroyed() || web == null) return;
        while (!pendingJavascript.isEmpty()) web.evaluateJavascript(pendingJavascript.removeFirst(), null);
    }
    private File pendingExportFile() { return new File(getCacheDir(), "pending-diary-export.json"); }
    private void cachePendingExport(String json) throws Exception {
        AtomicFile cache = new AtomicFile(pendingExportFile()); FileOutputStream output = null;
        try {
            output = cache.startWrite(); output.write(json.getBytes(StandardCharsets.UTF_8));
            cache.finishWrite(output); output = null;
        } finally { if (output != null) cache.failWrite(output); }
    }
    private String readPendingExport() throws Exception {
        try (InputStream input = new AtomicFile(pendingExportFile()).openRead()) {
            String json = new String(readBounded(input, MAX_DATA_BYTES), StandardCharsets.UTF_8); validate(json); return json;
        }
    }
    private void clearPendingExport() { pendingExport = null; new AtomicFile(pendingExportFile()).delete(); }

    private void callback(String function, String argument) {
        javascript("if(window." + function + ")window." + function + "(" + argument + ");");
    }
    void toolCallback(String function, String argument) { callback(function, argument); }
    private void message(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    public final class NativeBridge {
        @JavascriptInterface public String load() {
            synchronized (storeMutex) {
                if (!store.getBaseFile().exists() && !new File(store.getBaseFile() + ".bak").exists()) return "";
                try (InputStream input = store.openRead()) {
                    byte[] data = readBounded(input, MAX_DATA_BYTES + 64);
                    if (data.length < 34 || data[0] != 'O' || data[1] != 'N' || data[2] != 'G' || data[3] != 1 || data[4] != 12)
                        throw new IllegalStateException("Unsupported store header");
                    SecretKey key = getKey(false);
                    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                    cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOfRange(data, 5, 17)));
                    cipher.updateAAD(new byte[]{'O', 'N', 'G', 1});
                    String value = new String(cipher.doFinal(Arrays.copyOfRange(data, 17, data.length)), StandardCharsets.UTF_8);
                    JSONObject parsed = validate(value);
                    saveBlocked = false;
                    setRecordProtection(parsed.getJSONObject("settings"));
                    return value;
                } catch (Exception error) {
                    saveBlocked = true;
                    return "{\"__nativeError\":\"저장된 기록을 안전하게 열지 못했어요. 기존 파일은 보존되었으며 덮어쓰기를 중단했어요.\"}";
                }
            }
        }
        @JavascriptInterface public boolean save(String json) {
            synchronized (storeMutex) {
                if (saveBlocked) return false;
                FileOutputStream output = null;
                try {
                    JSONObject parsed = validate(json);
                    byte[] value = json.getBytes(StandardCharsets.UTF_8);
                    if (value.length > MAX_DATA_BYTES) return false;
                    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                    cipher.init(Cipher.ENCRYPT_MODE, getKey(true));
                    cipher.updateAAD(new byte[]{'O', 'N', 'G', 1});
                    byte[] encrypted = cipher.doFinal(value);
                    output = store.startWrite();
                    output.write(new byte[]{'O', 'N', 'G', 1, 12});
                    output.write(cipher.getIV());
                    output.write(encrypted);
                    store.finishWrite(output);
                    if(hangoutSync!=null)hangoutSync.schedule();
                    output = null;
                    setRecordProtection(parsed.getJSONObject("settings"));
                    return true;
                } catch (Exception error) {
                    if (output != null) store.failWrite(output);
                    return false;
                }
            }
        }
        /** Recovery is a separate, explicitly confirmed action; ordinary import never unblocks a corrupt store. */
        @JavascriptInterface public boolean restoreBackup(String json) {
            synchronized (storeMutex) {
                try {
                    validate(json);
                    if (json.getBytes(StandardCharsets.UTF_8).length > MAX_DATA_BYTES)
                        throw new IllegalArgumentException("Oversized recovery data");
                    preserveRecoverySnapshot();
                    saveBlocked = false;
                    if (save(json) && json.equals(load())) return true;
                } catch (Exception error) {
                    // Keep all original encrypted bytes and any completed recovery snapshots private.
                }
                saveBlocked = true;
                return false;
            }
        }
        @JavascriptInterface public void pickPhoto() {
            runOnUiThread(() -> {
                if (pickerBusy || fileOperationBusy) return;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                launchPicker(intent, PHOTO);
            });
        }
        @JavascriptInterface public void pickAttachment(String kind) {
            if (!("image".equals(kind) || "video".equals(kind) || "audio".equals(kind) || "file".equals(kind))) return;
            runOnUiThread(() -> {
                if (pickerBusy || fileOperationBusy) { callback("onNativeAttachmentCancelled", "null"); return; }
                pendingAttachmentKind = kind;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("file".equals(kind) ? "*/*" : kind + "/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                launchPicker(intent, ATTACHMENT);
            });
        }
        @JavascriptInterface public void openAttachment(String id) {
            io.execute(() -> {
                try {
                    JSONObject item = attachments.description(id);
                    Uri uri = AttachmentProvider.grant(attachments.preview(id), item.getString("name"), item.getString("mime"));
                    runOnUiThread(() -> {
                        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, item.optString("mime", "application/octet-stream"));
                        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        view.setClipData(ClipData.newRawUri("첨부 파일", uri));
                        try { startActivity(Intent.createChooser(view, "첨부 파일 열기")); }
                        catch (Exception error) { message("이 파일을 열 수 있는 앱을 설치해 주세요."); }
                    });
                } catch (Exception error) { message("첨부 파일을 열지 못했어요. 백업에서 복원해 주세요."); }
            });
        }
        @JavascriptInterface public void deleteUnreferencedAttachments(String idsJson) {
            if (idsJson == null || idsJson.length() > 2 * 1024 * 1024) { message("첨부 삭제 요청을 확인하지 못했어요."); return; }
            io.execute(() -> {
                try {
                    org.json.JSONArray candidates = new org.json.JSONArray(idsJson);
                    synchronized (storeMutex) {
                        // Read from the encrypted file after the UI's successful save, rather
                        // than trusting a possibly stale JavaScript list of retained records.
                        JSONObject persisted = validate(load());
                        attachments.deleteUnreferenced(candidates, persisted);
                    }
                } catch (Exception error) { message("기록은 삭제했지만 일부 첨부 파일을 정리하지 못했어요."); }
            });
        }
        @JavascriptInterface public void recordAudio() { runOnUiThread(() -> requestRecording()); }
        @JavascriptInterface public void startRecording() { recordAudio(); }
        @JavascriptInterface public void stopRecording() { runOnUiThread(() -> finishRecording(true)); }
        @JavascriptInterface public void cancelRecording() { runOnUiThread(() -> finishRecording(false)); }
        @JavascriptInterface public void exportBackup(String json) {
            if (json == null || json.length() > MAX_DATA_BYTES) { message("백업 용량이 너무 커요."); return; }
            try { validate(json); } catch (Exception error) { message("올바른 기록 데이터가 아니에요."); return; }
            runOnUiThread(() -> {
                if (pickerBusy || fileOperationBusy) { message("파일 처리가 끝나면 다시 시도해 주세요."); return; }
                try { cachePendingExport(json); pendingExport = json; }
                catch (Exception error) { message("백업 준비에 실패했어요. 저장 공간을 확인해 주세요."); return; }
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/zip");
                intent.putExtra(Intent.EXTRA_TITLE, "my-diary-backup-" + new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date()) + ".zip");
                launchPicker(intent, EXPORT);
            });
        }
        @JavascriptInterface public void importBackup() {
            runOnUiThread(() -> {
                if (pickerBusy || fileOperationBusy) return;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/json", "text/plain", "application/octet-stream"});
                launchPicker(intent, IMPORT);
            });
        }
        @JavascriptInterface public boolean hasDeviceLock() {
            return ((KeyguardManager) getSystemService(KEYGUARD_SERVICE)).isDeviceSecure();
        }
        @JavascriptInterface public void authenticate() {
            runOnUiThread(() -> {
                if (pickerBusy) return;
                KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                if (!keyguard.isDeviceSecure()) { callback("onNativeAuth", "false"); return; }
                if (Build.VERSION.SDK_INT >= 30) {
                    int methods = android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG | android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL;
                    android.hardware.biometrics.BiometricManager manager = (android.hardware.biometrics.BiometricManager) getSystemService(BIOMETRIC_SERVICE);
                    if (manager != null && manager.canAuthenticate(methods) == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS) {
                        try {
                            android.hardware.biometrics.BiometricPrompt prompt = new android.hardware.biometrics.BiometricPrompt.Builder(MainActivity.this)
                                .setTitle("아지트 일기 잠금 해제").setSubtitle("지문 또는 기기 잠금으로 기록을 확인해 주세요.")
                                .setAllowedAuthenticators(methods).build();
                            biometricCancellation = new android.os.CancellationSignal(); pickerBusy = true;
                            prompt.authenticate(biometricCancellation, getMainExecutor(), new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                                @Override public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult result) { pickerBusy = false; biometricCancellation = null; callback("onNativeAuth", "true"); }
                                @Override public void onAuthenticationError(int errorCode, CharSequence errorMessage) { pickerBusy = false; biometricCancellation = null; callback("onNativeAuth", "false"); }
                            });
                            return;
                        } catch (Exception error) { pickerBusy = false; biometricCancellation = null; }
                    }
                }
                Intent intent = keyguard.createConfirmDeviceCredentialIntent("아지트 일기 잠금 해제", "소중한 기록을 확인하려면 기기 잠금을 해제해 주세요.");
                if (intent == null) { callback("onNativeAuth", "false"); return; }
                launchPicker(intent, AUTH);
            });
        }
        @JavascriptInterface public void toast(String text) {
            if (text != null) message(text.substring(0, Math.min(300, text.length())));
        }
    }

    private void launchPicker(Intent intent, int request) {
        try {
            pickerBusy = true;
            if (request == ATTACHMENT) getSharedPreferences("native-pending", 0).edit().putString("attachmentKind", pendingAttachmentKind == null ? "file" : pendingAttachmentKind).commit();
            startActivityForResult(intent, request);
        }
        catch (Exception error) {
            pickerBusy = false;
            if (request == EXPORT) clearPendingExport();
            if (request == ATTACHMENT) getSharedPreferences("native-pending", 0).edit().remove("attachmentKind").commit();
            message("이 기기에서 해당 화면을 열지 못했어요.");
            if (request == AUTH) callback("onNativeAuth", "false");
            if (request == ATTACHMENT) { callback("onNativeAttachmentError", JSONObject.quote("파일 선택 화면을 열지 못했어요.")); callback("onNativeAttachmentFinished", "null"); }
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        if (diaryTools != null && diaryTools.onActivityResult(request, result, intent)) return;
        pickerBusy = false;
        if (request == AUTH) { callback("onNativeAuth", result == RESULT_OK ? "true" : "false"); return; }
        final String export = request == EXPORT ? pendingExport : null;
        if (request == EXPORT) pendingExport = null;
        if (result != RESULT_OK || intent == null || (intent.getData() == null && intent.getClipData() == null)) {
            if (request == EXPORT) clearPendingExport();
            if (request == ATTACHMENT) { getSharedPreferences("native-pending", 0).edit().remove("attachmentKind").commit(); callback("onNativeAttachmentCancelled", "null"); }
            return;
        }
        final Uri uri = intent.getData();
        final String attachmentKind = pendingAttachmentKind == null ? "file" : pendingAttachmentKind;
        if (request == ATTACHMENT) {
            pendingAttachmentKind = null;
            getSharedPreferences("native-pending", 0).edit().remove("attachmentKind").commit();
            callback("onNativeAttachmentResume", "null");
        }
        fileOperationBusy = true;
        io.execute(() -> {
            try {
                if (request == ATTACHMENT) {
                    java.util.ArrayList<Uri> selected = new java.util.ArrayList<>();
                    if (intent.getClipData() != null) {
                        for (int i = 0; i < Math.min(100, intent.getClipData().getItemCount()); i++) selected.add(intent.getClipData().getItemAt(i).getUri());
                    } else selected.add(uri);
                    int failures = 0;
                    for (Uri item : selected) {
                        try { callback("onNativeAttachment", attachments.add(getContentResolver(), item, attachmentKind).toString()); }
                        catch (Exception error) { failures++; }
                    }
                    if (failures > 0) { String issue = failures + "개 파일을 첨부하지 못했어요. 파일마다 최대 128MB까지 지원해요."; message(issue); callback("onNativeAttachmentError", JSONObject.quote(issue)); }
                    callback("onNativeAttachmentFinished", "null");
                } else if (request == PHOTO) {
                    String mime = getContentResolver().getType(uri);
                    if (mime == null || !mime.startsWith("image/")) throw new IllegalArgumentException("Not an image");
                    byte[] bytes;
                    try (InputStream input = getContentResolver().openInputStream(uri)) { bytes = readBounded(input, 20 * 1024 * 1024); }
                    callback("onNativePhoto", JSONObject.quote(photoDataUrl(bytes)));
                } else if (request == EXPORT) {
                    final String exportJson = export == null ? readPendingExport() : export;
                    File stagedBackup = new File(getCacheDir(), "backup-" + UUID.randomUUID() + ".zip");
                    try {
                        try (OutputStream staged = new FileOutputStream(stagedBackup)) { attachments.exportBackup(validate(exportJson), staged); }
                        try (InputStream staged = new FileInputStream(stagedBackup); OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                            if (output == null) throw new IllegalStateException("No output");
                            byte[] buffer = new byte[65536]; int count;
                            while ((count = staged.read(buffer)) != -1) output.write(buffer, 0, count);
                        }
                    } finally { stagedBackup.delete(); clearPendingExport(); }
                    message("백업 파일을 저장했어요.");
                } else if (request == IMPORT) {
                    String json;
                    try (InputStream input = getContentResolver().openInputStream(uri)) { json = attachments.importBackup(input); }
                    validate(json);
                    callback("onNativeImport", JSONObject.quote(json));
                }
            } catch (Exception | OutOfMemoryError error) {
                message("파일을 열거나 저장하지 못했어요. 파일 형식, 용량과 저장 공간을 확인해 주세요.");
                if (request == ATTACHMENT) { callback("onNativeAttachmentError", JSONObject.quote("첨부 파일을 불러오지 못했어요.")); callback("onNativeAttachmentFinished", "null"); }
            } finally {
                if (request == EXPORT) clearPendingExport();
                runOnUiThread(() -> fileOperationBusy = false);
            }
        });
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (diaryTools != null) diaryTools.onRequestPermissionsResult(request, permissions, results);
        if (request == MICROPHONE) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) { if (foreground) beginRecording(); else pendingStartRecording = true; }
            else { message("음성 녹음에는 마이크 권한이 필요해요. 설정에서 허용한 뒤 다시 눌러 주세요."); callback("onNativeRecording", "{\"state\":\"error\",\"message\":\"마이크 권한이 필요해요.\"}"); }
        }
    }
    private void requestRecording() {
        if (recorder != null || pickerBusy) { callback("onNativeRecording", "{\"state\":\"error\"}"); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE); return;
        }
        beginRecording();
    }
    private void beginRecording() {
        if (recorder != null || !foreground) return;
        try {
            recordingFile = new File(getCacheDir(), "recording-" + UUID.randomUUID() + ".m4a");
            recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioSamplingRate(44100); recorder.setAudioEncodingBitRate(128000);
            recorder.setOutputFile(recordingFile.getAbsolutePath());
            recorder.setMaxDuration(30 * 60 * 1000); recorder.setMaxFileSize(AttachmentStore.MAX_FILE);
            recorder.setOnInfoListener((r, what, extra) -> { if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) finishRecording(true); });
            recorder.prepare(); recorder.start(); recordingStarted = SystemClock.elapsedRealtime();
            recordingDialog = new AlertDialog.Builder(this).setTitle("음성 녹음 중")
                .setMessage("00:00")
                .setPositiveButton("녹음 완료", (dialog, which) -> finishRecording(true))
                .setNegativeButton("취소", (dialog, which) -> finishRecording(false)).create();
            recordingDialog.setOnCancelListener(dialog -> finishRecording(false));
            recordingDialog.setCanceledOnTouchOutside(false); recordingDialog.show();
            recordingHandler.post(recordingTicker); callback("onNativeRecording", "{\"state\":\"recording\"}");
        } catch (Exception error) { finishRecording(false); message("녹음을 시작하지 못했어요. 다른 앱의 마이크 사용을 확인해 주세요."); callback("onNativeRecording", "{\"state\":\"error\"}"); }
    }
    private void finishRecording(boolean keep) {
        if (recorder == null) return;
        MediaRecorder active = recorder; recorder = null;
        File file = recordingFile; recordingFile = null;
        long duration = Math.max(0, SystemClock.elapsedRealtime() - recordingStarted);
        recordingHandler.removeCallbacks(recordingTicker);
        if (recordingDialog != null) { recordingDialog.setOnCancelListener(null); recordingDialog.dismiss(); recordingDialog = null; }
        boolean stopped = true;
        try { active.stop(); } catch (Exception error) { stopped = false; }
        finally { active.release(); }
        if (!keep || !stopped || duration < 500 || file == null || file.length() == 0) {
            if (file != null) file.delete(); callback("onNativeRecording", "{\"state\":\"cancelled\"}"); return;
        }
        io.execute(() -> {
            try (InputStream input = new FileInputStream(file)) {
                String name = "음성 녹음 " + new SimpleDateFormat("yyyy-MM-dd HH.mm", Locale.KOREAN).format(new Date()) + ".m4a";
                JSONObject attachment = attachments.add(input, name, "audio/mp4"); attachment.put("duration", duration / 1000.0);
                callback("onNativeAttachment", attachment.toString()); callback("onNativeRecording", "{\"state\":\"saved\",\"duration\":" + duration / 1000.0 + "}");
            } catch (Exception error) { message("녹음을 저장하지 못했어요. 저장 공간을 확인해 주세요."); callback("onNativeRecording", "{\"state\":\"error\"}"); }
            finally { file.delete(); }
        });
    }

    private static JSONObject validate(String json) throws Exception {
        if (json == null || json.length() > MAX_DATA_BYTES) throw new IllegalArgumentException("Oversized data");
        JSONObject parsed = new JSONObject(json);
        if (parsed.optInt("schema", -1) != 1 || parsed.optJSONArray("entries") == null
            || parsed.getJSONArray("entries").length() > 20000 || parsed.optJSONObject("settings") == null)
            throw new IllegalArgumentException("Unsupported diary schema");
        return parsed;
    }
    private void preserveRecoverySnapshot() throws Exception {
        File base = store.getBaseFile();
        File[] sources = {base, new File(base + ".bak"), new File(base + ".new")};
        boolean hasOriginal = false;
        for (File source : sources) if (source.exists()) hasOriginal = true;
        if (!hasOriginal) return;
        File directory = new File(new File(getFilesDir(), "recovery"),
            System.currentTimeMillis() + "-" + UUID.randomUUID());
        if (!directory.mkdirs()) throw new IllegalStateException("Cannot preserve original store");
        for (File source : sources) {
            if (!source.exists()) continue;
            File snapshot = new File(directory, source.getName());
            // Do not call AtomicFile.openRead here: it may migrate .bak and remove the original base.
            try (InputStream input = new FileInputStream(source);
                 FileOutputStream output = new FileOutputStream(snapshot)) {
                byte[] buffer = new byte[16384];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                output.getFD().sync();
            }
            if (snapshot.length() != source.length()) throw new IllegalStateException("Incomplete recovery snapshot");
        }
    }
    private synchronized SecretKey getKey(boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        if (keys.containsAlias(keyAlias())) return ((KeyStore.SecretKeyEntry) keys.getEntry(keyAlias(), null)).getSecretKey();
        if (!create) throw new IllegalStateException("Missing encryption key");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(keyAlias(), KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }
    private static byte[] readBounded(InputStream input, int maximum) throws Exception {
        if (input == null) throw new IllegalArgumentException("No input");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int count, total = 0;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maximum) throw new IllegalArgumentException("File too large");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
    private static String photoDataUrl(byte[] bytes) throws Exception {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (options.outWidth < 1 || options.outHeight < 1) throw new IllegalArgumentException("Invalid image");
        int sample = 1;
        while (Math.max(options.outWidth, options.outHeight) / sample > 2880) sample *= 2;
        options.inJustDecodeBounds = false;
        options.inSampleSize = sample;
        Bitmap image = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (image == null) throw new IllegalArgumentException("Invalid bitmap");
        try {
            int orientation = new ExifInterface(new ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270); break;
                default: break;
            }
            if (!matrix.isIdentity()) {
                Bitmap rotated = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), matrix, true);
                if (rotated != image) { image.recycle(); image = rotated; }
            }
            float scale = Math.min(1f, 1440f / Math.max(image.getWidth(), image.getHeight()));
            if (scale < 1f) {
                Bitmap resized = Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth() * scale)), Math.max(1, Math.round(image.getHeight() * scale)), true);
                image.recycle(); image = resized;
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!image.compress(Bitmap.CompressFormat.JPEG, 85, output)) throw new IllegalStateException("Image compression failed");
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } finally { image.recycle(); }
    }
}
