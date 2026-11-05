package app.needacabplus.passenger.testing;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import android.webkit.CookieManager;
import android.widget.Toast;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** PKCE-bound one-use bootstrap. No session token travels through an intent or JavaScript. */
final class NativeGoogleAuth {
    interface Completion { void ready(); }
    private static final String ORIGIN = "https://webapp.needacabplus.app";
    private static final String FORMAT = "[A-Za-z0-9_-]{43}";
    private final Activity activity;
    private final SharedPreferences pending;
    private final Completion completion;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean exchanging;

    NativeGoogleAuth(Activity activity, Completion completion) {
        this.activity = activity;
        this.completion = completion;
        this.pending = activity.getSharedPreferences("nac_native_google_v1", Activity.MODE_PRIVATE);
    }
    static boolean isReturn(Uri uri) {
        return uri != null && "needacabplus-test".equals(uri.getScheme())
                && "auth".equals(uri.getHost()) && "/complete".equals(uri.getPath());
    }
    private static String random() {
        byte[] value = new byte[32]; new SecureRandom().nextBytes(value);
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }
    void start() {
        if (exchanging) return;
        try {
            String verifier = random(), state = random();
            String challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)), Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            if (!pending.edit().clear().putString("verifier", verifier).putString("state", state).putLong("created", System.currentTimeMillis()).commit()) throw new IllegalStateException();
            Uri url = Uri.parse(ORIGIN + "/api/customer/auth/oauth/google").buildUpon()
                    .appendQueryParameter("native_challenge", challenge).appendQueryParameter("native_state", state).build();
            activity.startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (Exception unavailable) {
            pending.edit().clear().apply();
            Toast.makeText(activity, "Google sign-in could not start. Try phone sign-in.", Toast.LENGTH_LONG).show();
        }
    }
    void accept(Uri uri) {
        if (!isReturn(uri) || exchanging) return;
        String code = uri.getQueryParameter("code"), state = uri.getQueryParameter("state");
        String expected = pending.getString("state", ""), verifier = pending.getString("verifier", "");
        long age = System.currentTimeMillis() - pending.getLong("created", 0);
        if (code == null || state == null || !code.matches(FORMAT) || !state.matches(FORMAT)
                || !verifier.matches(FORMAT) || age < 0 || age > 600000
                || !MessageDigest.isEqual(state.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII))) {
            Toast.makeText(activity, "Start Google sign-in again from this app.", Toast.LENGTH_LONG).show(); return;
        }
        exchanging = true;
        worker.execute(() -> {
            HttpsURLConnection connection = null;
            String cookie = null;
            try {
                byte[] body = new JSONObject().put("code", code).put("state", state).put("verifier", verifier).toString().getBytes(StandardCharsets.UTF_8);
                connection = (HttpsURLConnection) new URL(ORIGIN + "/api/customer/auth/native/exchange").openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
                connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Connection", "close"); connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
                if (connection.getResponseCode() != 200) throw new IllegalStateException();
                for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                    if ("Set-Cookie".equalsIgnoreCase(header.getKey())) {
                        for (String value : header.getValue()) if (value.startsWith("nac_customer_session=")) cookie = value;
                    }
                }
                if (cookie == null) throw new IllegalStateException();
            } catch (Exception unknownOrRejected) {
                cookie = null; // No retry after a possibly consumed one-use grant.
            } finally {
                if (connection != null) connection.disconnect();
            }
            final String sessionCookie = cookie;
            activity.runOnUiThread(() -> {
                pending.edit().clear().apply();
                if (activity.isDestroyed() || activity.isFinishing()) { exchanging = false; return; }
                if (sessionCookie == null) {
                    exchanging = false;
                    Toast.makeText(activity, "App sign-in expired or could not finish. Start Google sign-in again.", Toast.LENGTH_LONG).show();
                    return;
                }
                CookieManager cookies = CookieManager.getInstance(); cookies.setAcceptCookie(true);
                cookies.setCookie(ORIGIN, sessionCookie, accepted -> {
                    exchanging = false;
                    if (accepted) { cookies.flush(); completion.ready(); }
                    else Toast.makeText(activity, "App could not save sign-in. Please try again.", Toast.LENGTH_LONG).show();
                });
            });
        });
    }
    void close() { worker.shutdownNow(); }
}
