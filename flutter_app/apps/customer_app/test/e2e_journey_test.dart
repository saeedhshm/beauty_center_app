import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:uuid/uuid.dart';

/// Local end-to-end journey (A10): the real mobile gateway classes against a
/// real backend + PostgreSQL on an isolated database. NOT staging: run only
/// with LAMSA_E2E_BASE_URL set (e.g. a local backend pointed at lamsa_e2e),
/// otherwise this file skips. Synthetic fixtures only.
const _baseUrl = String.fromEnvironment(
  'LAMSA_E2E_BASE_URL',
  defaultValue: '',
);

String get _base {
  final fromEnv = Platform.environment['LAMSA_E2E_BASE_URL'];
  if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;
  return _baseUrl;
}

void main() {
  final enabled = _base.isNotEmpty;
  test(
    'customer and expert journey on a live local backend',
    skip: enabled ? false : 'Set LAMSA_E2E_BASE_URL to run the live journey',
    () async {
      final dio = Dio(BaseOptions(baseUrl: _base));
      final customerClient = _client(dio, null);
      final auth = AuthApi(customerClient);
      final stamp = DateTime.now().millisecondsSinceEpoch % 100000;

      Future<AuthSession> register(String suffix, String role) async {
        final unique =
            (stamp * 1000 + (suffix == '001' ? 11 : 22)) % 100000000;
        final phone = '+2010${unique.toString().padLeft(8, '0')}';
        final challenge = await auth.requestRegistrationOtp(phone);
        return auth.register(
          phone: phone,
          challengeId: challenge.id,
          otp: '123456',
          name: 'E2E $role $stamp',
          password: 'E2ePassword-12345!',
          role: role == 'expert' ? AuthRole.expert : AuthRole.customer,
        );
      }

      // 1-2. Register both parties (fresh isolated DB per run).
      final expertSession = await register('001', 'expert');
      final customerSession = await register('002', 'customer');
      final expertId = expertSession.user.id;

      // 3. Admin approves the expert (admin account seeded by the harness).
      final adminLogin = await dio.post<Map<String, dynamic>>(
        '/api/v1/admin/auth/login',
        data: {'phone': '+201000000001', 'password': 'DemoAdmin-2026!'},
      );
      final adminToken =
          (adminLogin.data!['data'] as Map)['accessToken'] as String;
      final approve = await dio.post<Map<String, dynamic>>(
        '/api/v1/admin/experts/$expertId/approve',
        options: Options(headers: {'Authorization': 'Bearer $adminToken'}),
      );
      expect(approve.statusCode, 200);

      // 4. Expert profile, price, and weekly availability.
      final expertClient = _client(dio, expertSession.accessToken);
      final expertCatalog = CatalogApi(expertClient);
      final availability = AvailabilityApi(expertClient);
      final services = await expertCatalog.services(limit: 50);
      expect(services.items, isNotEmpty);
      final service = services.items.first;
      await expertClient.patch<Map<String, dynamic>>(
        '/api/v1/experts/me',
        data: <String, Object?>{
          'cityId': 1,
          'bio': 'E2E synthetic expert',
          'isAcceptingBookings': true,
        },
        authenticated: true,
      );
      final workspace = ExpertWorkspaceApi(expertClient);
      await workspace.upsertService(
        serviceId: service.id,
        price: '300.50',
        isActive: true,
      );
      final week = await availability.replaceWeekly([
        for (var day = 1; day <= 7; day++)
          WeeklySlot(dayOfWeek: day, startTime: '09:00', endTime: '21:00'),
      ]);
      expect(week.length, 7);

      // 5. Customer discovers slots from the server.
      final customerCatalog = CatalogApi(customerClient);
      final customerAvailability = AvailabilityApi(customerClient);
      final found = await customerCatalog.experts(cityId: 1, limit: 50);
      expect(found.items.map((item) => item.id), contains(expertId));
      final today = DateTime.now().toUtc().add(const Duration(days: 1));
      final day =
          '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
      final days = await customerAvailability.slots(
        expertId: expertId,
        serviceId: service.id,
        from: day,
        to: day,
      );
      expect(days, isNotEmpty);
      expect(days.first.slots, isNotEmpty);
      final slot = days.first.slots.first;

      // 6. Address inside Cairo + booking creation with idempotency.
      final addresses = AddressApi(
        _client(dio, customerSession.accessToken),
      );
      final address = await addresses.create(
        label: 'home',
        addressText: 'E2E synthetic address',
        cityId: 1,
        lat: '30.044400',
        lng: '31.235700',
      );
      final bookings = BookingApi(_client(dio, customerSession.accessToken));
      final created = await bookings.createBooking(
        expertId: expertId,
        serviceId: service.id,
        addressId: address.id,
        startsAt: slot.startsAt,
        idempotencyKey: const Uuid().v4(),
      );
      expect(created.status, 'pending');
      expect(created.totalAmount, isNotEmpty);
      expect(created.currency, isNotEmpty);

      // 7. Expert accepts; both sides read the same state.
      final expertBookings = BookingApi(expertClient);
      final accepted = await expertBookings.accept(created.id);
      expect(accepted.status, 'accepted');
      expect((await bookings.booking(created.id)).status, 'accepted');

      // 8. Demo payment confirms via the server webhook contract.
      final payments = PaymentApi(_client(dio, customerSession.accessToken));
      final intent = await payments.initiate(created.id);
      final event = await payments.sendDemoEvent(
        paymentId: intent.payment.id,
        eventId: const Uuid().v4(),
        outcome: 'paid',
        amount: intent.payment.amount,
        currency: intent.payment.currency,
        token: intent.callbackToken,
      );
      expect(event.confirmed, isTrue);
      expect((await bookings.booking(created.id)).status, 'confirmed');
      expect((await expertBookings.booking(created.id)).status, 'confirmed');

      // 9. Expert completes; both review once.
      final completed = await expertBookings.complete(created.id);
      expect(completed.status, 'completed');
      final reviews = ReviewApi(_client(dio, customerSession.accessToken));
      final expertReviews = ReviewApi(expertClient);
      await reviews.submit(created.id, rating: 5, comment: 'E2E synthetic');
      await expertReviews.submit(created.id, rating: 4);
      final seen = await reviews.forBooking(created.id);
      expect(seen.length, 2);

      // 10. Earnings reflect the completed paid booking as eligible.
      final earnings = EarningApi(expertClient);
      final summary = await earnings.earnings();
      final eligible = summary.eligible
          .where((item) => item.currency == created.currency)
          .toList();
      expect(eligible, isNotEmpty);

      // 11. Notifications arrived; deep link resolves through a fresh fetch.
      final notifications = NotificationApi(
        _client(dio, customerSession.accessToken),
      );
      final unread = await notifications.unreadCount();
      expect(unread, greaterThan(0));
      await notifications.markAllRead();
      expect(await notifications.unreadCount(), 0);
      final link = parseBookingLink(Uri.parse('lamsa://booking/${created.id}'));
      expect(link?.bookingId, created.id);
      expect((await bookings.booking(link!.bookingId)).id, created.id);
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}

ApiClient _client(Dio dio, String? token) => ApiClient(
  config: AppConfig(
    environment: AppEnvironment.development,
    apiBaseUrl: _base.isEmpty ? 'http://127.0.0.1:3100' : _base,
  ),
  dio: dio,
  authenticator: _StaticAuth(token),
);

class _StaticAuth implements ApiAuthenticator {
  _StaticAuth(this.token);

  final String? token;

  @override
  Future<String?> accessToken() async => token;

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async =>
      null;

  @override
  Future<void> sessionExpired() async {}
}
