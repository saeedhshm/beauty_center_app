/// Internal deep-link router (A8 partial).
///
/// Parses `lamsa://booking/<id>` links. The router never mutates state from a
/// payload and never trusts it: callers must verify the session, role, and
/// ownership, then fetch the current resource from the API before display.
/// Ownership of another user's resource stays a server 404.
class BookingDeepLink {
  const BookingDeepLink({required this.bookingId});

  final String bookingId;
}

/// Returns the booking link target, or null for anything unsupported.
/// Supported forms: `lamsa://booking/<uuid>`.
BookingDeepLink? parseBookingLink(Uri uri) {
  if (uri.scheme != 'lamsa') return null;
  if (uri.host != 'booking') return null;
  final segments = uri.pathSegments.where((item) => item.isNotEmpty).toList();
  if (segments.length != 1) return null;
  final id = segments.first;
  if (!_isUuid(id)) return null;
  if (uri.queryParameters.isNotEmpty) return null;
  return BookingDeepLink(bookingId: id);
}

/// The single UUID rule shared by deep links and push payloads, so both
/// accept exactly the same identifiers.
bool isValidBookingId(String value) => _isUuid(value);

bool _isUuid(String value) => RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
).hasMatch(value);
