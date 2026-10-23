package com.ourhangout.diary;
import com.ourhangout.R;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Range metadata for WebView; its Android stream loader performs the actual seek. */
final class MediaRange {
    final long start, end, total;
    final boolean partial, valid;
    private MediaRange(long start, long end, long total, boolean partial, boolean valid) {
        this.start = start; this.end = end; this.total = total; this.partial = partial; this.valid = valid;
    }
    static MediaRange parse(String header, long total) {
        if (header == null) return new MediaRange(0, total - 1, total, false, true);
        Matcher match = Pattern.compile("bytes=(\\d*)-(\\d*)", Pattern.CASE_INSENSITIVE).matcher(header.trim());
        if (!match.matches() || (match.group(1).isEmpty() && match.group(2).isEmpty()))
            return new MediaRange(0, total - 1, total, false, true);
        long start, end;
        if (match.group(1).isEmpty()) {
            long suffix = number(match.group(2));
            if (suffix == 0 || total == 0) return new MediaRange(0, -1, total, true, false);
            start = Math.max(0, total - suffix); end = total - 1;
        } else {
            start = number(match.group(1));
            end = match.group(2).isEmpty() ? total - 1 : Math.min(total - 1, number(match.group(2)));
        }
        return new MediaRange(start, end, total, true, total > 0 && start < total && end >= start);
    }
    private static long number(String digits) {
        long value = 0;
        for (int i = 0; i < digits.length(); i++) {
            int digit = digits.charAt(i) - '0';
            if (value > (Long.MAX_VALUE - digit) / 10) return Long.MAX_VALUE;
            value = value * 10 + digit;
        }
        return value;
    }
    String contentRange() { return "bytes " + start + "-" + end + "/" + total; }
    FileInputStream openStream(File file) throws IOException {
        // Chromium calls InputStreamReader.Seek(request Range) itself, before applying
        // WebResourceResponse headers. Pre-seeking here makes tail requests seek twice.
        // Keep available() equal to the complete file size until Chromium seeks it.
        return new FileInputStream(file);
    }
}
