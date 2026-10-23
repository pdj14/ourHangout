package com.ourhangout.diary;

import android.content.Intent;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.*;
import com.facebook.react.uimanager.ViewManager;
import java.util.*;

public final class DiaryPackage implements ReactPackage {
    @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) { return Collections.singletonList(new Module(context)); }
    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }
    public static final class Module extends ReactContextBaseJavaModule {
        Module(ReactApplicationContext context) { super(context); }
        @Override public String getName() { return "OurHangoutDiary"; }
        @ReactMethod public void open(String userId,String baseUrl,String token,boolean compose,Promise promise) {
            try { DiarySession.configure(userId,baseUrl,token);
                Intent intent=new Intent(getReactApplicationContext(),MainActivity.class).putExtra("compose",compose).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent); promise.resolve(true);
            } catch(Exception e) { promise.reject("DIARY_OPEN", "일기를 열지 못했어요. 로그인과 앱 버전을 확인해 주세요.",e); }
        }
        @ReactMethod public void consumeSharedDiary(Promise promise) { String text=DiarySession.sharedText; DiarySession.sharedText=""; promise.resolve(text); }
        @ReactMethod public void clearSession(Promise promise) { DiarySession.clear(); promise.resolve(true); }
    }
}
