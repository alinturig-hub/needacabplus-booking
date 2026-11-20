package app.needacabplus.passenger.testing;
import org.junit.Test;
import static org.junit.Assert.*;
public class VoiceBookingLinkTest {
    @Test public void opensOnlyTheFixedPreview() {
        assertTrue(VoiceBookingLink.accepts("needacabplus-test://booking/voice"));
        for (String input : new String[]{null,"", "https://evil.example/voice", "needacabplus-test://booking/voice?confirm=yes", "needacabplus-test://booking/voice#confirm", "needacabplus-test://user@booking/voice", "needacabplus-test://booking:443/voice", "needacabplus-test://booking/%76oice", "needacabplus-test://auth/complete", "needacabplus-test://booking/voice/../confirm"}) {
            assertFalse(String.valueOf(input), VoiceBookingLink.accepts(input));
        }
        assertEquals("https://webapp.needacabplus.app/voice-booking", VoiceBookingLink.WEB_URL);
    }
}
