import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

void main() {
  test('notification keeps booking reference and read state', () {
    final item = AppNotification.fromJson({
      'id': 'n1',
      'type': 'booking.accepted',
      'title': 'قُبل طلبك',
      'body': 'تفاصيل',
      'data': {'bookingId': 'b1'},
      'readAt': null,
      'createdAt': '2026-10-14T06:00:00.000Z',
    });
    expect(item.bookingId, 'b1');
    expect(item.isRead, isFalse);
  });

  test('notification without payload has no booking', () {
    final item = AppNotification.fromJson({
      'id': 'n2',
      'type': 'review.received',
      'title': 'تقييم جديد',
      'body': 'تفاصيل',
      'data': null,
      'readAt': '2026-10-14T07:00:00.000Z',
      'createdAt': '2026-10-14T06:00:00.000Z',
    });
    expect(item.bookingId, isNull);
    expect(item.isRead, isTrue);
  });

  group('booking deep links', () {
    test('accepts lamsa://booking/<uuid>', () {
      final link = parseBookingLink(
        Uri.parse('lamsa://booking/11111111-2222-4333-8444-555555555555'),
      );
      expect(link?.bookingId, '11111111-2222-4333-8444-555555555555');
    });

    test('rejects other schemes, hosts, and shapes', () {
      expect(parseBookingLink(Uri.parse('https://booking/b1')), isNull);
      expect(parseBookingLink(Uri.parse('lamsa://booking/not-a-uuid')), isNull);
      expect(parseBookingLink(Uri.parse('lamsa://booking/')), isNull);
      expect(parseBookingLink(Uri.parse('lamsa://booking/b1/extra')), isNull);
      expect(
        parseBookingLink(
          Uri.parse(
            'lamsa://booking/11111111-2222-4333-8444-555555555555?status=paid',
          ),
        ),
        isNull,
      );
      expect(parseBookingLink(Uri.parse('lamsa://payouts/b1')), isNull);
    });
  });
}
