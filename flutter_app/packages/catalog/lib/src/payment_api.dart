import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

/// Payment attempt states. Booking confirmation is a separate server fact.
class PaymentStates {
  static const pending = 'pending';
  static const paid = 'paid';
  static const failed = 'failed';
  static const refunded = 'refunded';
}

class BookingPayment {
  const BookingPayment({
    required this.id,
    required this.bookingId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.provider,
    this.failureReason,
  });

  final String id;
  final String bookingId;
  final String amount;
  final String currency;
  final String status;
  final String provider;
  final String? failureReason;

  factory BookingPayment.fromJson(JsonObject json) {
    String requiredString(String key) {
      final value = json[key];
      if (value is! String) {
        throw const FormatException('Invalid API response');
      }
      return value;
    }

    return BookingPayment(
      id: requiredString('id'),
      bookingId: requiredString('bookingId'),
      amount: requiredString('amount'),
      currency: requiredString('currency'),
      status: requiredString('status'),
      provider: requiredString('provider'),
      failureReason: json['failureReason'] as String?,
    );
  }

  bool get isPending => status == PaymentStates.pending;
  bool get isPaid => status == PaymentStates.paid;
  bool get isFailed => status == PaymentStates.failed;
}

/// A started (or reused) demo intent. The callback token is revealed once and
/// must stay in memory; it is never logged or stored.
class PaymentIntent {
  const PaymentIntent({
    required this.payment,
    required this.callbackToken,
    required this.reused,
  });

  final BookingPayment payment;
  final String callbackToken;
  final bool reused;

  factory PaymentIntent.fromJson(JsonObject json) {
    final payment = json['payment'];
    final token = json['callbackToken'];
    if (payment is! JsonObject || token is! String) {
      throw const FormatException('Invalid API response');
    }
    return PaymentIntent(
      payment: BookingPayment.fromJson(payment),
      callbackToken: token,
      reused: json['reused'] == true,
    );
  }
}

/// Result of a demo provider event. `confirmed` mirrors the booking row;
/// the apps still refetch booking state instead of trusting this call.
class DemoEventResult {
  const DemoEventResult({
    required this.payment,
    required this.confirmed,
    this.note,
  });

  final BookingPayment payment;
  final bool confirmed;
  final String? note;

  factory DemoEventResult.fromJson(JsonObject json) {
    final payment = json['payment'];
    if (payment is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return DemoEventResult(
      payment: BookingPayment.fromJson(payment),
      confirmed: json['confirmed'] == true,
      note: json['note'] as String?,
    );
  }
}

abstract interface class PaymentGateway {
  Future<PaymentIntent> initiate(String bookingId);
  Future<List<BookingPayment>> attempts(String bookingId);
  Future<DemoEventResult> sendDemoEvent({
    required String paymentId,
    required String eventId,
    required String outcome,
    required String amount,
    required String currency,
    required String token,
  });
}

class PaymentApi implements PaymentGateway {
  PaymentApi(this._client);

  final ApiClient _client;

  @override
  Future<PaymentIntent> initiate(String bookingId) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings/$bookingId/payments',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return PaymentIntent.fromJson(data);
  }

  @override
  Future<List<BookingPayment>> attempts(String bookingId) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/bookings/$bookingId/payments',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .whereType<JsonObject>()
        .map(BookingPayment.fromJson)
        .toList(growable: false);
  }

  @override
  Future<DemoEventResult> sendDemoEvent({
    required String paymentId,
    required String eventId,
    required String outcome,
    required String amount,
    required String currency,
    required String token,
  }) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/webhooks/payments/demo',
      data: {
        'paymentId': paymentId,
        'eventId': eventId,
        'outcome': outcome,
        'amount': amount,
        'currency': currency,
        'token': token,
      },
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return DemoEventResult.fromJson(data);
  }
}
