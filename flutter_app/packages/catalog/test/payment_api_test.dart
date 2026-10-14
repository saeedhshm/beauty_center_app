import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

void main() {
  Map<String, Object?> paymentJson({String status = 'pending'}) => {
    'id': 'pay1',
    'bookingId': 'b1',
    'amount': '300.50',
    'currency': 'EGP',
    'status': status,
    'provider': 'demo',
    'failureReason': null,
  };

  test('intent keeps the one-time token as an opaque string', () {
    final intent = PaymentIntent.fromJson({
      'payment': paymentJson(),
      'callbackToken': 'demo-token-abc',
      'reused': false,
    });
    expect(intent.payment.amount, '300.50');
    expect(intent.callbackToken, 'demo-token-abc');
    expect(intent.payment.isPending, isTrue);
  });

  test('demo result never implies confirmation by itself', () {
    final result = DemoEventResult.fromJson({
      'payment': paymentJson(status: 'paid'),
      'confirmed': false,
      'note': 'BOOKING_EXPIRED',
    });
    expect(result.payment.isPaid, isTrue);
    expect(result.confirmed, isFalse);
    expect(result.note, 'BOOKING_EXPIRED');
  });

  test('failed attempts carry the provider reason', () {
    final payment = BookingPayment.fromJson(
      paymentJson(status: 'failed')
        ..['failureReason'] = 'PROVIDER_DECLINED',
    );
    expect(payment.isFailed, isTrue);
    expect(payment.failureReason, 'PROVIDER_DECLINED');
  });
}
