package com.ourhangout.diary;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Process-local auth only. A restored Activity must return through the signed-in app. */
public final class DiarySession {
    static volatile String userId = "", baseUrl = "", token = "", account = "", sharedText = "";
    static synchronized void configure(String user, String base, String access) throws Exception {
        if (!user.matches("[a-fA-F0-9-]{36}") || !base.matches("https?://.+") || access.isEmpty()) throw new IllegalArgumentException("로그인 연결을 확인해 주세요.");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest((base + ":" + user).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(); for(byte b:digest) hex.append(String.format("%02x", b));
        if(!account.equals(hex.toString()))sharedText="";
        userId=user; baseUrl=base.replaceAll("/+$", ""); token=access; account=hex.toString();
    }
    static synchronized void clear() { userId="";baseUrl="";token="";account="";sharedText=""; }
    static String keyAlias() { return "ourhangout.diary." + account; }
}
