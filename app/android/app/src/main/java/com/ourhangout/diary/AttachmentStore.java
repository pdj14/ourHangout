package com.ourhangout.diary;
import com.ourhangout.R;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.zip.*;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Authenticated, chunked media vault. Media never lives in the diary JSON or public storage. */
final class AttachmentStore {
    static final long MAX_FILE = 128L * 1024 * 1024;
    static final long MAX_ARCHIVE = 1024L * 1024 * 1024;
    private static final int CHUNK = 64 * 1024;
    interface KeySource { SecretKey key() throws Exception; }
    private final File root, cache;
    private final KeySource keys;
    AttachmentStore(File files, File cacheRoot, KeySource keys) {
        root = new File(files, "attachments"); cache = new File(cacheRoot, "attachment-preview"); this.keys = keys;
        root.mkdirs(); cache.mkdirs();
        File[] old = cache.listFiles();
        if (old != null) for (File file : old) if (System.currentTimeMillis() - file.lastModified() > 3600000) file.delete();
    }
    static boolean validId(String id) { return id != null && id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"); }
    private File media(File folder, String id) throws Exception {
        if (!validId(id)) throw new IOException("Invalid attachment id");
        return new File(folder, id + ".media");
    }
    private File meta(File folder, String id) throws Exception { media(folder, id); return new File(folder, id + ".meta"); }
    private static String safeName(String name) {
        if (name == null || name.trim().isEmpty()) return "첨부 파일";
        return name.replaceAll("[\\p{Cntrl}/\\\\]", "_").substring(0, Math.min(name.length(), 240));
    }
    static String kind(String mime) {
        return mime.equals("image/svg+xml") ? "file" : mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "file";
    }
    synchronized JSONObject add(ContentResolver resolver, Uri uri, String expectedKind) throws Exception {
        String mime = resolver.getType(uri);
        if (mime == null || !mime.matches("[A-Za-z0-9.+_-]+/[A-Za-z0-9.+_-]+")) mime = "application/octet-stream";
        if (!"file".equals(expectedKind) && !expectedKind.equals(kind(mime))) throw new IOException("Unexpected file type");
        String name = "첨부 파일";
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                name = cursor.getString(0);
                if (!cursor.isNull(1) && cursor.getLong(1) > MAX_FILE) throw new IOException("File exceeds 128 MB");
            }
        }
        try (InputStream input = resolver.openInputStream(uri)) { return add(input, safeName(name), mime); }
    }
    synchronized JSONObject add(InputStream input, String name, String mime) throws Exception {
        String id = UUID.randomUUID().toString();
        JSONObject description = new JSONObject();
        try {
            encrypt(input, media(root, id), id, description);
            description.put("id", id).put("name", safeName(name)).put("mime", mime).put("kind", kind(mime));
            description.put("url", "https://diary.local/media/" + id);
            writeMeta(root, id, description);
            return description;
        } catch (Exception error) { media(root, id).delete(); meta(root, id).delete(); throw error; }
    }
    private void encrypt(InputStream input, File target, String id, JSONObject details) throws Exception {
        if (input == null) throw new IOException("No input");
        SecretKey key = keys.key();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long total = 0; int index = 0;
        File temporary = new File(target + ".new");
        try (FileOutputStream file = new FileOutputStream(temporary); DataOutputStream output = new DataOutputStream(file)) {
            output.writeInt(0x4d454432); // MED2
            byte[] buffer = new byte[CHUNK];
            while (true) {
                int count = 0, read;
                while (count < buffer.length && (read = input.read(buffer, count, buffer.length - count)) != -1) count += read;
                total += count;
                if (total > MAX_FILE) throw new IOException("File exceeds 128 MB");
                digest.update(buffer, 0, count);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key);
                cipher.updateAAD((id + ":" + index++).getBytes(StandardCharsets.UTF_8));
                byte[] encrypted = cipher.doFinal(buffer, 0, count);
                output.writeInt(count); output.write(cipher.getIV()); output.write(encrypted);
                if (count == 0) break;
            }
            output.flush(); file.getFD().sync();
        } catch (Exception error) { temporary.delete(); throw error; }
        if (!temporary.renameTo(target)) { temporary.delete(); throw new IOException("Cannot commit media"); }
        details.put("size", total).put("sha256", hex(digest.digest()));
    }
    private static String hex(byte[] bytes) { StringBuilder result = new StringBuilder(); for (byte b : bytes) result.append(String.format(Locale.US, "%02x", b & 255)); return result.toString(); }
    private void decrypt(File source, String id, OutputStream output, JSONObject expected) throws Exception {
        SecretKey key = keys.key();
        MessageDigest digest = MessageDigest.getInstance("SHA-256"); long total = 0; int index = 0;
        try (DataInputStream input = new DataInputStream(new FileInputStream(source))) {
            if (input.readInt() != 0x4d454432) throw new IOException("Invalid media header");
            while (true) {
                int size = input.readInt();
                if (size < 0 || size > CHUNK || total + size > MAX_FILE) throw new IOException("Invalid media chunk");
                byte[] iv = new byte[12], encrypted = new byte[size + 16]; input.readFully(iv); input.readFully(encrypted);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
                cipher.updateAAD((id + ":" + index++).getBytes(StandardCharsets.UTF_8));
                byte[] clear = cipher.doFinal(encrypted);
                total += clear.length; digest.update(clear); output.write(clear);
                if (size == 0) { if (input.read() != -1) throw new IOException("Trailing media data"); break; }
            }
        }
        if (total != expected.getLong("size") || !hex(digest.digest()).equals(expected.getString("sha256"))) throw new IOException("Media checksum mismatch");
    }
    private void writeMeta(File folder, String id, JSONObject details) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, keys.key());
        cipher.updateAAD((id + ":meta").getBytes(StandardCharsets.UTF_8));
        try (FileOutputStream output = new FileOutputStream(meta(folder, id))) {
            output.write(cipher.getIV()); output.write(cipher.doFinal(details.toString().getBytes(StandardCharsets.UTF_8))); output.getFD().sync();
        }
    }
    private JSONObject readMeta(String id) throws Exception {
        byte[] bytes;
        try (InputStream input = new FileInputStream(meta(root, id))) { bytes = bounded(input, 32768); }
        if (bytes.length < 28) throw new IOException("Invalid media metadata");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, keys.key(), new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12)));
        cipher.updateAAD((id + ":meta").getBytes(StandardCharsets.UTF_8));
        return new JSONObject(new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)), StandardCharsets.UTF_8));
    }
    synchronized File preview(String id) throws Exception {
        JSONObject details = readMeta(id);
        File result = new File(cache, id);
        if (result.exists() && result.length() == details.getLong("size")) { result.setLastModified(System.currentTimeMillis()); return result; }
        File temporary = new File(cache, id + ".new");
        try (FileOutputStream output = new FileOutputStream(temporary)) { decrypt(media(root, id), id, output, details); }
        catch (Exception error) { temporary.delete(); throw error; }
        if (!temporary.renameTo(result)) throw new IOException("Cannot prepare media");
        return result;
    }
    synchronized JSONObject description(String id) throws Exception { return readMeta(id); }
    synchronized WebResourceResponse response(String id, Map<String, String> requestHeaders) throws Exception {
        JSONObject details = readMeta(id); File file = preview(id);
        String mime = details.getString("mime");
        // Generic documents are never interpreted as active HTML inside the trusted WebView.
        if (!(mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/"))) throw new IOException("Use external viewer");
        if (mime.equals("image/svg+xml")) throw new IOException("Active image type");
        String header = requestHeaders.get("Range"); if (header == null) header = requestHeaders.get("range");
        MediaRange range = MediaRange.parse(header, file.length());
        if (!range.valid) return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", Collections.singletonMap("Content-Range", "bytes */" + file.length()), new ByteArrayInputStream(new byte[0]));
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes"); headers.put("Cache-Control", "no-store");
        headers.put("Access-Control-Allow-Origin", "*"); headers.put("X-Content-Type-Options", "nosniff");
        if (range.partial) headers.put("Content-Range", range.contentRange());
        // WebView synthesizes Content-Length from stream.available() and the request
        // range. Supplying it again produces duplicate headers; return an unseeked
        // stream so WebView can calculate the length and skip exactly once.
        return new WebResourceResponse(mime, null, range.partial ? 206 : 200,
            range.partial ? "Partial Content" : "OK", headers, range.openStream(file));
    }

    static Map<String, JSONObject> references(JSONObject diary) throws Exception {
        Map<String, JSONObject> found = new LinkedHashMap<>();
        JSONArray entries = diary.getJSONArray("entries");
        if (entries.length() > 20000) throw new IOException("Too many entries");
        for (int i = 0; i < entries.length(); i++) collect(entries.getJSONObject(i), found);
        JSONArray trash = diary.optJSONArray("trash");
        if (trash != null) { if (trash.length() > 20000) throw new IOException("Too many deleted entries"); for (int i = 0; i < trash.length(); i++) collect(trash.getJSONObject(i), found); }
        if (diary.optJSONObject("draft") != null) collect(diary.getJSONObject("draft"), found);
        if (found.size() > 20000) throw new IOException("Too many attachments");
        return found;
    }
    private static void collect(JSONObject entry, Map<String, JSONObject> found) throws Exception {
        JSONArray array = entry.optJSONArray("attachments"); if (array == null) return;
        if (array.length() > 100) throw new IOException("Too many attachments in entry");
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.getJSONObject(i); String id = item.getString("id");
            if (!validId(id)) throw new IOException("Invalid attachment reference");
            if (item.optLong("size", -1) < 0 || item.getLong("size") > MAX_FILE) throw new IOException("Invalid attachment size");
            if (found.containsKey(id) && found.get(id).getLong("size") != item.getLong("size")) throw new IOException("Inconsistent media reference");
            found.put(id, item);
        }
    }
    synchronized void exportBackup(JSONObject diary, OutputStream target) throws Exception {
        Map<String, JSONObject> refs = references(diary); long total = 0;
        for (String id : refs.keySet()) { total += readMeta(id).getLong("size"); if (total > MAX_ARCHIVE) throw new IOException("Archive exceeds 1 GB"); }
        try (ZipOutputStream output = new ZipOutputStream(target)) {
            output.setLevel(Deflater.BEST_SPEED);
            output.putNextEntry(new ZipEntry("diary.json")); output.write(diary.toString().getBytes(StandardCharsets.UTF_8)); output.closeEntry();
            for (String id : refs.keySet()) {
                output.putNextEntry(new ZipEntry("media/" + id)); decrypt(media(root, id), id, output, readMeta(id)); output.closeEntry();
            }
        }
    }
    synchronized String importBackup(InputStream raw) throws Exception {
        PushbackInputStream input = new PushbackInputStream(raw, 4); byte[] prefix = new byte[4]; int n = 0, read; while (n < 4 && (read = input.read(prefix, n, 4 - n)) > 0) n += read; if (n > 0) input.unread(prefix, 0, n);
        if (n < 4 || prefix[0] != 'P' || prefix[1] != 'K') {
            String json = new String(bounded(input, 40 * 1024 * 1024), StandardCharsets.UTF_8);
            verifyReferences(new JSONObject(json)); return json;
        }
        File staging = new File(root, "import-" + UUID.randomUUID()); if (!staging.mkdir()) throw new IOException("Cannot stage import");
        try {
            String json = null; long total = 0; Set<String> names = new HashSet<>(); Map<String, JSONObject> imported = new HashMap<>();
            try (ZipInputStream zip = new ZipInputStream(input)) {
                ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    String path = entry.getName();
                    if (!names.add(path) || names.size() > 20001 || entry.isDirectory()) throw new IOException("Invalid archive entry");
                    if (path.equals("diary.json")) json = new String(bounded(zip, 40 * 1024 * 1024), StandardCharsets.UTF_8);
                    else if (path.startsWith("media/") && validId(path.substring(6))) {
                        String id = path.substring(6); JSONObject result = new JSONObject();
                        encrypt(zip, media(staging, id), id, result); total += result.getLong("size"); imported.put(id, result);
                        if (total > MAX_ARCHIVE) throw new IOException("Archive exceeds 1 GB");
                    } else throw new IOException("Unexpected archive path");
                    zip.closeEntry();
                }
            }
            if (json == null) throw new IOException("Missing diary.json");
            JSONObject diary = new JSONObject(json);
            if (diary.optInt("schema", -1) != 1 || diary.optJSONObject("settings") == null) throw new IOException("Unsupported diary");
            Map<String, JSONObject> refs = references(diary);
            if (!refs.keySet().equals(imported.keySet())) throw new IOException("Incomplete archive");
            for (String id : refs.keySet()) {
                JSONObject reference = refs.get(id), actual = imported.get(id);
                if (reference.getLong("size") != actual.getLong("size")) throw new IOException("Attachment size mismatch");
                if (reference.has("sha256") && !reference.getString("sha256").equals(actual.getString("sha256"))) throw new IOException("Attachment checksum mismatch");
                String mime = reference.getString("mime"); if (!mime.matches("[A-Za-z0-9.+_-]+/[A-Za-z0-9.+_-]+")) throw new IOException("Invalid MIME");
                actual.put("id", id).put("name", safeName(reference.getString("name"))).put("mime", mime).put("kind", kind(mime)).put("url", "https://diary.local/media/" + id);
                writeMeta(staging, id, actual);
                if (media(root, id).exists()) {
                    JSONObject existing = readMeta(id);
                    if (!existing.getString("sha256").equals(actual.getString("sha256"))) throw new IOException("Attachment id conflict");
                }
            }
            // Only after every entry validates do immutable media objects enter the vault.
            for (String id : refs.keySet()) {
                if (!media(root, id).exists()) {
                    if (!meta(staging, id).renameTo(meta(root, id)) || !media(staging, id).renameTo(media(root, id))) throw new IOException("Cannot commit imported media");
                }
            }
            return json;
        } finally { File[] files = staging.listFiles(); if (files != null) for (File file : files) file.delete(); staging.delete(); }
    }
    /** Deletes only explicit, permanently removed candidates after rechecking the saved diary. */
    synchronized void deleteUnreferenced(JSONArray candidates, JSONObject persistedDiary) throws Exception {
        Set<String> retained = references(persistedDiary).keySet();
        if (candidates.length() > 20000) throw new IOException("Too many deletion candidates");
        Set<String> removed = new HashSet<>();
        // Validate the entire request before deleting any candidate.
        for (int i = 0; i < candidates.length(); i++) {
            String id = candidates.getString(i);
            if (!validId(id)) throw new IOException("Invalid deletion candidate");
            if (!retained.contains(id)) removed.add(id);
        }
        boolean failed = false;
        for (String id : removed) {
            File[] files = {media(root, id), meta(root, id), new File(cache, id)};
            for (File file : files) if (file.exists() && !file.delete()) failed = true;
        }
        if (failed) throw new IOException("Cannot remove some attachment files");
    }
    synchronized void verifyReferences(JSONObject diary) throws Exception {
        for (Map.Entry<String, JSONObject> reference : references(diary).entrySet()) {
            JSONObject actual = readMeta(reference.getKey());
            if (!media(root, reference.getKey()).exists() || reference.getValue().getLong("size") != actual.getLong("size")) throw new IOException("Missing or invalid media");
        }
    }
    private static byte[] bounded(InputStream input, int max) throws Exception {
        if (input == null) throw new IOException("No input"); ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[16384]; int n, size = 0;
        while ((n = input.read(buffer)) != -1) { size += n; if (size > max) throw new IOException("Oversized file"); output.write(buffer, 0, n); } return output.toByteArray();
    }
}
