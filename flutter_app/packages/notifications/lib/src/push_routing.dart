import 'package:lamsa_catalog/lamsa_catalog.dart';

/// A push payload reduced to a reference the app may act on.
///
/// Nothing here is trusted as state: a destination is only an id, and the app
/// still verifies the session, the role, and the ownership of the resource
/// before showing anything.
sealed class PushDestination {
  const PushDestination();
}

/// The referenced booking. The app must open it through the booking API so a
/// resource that is not the user's stays a server-side 404.
class BookingPushDestination extends PushDestination {
  const BookingPushDestination(this.bookingId);

  final String bookingId;
}

/// Push events approved to open a resource (APPS_README A8). Anything outside
/// this set is received but not routed.
const approvedPushEvents = <String>{
  'booking_requested',
  'booking_accepted',
  'booking_rejected',
  'booking_cancelled',
  'booking_confirmed',
  'booking_completed',
  'booking_expired',
  'review_received',
};

/// Resolves the destination for a received message.
///
/// Contract (see `web_app/backend/docs/engagement.md`): the server stores
/// `data.bookingId` and an approved event type. [type] is the message type
/// when the provider supplied one; a type outside [approvedPushEvents] is not
/// routed even if the data carries a well-formed id, because the type decides
/// whether this event may open anything at all.
///
/// A payload with no usable booking id, a malformed one, or an unapproved type
/// yields null so the caller ignores it instead of guessing.
PushDestination? resolvePushDestination({
  String? type,
  required Map<Object?, Object?> data,
}) {
  final effective =
      type ?? (data['type'] is String ? data['type'] as String? : null);
  if (effective != null && !approvedPushEvents.contains(effective)) return null;

  final rawId = data['bookingId'];
  if (rawId is! String) return null;
  final id = rawId.trim();
  if (!isValidBookingId(id)) return null;
  return BookingPushDestination(id);
}

/// Data-only helper used by the background isolate, which has no envelope.
PushDestination? pushDestinationFromData(Map<Object?, Object?> data) =>
    resolvePushDestination(data: data);
