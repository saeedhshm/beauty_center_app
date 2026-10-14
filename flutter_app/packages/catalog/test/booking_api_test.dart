import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:test/test.dart';

void main() {
  late RecordingAdapter adapter;
  late BookingApi api;

  String bookingJson({String status = 'pending'}) => jsonEncode({
    'data': {
      'id': 'b1',
      'customerId': 'c1',
      'expertId': 'e1',
      'serviceId': 7,
      'status': status,
      'startsAt': '2026-10-20T07:00:00.000Z',
      'endsAt': '2026-10-20T08:00:00.000Z',
      'timeZone': 'Africa/Cairo',
      'expiresAt': '2026-10-13T07:00:00.000Z',
      'addressText': 'Cairo synthetic address',
      'cityId': 1,
      'price': '300.50',
      'commissionRate': '20.0000',
      'commissionAmount': '60.10',
      'expertEarning': '240.40',
      'vatRate': '0.0000',
      'vatAmount': '0.00',
      'totalAmount': '300.50',
      'currency': 'EGP',
      'notes': null,
      'cancellationReason': null,
      'cancelledAt': null,
      'createdAt': '2026-10-13T06:00:00.000Z',
      'updatedAt': '2026-10-13T06:00:00.000Z',
      'statusHistory': [
        {'status': 'pending', 'changedAt': '2026-10-13T06:00:00.000Z'},
      ],
    },
  });

  setUp(() {
    adapter = RecordingAdapter();
    api = BookingApi(
      ApiClient(
        config: const AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: 'http://127.0.0.1:3000',
        ),
        dio: Dio()..httpClientAdapter = adapter,
        authenticator: TestAuthenticator(),
      ),
    );
  });

  test('creation sends the idempotency key header once', () async {
    adapter.respondWith = bookingJson();
    final booking = await api.createBooking(
      expertId: 'e1',
      serviceId: 7,
      addressId: 'a1',
      startsAt: '2026-10-20T07:00:00.000Z',
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    );
    expect(booking.id, 'b1');
    expect(
      adapter.last.headers['Idempotency-Key'],
      '11111111-2222-4333-8444-555555555555',
    );
    expect(adapter.last.path, '/api/v1/bookings');
    final sent = adapter.last.data;
    final payload = sent is String ? jsonDecode(sent) as Map : sent as Map;
    expect(payload['notes'], isNull);
  });

  test('snapshot amounts stay decimal strings', () async {
    adapter.respondWith = bookingJson(status: 'accepted');
    final booking = await api.booking('b1');
    expect(booking.totalAmount, '300.50');
    expect(booking.currency, 'EGP');
    expect(booking.statusHistory, hasLength(1));
    expect(booking.isAccepted, isTrue);
    expect(booking.isPending, isFalse);
  });

  test('transitions hit the documented endpoints', () async {
    adapter.respondWith = bookingJson(status: 'accepted');
    await api.accept('b1');
    expect(adapter.last.path, '/api/v1/bookings/b1/accept');

    adapter.respondWith = bookingJson(status: 'rejected');
    await api.reject('b1', reason: 'busy');
    expect(adapter.last.path, '/api/v1/bookings/b1/reject');

    adapter.respondWith = bookingJson(status: 'cancelled');
    await api.cancel('b1');
    expect(adapter.last.path, '/api/v1/bookings/b1/cancel');
  });
}

class TestAuthenticator implements ApiAuthenticator {
  @override
  Future<String?> accessToken() async => 'access-token';

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async => null;

  @override
  Future<void> sessionExpired() async {}
}

class RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> calls = [];
  String respondWith = '{"data":null}';

  RequestOptions get last => calls.last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls.add(options);
    return ResponseBody.fromString(
      respondWith,
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
