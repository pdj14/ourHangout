package com.ourhangout.diary;
import com.ourhangout.R;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.print.*;
import android.text.InputType;
import android.text.InputFilter;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Optional device tools, kept separate from encrypted diary storage. */
public final class DiaryTools {
    private final Activity activity; private final WebView web;
    private final SharedPreferences prefs;
    private SharedPreferences reminders(){return activity.getApplicationContext().getSharedPreferences(DiaryReminder.PREFS,0);}
    private String pendingText;
    private int pendingHour=21,pendingMinute=0, failures;
    private long blockedUntil;
    private WebView printView;
    public DiaryTools(Activity a,WebView w){activity=a;web=w;prefs=a.getSharedPreferences(DiaryReminder.PREFS,0);DiaryReminder.schedule(a);}
    private void ui(Runnable r){activity.runOnUiThread(()->{if(!activity.isFinishing()&&!activity.isDestroyed())r.run();});}
    private void callback(String name,JSONObject value){if(activity instanceof MainActivity)((MainActivity)activity).toolCallback(name,value.toString());else ui(()->web.evaluateJavascript("if(window."+name+")window."+name+"("+value.toString()+");",null));}
    private void notice(String text){ui(()->Toast.makeText(activity,text,Toast.LENGTH_LONG).show());}
    private JSONObject result(String key,Object value){JSONObject o=new JSONObject();try{o.put(key,value);}catch(Exception ignored){}return o;}
    @JavascriptInterface public String reminderStatus(){JSONObject o=new JSONObject();try{o.put("enabled",reminders().getBoolean("reminder",false));o.put("hour",reminders().getInt("hour",21));o.put("minute",reminders().getInt("minute",0));o.put("allowed",((NotificationManager)activity.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled());}catch(Exception ignored){}return o.toString();}
    @JavascriptInterface public void configureReminder(boolean enabled,int hour,int minute){
        if(hour<0||hour>23||minute<0||minute>59)return;
        ui(()->{pendingHour=hour;pendingMinute=minute;
            if(enabled&&Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},210);return;}
            saveReminder(enabled,hour,minute);
        });
    }
    private void saveReminder(boolean enabled,int h,int m){reminders().edit().putBoolean("reminder",enabled).putInt("hour",h).putInt("minute",m).commit();DiaryReminder.schedule(activity);callback("onDiaryReminder",result("enabled",enabled));}
    public boolean onRequestPermissionsResult(int code,String[] permissions,int[] grants){if(code!=210)return false;if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)saveReminder(true,pendingHour,pendingMinute);else{notice("알림 권한이 없어 알림을 켜지 않았어요.");callback("onDiaryReminder",result("enabled",false));}return true;}
    @JavascriptInterface public void exportText(String json){try{JSONArray entries=new JSONObject(json).getJSONArray("entries");StringBuilder text=new StringBuilder();for(int i=0;i<entries.length();i++){JSONObject e=entries.getJSONObject(i);text.append(e.optString("date")).append(" · ").append(e.optString("title")).append("\n\n").append(e.optString("body")).append("\n");JSONArray tags=e.optJSONArray("tags");if(tags!=null)for(int j=0;j<tags.length();j++)text.append(" #").append(tags.optString(j));JSONArray files=e.optJSONArray("attachments");if(files!=null)for(int j=0;j<files.length();j++)text.append("\n[첨부] ").append(files.getJSONObject(j).optString("name"));text.append("\n\n────────────────────\n\n");}if(text.length()>40*1024*1024)throw new IOException();pendingText=text.toString();try(FileOutputStream cached=new FileOutputStream(new File(activity.getCacheDir(),"pending-text-export.txt"))){cached.write(pendingText.getBytes(StandardCharsets.UTF_8));cached.getFD().sync();}ui(()->{try{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/plain").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"my-diary-"+new java.text.SimpleDateFormat("yyyyMMdd-HHmm",Locale.ROOT).format(new Date())+".txt");activity.startActivityForResult(intent,211);}catch(Exception e){pendingText=null;new File(activity.getCacheDir(),"pending-text-export.txt").delete();notice("파일 저장 화면을 열지 못했어요.");}});}catch(Exception e){notice("내보낼 기록을 확인해 주세요.");}}
    @JavascriptInterface public void importText(){ui(()->{try{activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("text/plain").addCategory(Intent.CATEGORY_OPENABLE),212);}catch(Exception e){notice("파일 선택기를 열지 못했어요.");}});}
    @JavascriptInterface public void addWidget(){ui(()->{android.appwidget.AppWidgetManager manager=android.appwidget.AppWidgetManager.getInstance(activity);if(manager.isRequestPinAppWidgetSupported())manager.requestPinAppWidget(new ComponentName(activity,DiaryWidget.class),null,null);else notice("홈 화면을 길게 눌러 위젯에서 My Diary를 선택해 주세요.");});}
    @JavascriptInterface public void shareText(String title,String text){if(text==null||text.length()>200000)return;ui(()->{try{activity.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT,title).putExtra(Intent.EXTRA_TEXT,text),"일기 공유"));}catch(Exception e){notice("공유할 앱을 찾지 못했어요.");}});}
    public boolean onActivityResult(int code,int resultCode,Intent intent){if(code!=211&&code!=212)return false;if(resultCode!=Activity.RESULT_OK||intent==null||intent.getData()==null){pendingText=null;if(code==211)new File(activity.getCacheDir(),"pending-text-export.txt").delete();return true;}final Uri uri=intent.getData();new Thread(()->{try{
        if(code==211){String text=pendingText;pendingText=null;File cached=new File(activity.getCacheDir(),"pending-text-export.txt");try{
if(!cached.exists()&&text==null)throw new IOException("내보낼 내용이 없어졌어요. 다시 내보내기를 눌러 주세요.");
try(OutputStream out=activity.getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();
if(cached.exists()){try(InputStream input=new FileInputStream(cached)){byte[] buffer=new byte[16384];int n;while((n=input.read(buffer))!=-1)out.write(buffer,0,n);}}
else out.write(text.getBytes(StandardCharsets.UTF_8));}
notice("텍스트 파일을 저장했어요.");}finally{cached.delete();}}
        else{ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream input=activity.getContentResolver().openInputStream(uri)){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(out.size()+n>1024*1024)throw new IOException("텍스트는 1MB까지 가져올 수 있어요.");out.write(buffer,0,n);}}String body=new String(out.toByteArray(),StandardCharsets.UTF_8);if(body.startsWith("\uFEFF"))body=body.substring(1);if(body.length()>200000)throw new IOException("텍스트가 너무 길어요. 20만 자 이하로 나눠 주세요.");callback("onDiaryTextImport",result("body",body));}
    }catch(Exception e){notice(e.getMessage()==null?"파일을 처리하지 못했어요.":e.getMessage());}},"DiaryTextIO").start();return true;}
    @JavascriptInterface public void printDocument(String html){if(html==null||html.length()>45*1024*1024){notice("인쇄할 내용이 너무 커요.");return;}ui(()->{printView=new WebView(activity);printView.getSettings().setJavaScriptEnabled(false);printView.getSettings().setAllowFileAccess(false);printView.getSettings().setAllowContentAccess(false);printView.setWebViewClient(new WebViewClient(){boolean started;@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){if(r.getUrl().toString().startsWith("data:"))return null;
try { if("https".equals(r.getUrl().getScheme()) && "diary.local".equals(r.getUrl().getHost()) && r.getUrl().getPath().startsWith("/media/")) { AttachmentStore vault=new AttachmentStore(activity.getFilesDir(),activity.getCacheDir(),()->{java.security.KeyStore store=java.security.KeyStore.getInstance("AndroidKeyStore");store.load(null);return (javax.crypto.SecretKey)store.getKey(((MainActivity)activity).keyAlias(),null);});return vault.response(r.getUrl().getLastPathSegment(),r.getRequestHeaders());} }catch(Exception ignored){}
return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}@Override public void onPageFinished(WebView v,String u){if(started)return;started=true;PrintManager manager=(PrintManager)activity.getSystemService(Context.PRINT_SERVICE);final PrintDocumentAdapter delegate=v.createPrintDocumentAdapter("아지트 일기");
manager.print("아지트 일기",new PrintDocumentAdapter(){
@Override public void onStart(){delegate.onStart();}
@Override public void onLayout(PrintAttributes oldAttributes,PrintAttributes newAttributes,CancellationSignal cancellationSignal,LayoutResultCallback callback,Bundle extras){delegate.onLayout(oldAttributes,newAttributes,cancellationSignal,callback,extras);}
@Override public void onWrite(PageRange[] pages,ParcelFileDescriptor destination,CancellationSignal cancellationSignal,WriteResultCallback callback){delegate.onWrite(pages,destination,cancellationSignal,callback);}
@Override public void onFinish(){try{delegate.onFinish();}finally{v.post(()->{v.destroy();if(printView==v)printView=null;});}}
},new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());}});printView.loadDataWithBaseURL(null,html,"text/html","UTF-8",null);});}
    @JavascriptInterface public boolean hasPin(){return prefs.contains("pinHash") || (prefs.getBoolean("pinChangePending",false) && !prefs.getString("pinBeforeHash","").isEmpty());}
    private synchronized boolean stagePinChange(String digest,String salt,boolean enabled){
        if(prefs.getBoolean("pinChangePending",false)&&!confirmPinChange(false))return false;
        SharedPreferences.Editor edit=prefs.edit().putBoolean("pinChangePending",true).putBoolean("pinTargetEnabled",enabled)
            .putString("pinBeforeHash",prefs.getString("pinHash","")).putString("pinBeforeSalt",prefs.getString("pinSalt",""));
        if(digest==null)edit.remove("pinHash").remove("pinSalt");else edit.putString("pinHash",digest).putString("pinSalt",salt);
        boolean committed=edit.commit();if(!committed)confirmPinChange(false);return committed;
    }
    @JavascriptInterface public synchronized boolean confirmPinChange(boolean saved){
        if(!prefs.getBoolean("pinChangePending",false))return true;
        SharedPreferences.Editor edit=prefs.edit();
        if(!saved){String oldHash=prefs.getString("pinBeforeHash",""),oldSalt=prefs.getString("pinBeforeSalt","");
            if(oldHash.isEmpty())edit.remove("pinHash").remove("pinSalt");else edit.putString("pinHash",oldHash).putString("pinSalt",oldSalt);}
        return edit.remove("pinChangePending").remove("pinTargetEnabled").remove("pinBeforeHash").remove("pinBeforeSalt").commit();
    }
    /** Called after loading the encrypted diary; resolves a process death between the two commits. */
    @JavascriptInterface public synchronized boolean reconcilePinChange(boolean persistedLockEnabled){
        return confirmPinChange(prefs.getBoolean("pinTargetEnabled",false)==persistedLockEnabled);
    }
    private boolean pinMatches(String pin,String digest,String salt)throws Exception{
        if(digest.isEmpty()||salt.isEmpty())return false;
        return MessageDigest.isEqual(hash(pin,Base64.decode(salt,Base64.NO_WRAP)).getBytes(StandardCharsets.UTF_8),digest.getBytes(StandardCharsets.UTF_8));
    }
    private String hash(String pin,byte[] salt)throws Exception{PBEKeySpec spec=new PBEKeySpec(pin.toCharArray(),salt,120000,256);try{return Base64.encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(),Base64.NO_WRAP);}finally{spec.clearPassword();}}
    private boolean verify(String pin){if(pin==null||!pin.matches("[0-9]{4,12}"))return false;if(System.currentTimeMillis()<blockedUntil){notice("잠시 후 다시 시도해 주세요.");return false;}try{boolean ok=pinMatches(pin,prefs.getString("pinHash",""),prefs.getString("pinSalt",""));if(!ok&&prefs.getBoolean("pinChangePending",false))ok=pinMatches(pin,prefs.getString("pinBeforeHash",""),prefs.getString("pinBeforeSalt",""));if(ok)failures=0;else if(++failures>=5){blockedUntil=System.currentTimeMillis()+30000;failures=0;}return ok;}catch(Exception e){return false;}}
    private void pinDialog(String title,java.util.function.Consumer<String> accept){ui(()->{EditText input=new EditText(activity);input.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD);input.setHint("4~12자리 숫자");input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(12)});input.setPadding(48,24,48,24);new AlertDialog.Builder(activity).setTitle(title).setView(input).setNegativeButton("취소",(d,w)->callback("onDiaryPin",result("ok",false))).setPositiveButton("확인",(d,w)->accept.accept(input.getText().toString())).setOnCancelListener(d->callback("onDiaryPin",result("ok",false))).show();});}
    private void pinResult(String action,boolean ok){JSONObject o=result("ok",ok);try{o.put("action",action);}catch(Exception ignored){}callback("onDiaryPin",o);}
    @JavascriptInterface public void authenticatePin(){pinDialog("일기 비밀번호",pin->{boolean ok=verify(pin);if(!ok)notice("비밀번호를 확인해 주세요.");pinResult("unlock",ok);});}
    @JavascriptInterface public void configurePin(){if(hasPin()){pinDialog("현재 비밀번호",pin->{if(!verify(pin)){notice("비밀번호를 확인해 주세요.");pinResult("disabled",false);return;}ui(()->new AlertDialog.Builder(activity).setTitle("일기 비밀번호").setItems(new String[]{"비밀번호 변경","비밀번호 끄기"},(d,which)->{if(which==0)newPin();else{boolean saved=stagePinChange(null,null,false);if(!saved)notice("비밀번호 변경을 준비하지 못했어요.");pinResult("disabled",saved);}}).show());});}else newPin();}
    private void newPin(){pinDialog("새 일기 비밀번호",pin->{if(!pin.matches("[0-9]{4,12}")){notice("4~12자리 숫자로 설정해 주세요.");pinResult("enabled",false);return;}pinDialog("같은 비밀번호를 다시 입력",again->{if(!pin.equals(again)){notice("비밀번호가 일치하지 않아요.");pinResult("enabled",false);return;}try{byte[] salt=new byte[16];new SecureRandom().nextBytes(salt);String digest=hash(pin,salt);if(!stagePinChange(digest,Base64.encodeToString(salt,Base64.NO_WRAP),true))throw new IOException();pinResult("enabled",true);}catch(Exception e){notice("비밀번호를 저장하지 못했어요.");pinResult("enabled",false);}});});}
}
