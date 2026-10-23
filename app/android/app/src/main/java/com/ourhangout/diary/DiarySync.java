package com.ourhangout.diary;

import android.webkit.JavascriptInterface;
import android.content.SharedPreferences;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.*;
import org.json.*;

/** Private authenticated, versioned ZIP backups. No network error overwrites the local vault. */
final class DiarySync {
    private final MainActivity activity;
    private final MainActivity.NativeBridge bridge;
    private final AttachmentStore attachments;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final SharedPreferences prefs;
    private final String account=DiarySession.account,base=DiarySession.baseUrl,token=DiarySession.token;
    private boolean closed;
    private final Runnable pending=()->network.execute(()->sync(false));
    DiarySync(MainActivity a,MainActivity.NativeBridge b,AttachmentStore store) { activity=a;bridge=b;attachments=store;prefs=a.getSharedPreferences("diary-sync",0); }
    private void report(String state,String text) { try { JSONObject o=new JSONObject().put("state",state).put("message",text).put("version",prefs.getInt("version",0)); activity.toolCallback("onHangoutSync",o.toString()); }catch(Exception ignored){} }
    void schedule() { handler.post(()->{if(!closed){handler.removeCallbacks(pending);handler.postDelayed(pending,15000);}}); }
    void close() { closed=true;handler.removeCallbacks(pending);network.shutdown(); }
    private boolean active() { return !closed && account.equals(DiarySession.account) && !token.isEmpty(); }
    private HttpURLConnection request(String path,String method) throws Exception {
        if(!active())throw new IOException("아지트로 돌아가 다시 로그인해 주세요.");
        HttpURLConnection c=(HttpURLConnection)new URL(base+path).openConnection();
        c.setInstanceFollowRedirects(false);c.setRequestMethod(method);c.setConnectTimeout(15000);c.setReadTimeout(120000);
        c.setRequestProperty("Authorization","Bearer "+token);return c;
    }
    private JSONObject json(HttpURLConnection c) throws Exception {
        int status=c.getResponseCode();
        if(status<200||status>=300)throw new IOException(status==409?"서버에 더 새로운 기록이 있어요. 기기의 기록은 보존했어요.":status==401?"연결이 만료됐어요. 아지트로 돌아간 뒤 일기를 다시 열어 주세요.":"서버에 저장하지 못했어요. 기기의 기록은 안전하게 남아 있어요. ("+status+")");
        try(InputStream in=c.getInputStream()){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>65536)throw new IOException("응답이 너무 큽니다.");out.write(b,0,n);}return new JSONObject(out.toString("UTF-8")).getJSONObject("data");}
        finally{c.disconnect();}
    }
    private String fingerprint(String raw) throws Exception {
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));StringBuilder hex=new StringBuilder();for(byte b:digest)hex.append(String.format("%02x",b));return hex.toString();
    }
    @JavascriptInterface public void syncNow() { if(!closed)network.execute(()->sync(false)); }
    private void sync(boolean force) {
        if(!active())return;
        File zip=null;
        try {
            String raw=bridge.load(); if(raw.isEmpty())raw="{\"schema\":1,\"entries\":[],\"settings\":{\"theme\":\"sage\",\"fontSize\":\"normal\",\"lockEnabled\":false}}";
            JSONObject document=new JSONObject(raw);if(document.has("__nativeError"))throw new IOException("기기 기록을 열지 못해 서버 저장을 중단했어요.");
            JSONObject head=json(request("/v1/diary","GET"));int remote=head.getInt("version"),local=prefs.getInt("version",0);
            if(remote!=local&&!force){report("conflict","서버에 새로운 백업이 있어요. ‘서버 백업 가져오기’로 확인할 수 있어요. 기기 기록은 바꾸지 않았어요.");return;}
            String hash=fingerprint(raw);if(hash.equals(prefs.getString("fingerprint",""))&&!force){report("saved","서버에 안전하게 보관했어요 · 버전 "+remote);return;}
            report("syncing","첨부와 이야기를 서버에 보관하고 있어요.");
            zip=File.createTempFile("diary-upload-",".zip",activity.getCacheDir());
            try(OutputStream output=new FileOutputStream(zip)){attachments.exportBackup(document,output);}
            HttpURLConnection c=request("/v1/diary/backup?expectedVersion="+remote,"POST");
            try { c.setDoOutput(true);c.setRequestProperty("Content-Type","application/vnd.ourhangout.diary+zip");c.setFixedLengthStreamingMode(zip.length());
                try(InputStream input=new FileInputStream(zip);OutputStream output=c.getOutputStream()){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);}
                JSONObject result=json(c);prefs.edit().putInt("version",result.getInt("version")).putString("fingerprint",hash).commit();
                report("saved","서버에 안전하게 보관했어요 · 버전 "+result.getInt("version"));
            }finally{c.disconnect();}
        }catch(Exception e){report("error",e.getMessage()==null?"연결을 확인해 주세요. 기기의 기록은 보존했어요.":e.getMessage());}
        finally{if(zip!=null)zip.delete();}
    }
    @JavascriptInterface public void uploadLocal() {
        activity.runOnUiThread(()->new android.app.AlertDialog.Builder(activity).setTitle("기기 기록을 서버에 보관할까요?")
            .setMessage("현재 서버 기록을 새 버전으로 교체해요. 이전 서버 백업은 마스터 페이지에 남아 있어요.")
            .setNegativeButton("취소",null).setPositiveButton("기기 기록 보관",(d,w)->{if(!closed)network.execute(()->sync(true));}).show());
    }
    @JavascriptInterface public void restore() {
        activity.runOnUiThread(()->new android.app.AlertDialog.Builder(activity).setTitle("서버 백업을 가져올까요?")
            .setMessage("이 기기의 기록·초안·화면 설정을 서버의 최신 백업으로 교체해요. 잠금 설정은 이 기기의 설정을 유지해요. 현재 기기의 암호화 기록은 복구용 사본으로 먼저 보존해요.")
            .setNegativeButton("취소",null).setPositiveButton("백업 가져오기",(d,w)->{if(!closed)network.execute(this::download);}).show());
    }
    private void download() {
        File zip=null;
        try {
            JSONObject head=json(request("/v1/diary","GET"));if(head.getInt("version")==0){report("saved","아직 서버 백업이 없어요. 먼저 기기의 기록을 저장해 주세요.");return;}
            report("syncing","서버 백업과 첨부를 확인하고 있어요.");
            HttpURLConnection c=request("/v1/diary/backup/"+head.getString("id"),"GET");
            zip=File.createTempFile("diary-download-",".zip",activity.getCacheDir());
            try { if(c.getResponseCode()!=200)throw new IOException("백업을 가져오지 못했어요.");
                try(InputStream input=c.getInputStream();OutputStream out=new FileOutputStream(zip)){byte[] b=new byte[65536];long bytes=0;int n;while((n=input.read(b))!=-1){bytes+=n;if(bytes>1100L*1024*1024)throw new IOException("백업 용량을 초과했어요.");out.write(b,0,n);}}
            }finally{c.disconnect();}
            if(!active())return;
            MessageDigest checksum=MessageDigest.getInstance("SHA-256");
            try(InputStream in=new FileInputStream(zip)){byte[] bytes=new byte[65536];int count;while((count=in.read(bytes))!=-1)checksum.update(bytes,0,count);}
            StringBuilder digest=new StringBuilder();for(byte b:checksum.digest())digest.append(String.format("%02x",b));
            if(!digest.toString().equals(head.getString("sha256")))throw new IOException("백업 파일의 해시가 달라 복구하지 않았어요.");
            try(InputStream in=new FileInputStream(zip)){String imported=attachments.importBackup(in);JSONObject restored=new JSONObject(imported);boolean locked=false;try{locked=new JSONObject(bridge.load()).getJSONObject("settings").optBoolean("lockEnabled",false);}catch(Exception ignored){}restored.getJSONObject("settings").put("lockEnabled",locked);String json=restored.toString();if(!bridge.restoreBackup(json))throw new IOException("복구하지 못했어요. 기존 기록을 보존했어요.");
                prefs.edit().putInt("version",head.getInt("version")).putString("fingerprint",fingerprint(json)).commit();}
            activity.reloadDiary();
        }catch(Exception e){report("error",e.getMessage()==null?"백업을 가져오지 못했어요.":e.getMessage());}finally{if(zip!=null)zip.delete();}
    }
    @JavascriptInterface public void share(String text) {
        if(text==null||text.length()>12000||!active())return;
        activity.runOnUiThread(()->new android.app.AlertDialog.Builder(activity).setTitle("지키미와 이야기할까요?")
            .setMessage("선택한 일기의 글을 지키미 입력창에 첨부해요. 전송 버튼을 눌러야 AI에 전달됩니다.")
            .setNegativeButton("취소",null).setPositiveButton("입력창에 담기",(d,w)->{DiarySession.sharedText=text;activity.finish();}).show());
    }
    @JavascriptInterface public void exit() { activity.runOnUiThread(activity::finish); }
}
