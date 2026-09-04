package com.openbeat.librero;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Finds PDF books on the device's shared storage (Download, Documents, a
 * "Libros" folder, ...) and hands their bytes to the web reader.
 *
 * Android 11+ needs "All files access" (MANAGE_EXTERNAL_STORAGE) to read
 * documents other apps created; older versions use READ_EXTERNAL_STORAGE.
 */
@CapacitorPlugin(
    name = "BookScanner",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }) }
)
public class BookScannerPlugin extends Plugin {

    private static final int MAX_DEPTH = 3;
    private static final long MAX_BYTES = 80L * 1024 * 1024;

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    private void resolveGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", granted());
        call.resolve(result);
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        resolveGranted(call);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (granted()) {
            resolveGranted(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "manageResult");
        } else {
            requestPermissionForAlias("storage", call, "permissionResult");
        }
    }

    @ActivityCallback
    private void manageResult(PluginCall call, ActivityResult result) {
        if (call != null) resolveGranted(call);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        resolveGranted(call);
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!granted()) {
            call.reject("Sin permiso para leer el almacenamiento.");
            return;
        }
        List<String> folders = new ArrayList<>();
        JSArray requested = call.getArray("folders");
        if (requested != null) {
            try {
                for (int i = 0; i < requested.length(); i++) folders.add(requested.getString(i));
            } catch (JSONException e) {
                call.reject("Lista de carpetas no válida.");
                return;
            }
        }
        if (folders.isEmpty()) {
            folders.add("Download");
            folders.add("Documents");
            folders.add("Libros");
        }

        List<File> roots = new ArrayList<>();
        File external = Environment.getExternalStorageDirectory();
        for (String name : folders) {
            roots.add(new File(external, name));
        }
        roots.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS));
        roots.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS));

        List<File> found = new ArrayList<>();
        List<String> seen = new ArrayList<>();
        for (File root : roots) {
            if (root != null && root.isDirectory()) walk(root, 0, found, seen);
        }
        Collections.sort(found, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));

        JSArray files = new JSArray();
        for (File f : found) {
            JSObject item = new JSObject();
            item.put("path", f.getAbsolutePath());
            item.put("name", f.getName());
            item.put("size", f.length());
            item.put("modified", f.lastModified());
            files.put(item);
        }
        JSObject result = new JSObject();
        result.put("files", files);
        call.resolve(result);
    }

    private void walk(File dir, int depth, List<File> found, List<String> seen) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) {
                if (depth < MAX_DEPTH && !child.getName().startsWith(".")) walk(child, depth + 1, found, seen);
            } else if (child.getName().toLowerCase(Locale.ROOT).endsWith(".pdf") && child.length() > 0) {
                String path = child.getAbsolutePath();
                if (!seen.contains(path)) {
                    seen.add(path);
                    found.add(child);
                }
            }
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Falta la ruta del archivo.");
            return;
        }
        File file = new File(path);
        if (!file.isFile()) {
            call.reject("El archivo ya no existe.");
            return;
        }
        if (file.length() > MAX_BYTES) {
            call.reject("El PDF es demasiado grande (más de 80 MB).");
            return;
        }
        try (InputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int n = in.read(bytes, offset, bytes.length - offset);
                if (n < 0) break;
                offset += n;
            }
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(bytes, 0, offset, Base64.NO_WRAP));
            call.resolve(result);
        } catch (IOException e) {
            call.reject("No se pudo leer el archivo: " + e.getMessage());
        }
    }
}
