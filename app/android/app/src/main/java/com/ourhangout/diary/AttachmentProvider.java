package com.ourhangout.diary;
import com.ourhangout.R;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** One-file, read-only grants for an explicitly selected external viewer. */
public final class AttachmentProvider extends ContentProvider {
    private static final class Grant {
        final File file; final String name, mime;
        Grant(File file, String name, String mime) { this.file = file; this.name = name; this.mime = mime; }
    }
    private static final ConcurrentHashMap<String, Grant> grants = new ConcurrentHashMap<>();
    static Uri grant(File file, String name, String mime) {
        String token = UUID.randomUUID().toString(); grants.put(token, new Grant(file, name, mime));
        return Uri.parse("content://com.ourhangout.diary.attachments/" + token);
    }
    private Grant find(Uri uri) {
        if (!"com.ourhangout.diary.attachments".equals(uri.getAuthority()) || uri.getPathSegments().size() != 1) return null;
        return grants.get(uri.getLastPathSegment());
    }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { Grant grant = find(uri); return grant == null ? "application/octet-stream" : grant.mime; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        Grant grant = find(uri); if (grant == null) return null;
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns); Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) row[i] = OpenableColumns.DISPLAY_NAME.equals(columns[i]) ? grant.name : OpenableColumns.SIZE.equals(columns[i]) ? grant.file.length() : null;
        cursor.addRow(row); return cursor;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Grant grant = find(uri); if (grant == null || !"r".equals(mode)) throw new FileNotFoundException("Read-only attachment");
        return ParcelFileDescriptor.open(grant.file, ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
