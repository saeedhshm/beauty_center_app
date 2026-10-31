import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

/// Push routing and session gating.
///
/// The payload is never trusted: it may only carry a reference. Session
/// restore, role, and ownership decide whether anything opens.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const bookingId = '11111111-1111-4111-8111-111111111111';

  test('a well-formed approved payload routes to the booking', () {
    final destination = pushDestinationFromData({
      'type': 'booking_confirmed',
      'bookingId': bookingId,
    });

    expect(destination, isA<BookingPushDestination>());
    expect((destination! as BookingPushDestination).bookingId, bookingId);
  });

  test('invalid payloads are dropped instead of guessed', () {
    final cases = <Map<Object?, Object?>>[
      {},
      {'bookingId': 'not-a-uuid'},
      {'bookingId': ''},
      {'bookingId': 42},
      {'bookingId': '$bookingId/../other'},
      {'bookingId': bookingId, 'type': 'marketing_campaign'},
      {'type': 'booking_confirmed'},
    ];

    for (final data in cases) {
      expect(
        pushDestinationFromData(data),
        isNull,
        reason: 'payload $data must not route',
      );
    }

    // An unapproved message type never routes, even with a valid id, whether
    // the type arrives on the envelope or inside the data.
    expect(
      resolvePushDestination(type: 'spam', data: {'bookingId': bookingId}),
      isNull,
    );
    expect(
      pushDestinationFromData({'type': 'spam', 'bookingId': bookingId}),
      isNull,
    );
    expect(
      resolvePushDestination(
        type: 'booking_completed',
        data: {'bookingId': bookingId},
      ),
      isA<BookingPushDestination>(),
    );
  });

  test('the deep link and the push payload share one id rule', () {
    expect(
      parseBookingLink(Uri.parse('lamsa://booking/$bookingId'))?.bookingId,
      bookingId,
    );
    expect(parseBookingLink(Uri.parse('lamsa://booking/nope')), isNull);
    expect(isValidBookingId(bookingId), isTrue);
    expect(isValidBookingId('nope'), isFalse);
  });
}
