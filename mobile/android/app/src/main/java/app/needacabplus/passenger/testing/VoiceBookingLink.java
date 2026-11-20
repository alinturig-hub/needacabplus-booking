package app.needacabplus.passenger.testing;

import java.net.URI;
import java.net.URISyntaxException;

/** Opens only the preview screen. A link never confirms or dispatches a booking. */
public final class VoiceBookingLink {
    public static final String WEB_URL = "https://webapp.needacabplus.app/voice-booking";
    private VoiceBookingLink() {}
    public static boolean accepts(String value) {
        if (value == null) return false;
        try {
            URI uri = new URI(value);
            return "needacabplus-test".equals(uri.getScheme())
                    && "booking".equals(uri.getHost())
                    && "/voice".equals(uri.getRawPath())
                    && uri.getPort() == -1 && uri.getUserInfo() == null
                    && uri.getRawQuery() == null && uri.getRawFragment() == null;
        } catch (URISyntaxException invalid) {
            return false;
        }
    }
}
