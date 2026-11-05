package app.needacabplus.passenger.testing;

import android.net.Uri;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.widget.Toast;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
    }
}
