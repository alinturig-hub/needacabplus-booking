package app.needacabplus.passenger.testing;

import android.net.Uri;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.widget.Toast;
import android.os.Bundle;
import android.os.Build;
import android.view.ViewGroup;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.webkit.GeolocationPermissions;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private NativeGoogleAuth nativeGoogle;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Uri returnUri = getIntent() == null ? null : getIntent().getData();
        if (NativeGoogleAuth.isReturn(returnUri)) setIntent(new Intent(getIntent()).setData(null));
        super.onCreate(savedInstanceState);
        // Modern edge-to-edge windows need explicit IME resizing. Older Android uses adjustResize.
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
            ViewCompat.setOnApplyWindowInsetsListener(bridge.getWebView(), (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                int bottom = Math.max(bars.bottom, ime.bottom);
                ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
                if (margins.leftMargin != bars.left || margins.topMargin != bars.top
                        || margins.rightMargin != bars.right || margins.bottomMargin != bottom) {
                    margins.setMargins(bars.left, bars.top, bars.right, bottom);
                    view.setLayoutParams(margins);
                }
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(bridge.getWebView());
        }
        nativeGoogle = new NativeGoogleAuth(this, () -> {
            bridge.getWebView().loadUrl("https://webapp.needacabplus.app");
            bridge.getWebView().clearHistory();
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    finish();
                }
            }
        });
        // Start the ENTIRE OAuth flow in one browser, before a WebView cookie is minted.
        // Returning a browser session to this test app still needs a separate secure exchange.
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                boolean oauthStart = "/api/customer/auth/oauth/google".equals(path)
                        || "/api/customer/auth/oauth/apple".equals(path);
                if (request.isForMainFrame() && "https".equals(uri.getScheme())
                        && "webapp.needacabplus.app".equals(uri.getHost()) && oauthStart) {
                    if ("/api/customer/auth/oauth/google".equals(path)) {
                        nativeGoogle.start();
                        return true;
                    }
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch (ActivityNotFoundException unavailable) {
                        Toast.makeText(MainActivity.this, "Use phone sign-in or install a browser.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
        // Keep Capacitor's runtime permission flow, but only grant the passenger origin.
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                Uri uri = Uri.parse(origin);
                if (!"https".equals(uri.getScheme()) || !"webapp.needacabplus.app".equals(uri.getHost())
                        || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getUserInfo() != null) {
                    callback.invoke(origin, false, false);
                    return;
                }
                super.onGeolocationPermissionsShowPrompt(origin, callback);
            }
        });
        if (NativeGoogleAuth.isReturn(returnUri)) nativeGoogle.accept(returnUri);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        if (NativeGoogleAuth.isReturn(intent.getData())) {
            if (nativeGoogle != null) nativeGoogle.accept(intent.getData());
            return; // Never forward the short-lived grant to Capacitor/JavaScript.
        }
        super.onNewIntent(intent);
    }
    @Override
    public void onDestroy() {
        if (nativeGoogle != null) nativeGoogle.close();
        super.onDestroy();
    }
}
