# Membership information and notifications

The customer account shows the active membership tier, subscription price, renewal date, loyalty balance and enabled member benefits. When the customer is not an active member, it shows the available paid plans. The app does not yet provide a membership checkout, so this is an information view.

Configure membership tiers and failed payment messages in **Admin → Settings → Pricing rules & promotions → Membership**. Stripe subscription and invoice webhooks update the membership record. Failed payment, cancellation and recovery events may create in-app, SMS and email notifications according to the switches there.

Configure the SMS gateway in **Admin → Settings → SMS gateway**. It is also used for customer verification and administrator sign-in. A saved gateway can be checked with **Test SMS gateway**; this sends a real message.

Configure SendGrid in the **SendGrid email** section on the same settings page. Enter a verified sender email, sender name and SendGrid API key, then enable delivery and save. Use **Test SendGrid** to confirm a real email. The API key is encrypted in the existing application configuration and is never returned to the browser. Enable **SendGrid email notification** in the Membership settings to send payment notices. SendGrid accepts messages with HTTP 202; inbox delivery should be checked separately. Delivery state and failures are recorded in `customer_notifications`.

SMS and email switches for payment notices are independent. Sending a test does not change a membership. Subscription signup, marketing messages and automatic retries of failed notifications are outside this release.
