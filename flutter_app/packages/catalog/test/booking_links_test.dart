import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

/// `flutter_app/README.md` requires `lamsa://booking/<uuid>` and
/// `data.bookingId` to share one identifier rule. Both notification screens
/// therefore guard on `isValidBookingId` alone: if the two ever disagree, a
/// payload could open something the link contract would have rejected.
void main() {
  const accepted = [
    '11111111-1111-4111-8111-111111111111',
    'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',
    'a0b1c2d3-e4f5-4a6b-8c7d-8e9f0a1b2c3d',
  ];
  const rejected = [
    '',
    '   ',
    'not-a-uuid',
    'b1',
    '11111111-1111-4111-8111-11111111111',
    '11111111-1111-4111-8111-1111111111111',
    '11111111111141118111111111111111',
    '11111111-1111-4111-8111-11111111111g',
    '11111111_1111_4111_8111_111111111111',
    '../../admin',
    'null',
  ];

  test('accepts every identifier the booking deep link accepts', () {
    for (final id in accepted) {
      expect(
        isValidBookingId(id),
        isTrue,
        reason: 'expected the deep-link contract to accept $id',
      );
      expect(
        parseBookingLink(
          Uri(scheme: 'lamsa', host: 'booking', pathSegments: [id]),
        )?.bookingId,
        id,
      );
    }
  });

  test('rejects everything the booking deep link rejects', () {
    for (final id in rejected) {
      expect(
        isValidBookingId(id),
        isFalse,
        reason: 'expected a payload id to be rejected: "$id"',
      );
      expect(
        parseBookingLink(
          Uri(scheme: 'lamsa', host: 'booking', pathSegments: [id]),
        ),
        isNull,
        reason: 'the link and the payload must agree on "$id"',
      );
    }
  });

  test('a booking id is never taken from another host or shape', () {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseBookingLink(Uri.parse('https://booking/$id')), isNull);
    expect(parseBookingLink(Uri.parse('lamsa://admin/$id')), isNull);
    expect(parseBookingLink(Uri.parse('lamsa://booking/$id/extra')), isNull);
    expect(
      parseBookingLink(Uri.parse('lamsa://booking/$id?status=completed')),
      isNull,
    );
    // A query string cannot smuggle a state the app would then trust.
    expect(isValidBookingId(id), isTrue);
  });
}
