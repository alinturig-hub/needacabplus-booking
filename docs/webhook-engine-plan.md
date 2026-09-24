# Need A Cab Plus — Webhook Engine plan

This document records the agreed product direction for the webhook system. UChat was discussed only as an example and is **not** part of the planned integration.

## Domains and responsibilities

- `webhook.needacabplus.app` receives events and API data from Autocab.
- `inbound.needacabplus.app` receives events from external systems and Need A Cab Plus applications.
- Both inputs use the same internal event engine, event schema, and central event/data store.
- Autocab event names are based on what Autocab can send. Inbound event names are defined by Need A Cab Plus.

## Shared event envelope

```json
{
  "event_id": "evt_01K...",
  "event": "booking.created",
  "source": "autocab",
  "received_at": "2026-09-24T13:35:22Z",
  "external_id": "AC-839201",
  "data": {}
}
```

The processing pipeline is:

1. Receive the original request.
2. Authenticate and validate the source.
3. Save the raw request for audit and debugging.
4. Map source fields into the Need A Cab Plus schema.
5. Store normalized booking and event data.
6. Process and trigger downstream actions.

The delivery layer must support idempotency, retries, delivery status, and replay so temporary failures do not lose events.

## Initial events

- `booking.created`
- `booking.updated`
- `booking.cancelled`
- `booking.confirmed`
- `driver.assigned`
- `driver.en_route`
- `driver.arrived`
- `passenger.on_board`
- `trip.started`
- `booking.completed`
- `booking.changed`
- `customer.updated`
- `payment.received`
- `message.received`

The first complete event to implement is `booking.created`:

`receive → raw payload → mapping → normalized data → database → log`

## Central data store

The planned store contains at least:

- `raw_events`
- `booking_events`
- `bookings`
- `customers`
- `drivers`
- `vehicles`
- `delivery_attempts`

## Admin panel

Add **Integrations → Webhooks** to the admin panel with two areas:

- Autocab Webhooks — `webhook.needacabplus.app`
- Inbound Webhooks — `inbound.needacabplus.app`

Each area shows status, event count, most recent event, events received today, and a Manage Events action.

The event list shows event name, status, last received time, and today's count. Each event opens a detail screen with:

- Overview
- Payload
- Mapping
- Logs
- Settings
- Replay Event

Logs retain the original request, normalized result, processing status, timestamp, HTTP method, event ID, source, and validation/processing error.

Field mapping decouples Autocab payload names from the internal schema. Example mappings:

- `bookingId` → `booking.external_id`
- `telephone` → `customer.phone`
- `name` → `customer.name`
- `pickup.address` → `journey.pickup.address`
- `destination.address` → `journey.destination.address`
- `pickupTime` → `journey.pickup_at`
- `driver.id` → `driver.external_id`
- `vehicle.registration` → `vehicle.registration`

## First implementation milestone

1. Build the Webhooks overview page in the admin panel.
2. Build the Autocab event list and event detail views.
3. Implement `booking.created` end to end.
4. Reuse the engine for the remaining events.
