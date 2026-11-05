package app.needacabplus.passenger.testing;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

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
