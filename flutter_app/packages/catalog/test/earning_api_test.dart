import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

void main() {
  test('earnings split keeps per-currency decimal strings', () {
    final summary = EarningsSummary.fromJson({
      'eligible': [
        {'currency': 'EGP', 'amount': '240.40'},
      ],
      'recorded': [],
      'transferred': [
        {'currency': 'EGP', 'amount': '100.00'},
        {'currency': 'SAR', 'amount': '50.00'},
      ],
    });
    expect(summary.eligible.single.amount, '240.40');
    expect(summary.recorded, isEmpty);
    expect(summary.transferred, hasLength(2));
  });

  test('payout distinguishes recorded from transferred', () {
    final recorded = ExpertPayout.fromJson({
      'id': 'p1',
      'amount': '240.40',
      'currency': 'EGP',
      'transferRef': null,
      'transferredAt': null,
      'createdAt': '2026-10-14T06:00:00.000Z',
    });
    expect(recorded.isTransferred, isFalse);

    final transferred = ExpertPayout.fromJson({
      'id': 'p2',
      'amount': '240.40',
      'currency': 'EGP',
      'transferRef': 'bank-1',
      'transferredAt': '2026-10-14T07:00:00.000Z',
      'createdAt': '2026-10-14T06:00:00.000Z',
      'bookings': [
        {
          'id': 'b1',
          'status': 'completed',
          'startsAt': '2026-10-20T07:00:00.000Z',
          'endsAt': '2026-10-20T08:00:00.000Z',
          'totalAmount': '300.50',
          'expertEarning': '240.40',
          'currency': 'EGP',
        },
      ],
    });
    expect(transferred.isTransferred, isTrue);
    expect(transferred.bookings.single.expertEarning, '240.40');
  });
}
