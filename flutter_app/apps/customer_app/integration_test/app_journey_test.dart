import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/app.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Flutter UI integration journey (local backend only — NOT staging, NOT
/// full-app E2E): real widgets driven against a real backend + isolated
/// PostgreSQL database. Unlike widget tests (mocked gateways) this pumps the
/// real [CustomerApp] with real gateway classes; unlike the API integration
/// journey it taps through real screens. Push delivery and platform
/// deep-links are out of scope. Runs only with LAMSA_E2E_BASE_URL set,
/// otherwise skips. Synthetic fixtures only.
String get _base {
  const defined = String.fromEnvironment(
    'LAMSA_E2E_BASE_URL',
    defaultValue: '',
  );
  if (defined.isNotEmpty) return defined;
  return Platform.environment['LAMSA_E2E_BASE_URL'] ?? '';
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final enabled = _base.isNotEmpty;
  testWidgets(
    'customer UI journey on a live local backend',
    skip: !enabled, // Needs LAMSA_E2E_BASE_URL; see file docs.
    (tester) async {
      final dio = Dio(BaseOptions(baseUrl: _base));
      final stamp = DateTime.now().millisecondsSinceEpoch % 100000;
      final expertName = 'E2E UI $stamp';
      final customerPhone =
          '+2010${((stamp * 1000 + 22) % 100000000).toString().padLeft(8, '0')}';
      const customerPassword = 'E2ePassword-12345!';

      // 1. Register an expert and a customer through the real auth API.
      Future<AuthSession> register(String suffix, String role) async {
        final unique = (stamp * 1000 + (suffix == '001' ? 11 : 22)) % 100000000;
        final phone = '+2010${unique.toString().padLeft(8, '0')}';
        final setupAuth = AuthApi(
          ApiClient(
            config: AppConfig(
              environment: AppEnvironment.development,
              apiBaseUrl: _base,
            ),
          ),
        );
        final challenge = await setupAuth.requestRegistrationOtp(phone);
        return setupAuth.register(
          phone: phone,
          challengeId: challenge.id,
          otp: '123456',
          name: role == 'expert' ? expertName : 'E2E UI customer $stamp',
          password: 'E2ePassword-12345!',
          role: role == 'expert' ? AuthRole.expert : AuthRole.customer,
        );
      }

      final expertSession = await register('001', 'expert');
      await register('002', 'customer');
      final expertId = expertSession.user.id;

      // 2. Approve the expert and publish availability through the real API.
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

      ApiClient authed(String token) => ApiClient(
        config: AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: _base,
        ),
        authenticator: _StaticAuth(token),
      );
      final expertClient = authed(expertSession.accessToken);
      await expertClient.patch<Map<String, dynamic>>(
        '/api/v1/experts/me',
        data: <String, Object?>{
          'cityId': 1,
          'bio': 'E2E UI synthetic expert',
          'isAcceptingBookings': true,
        },
        authenticated: true,
      );
      final services = await CatalogApi(expertClient).services(limit: 50);
      expect(services.items, isNotEmpty);
      await ExpertWorkspaceApi(expertClient).upsertService(
        serviceId: services.items.first.id,
        price: '300.50',
        isActive: true,
      );
      await AvailabilityApi(expertClient).replaceWeekly([
        for (var day = 1; day <= 7; day++)
          WeeklySlot(dayOfWeek: day, startTime: '09:00', endTime: '21:00'),
      ]);

      // 3. Log the customer in through the real session manager.
      final manager = SessionManager(
        expectedRole: AuthRole.customer,
        gateway: AuthApi(
          ApiClient(
            config: AppConfig(
              environment: AppEnvironment.development,
              apiBaseUrl: _base,
            ),
          ),
        ),
        store: MemorySessionStore(),
      );
      addTearDown(manager.dispose);
      await manager.login(phone: customerPhone, password: customerPassword);

      // 4. Pump the real app: catalog renders seeded real data.
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appConfigProvider.overrideWithValue(
              AppConfig(
                environment: AppEnvironment.development,
                apiBaseUrl: _base,
              ),
            ),
            sessionManagerProvider.overrideWithValue(manager),
            networkStateProvider.overrideWith((ref) => Stream.value(true)),
          ],
          child: const CustomerApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Seeded service from the real backend renders in real UI.
      expect(find.text('خدمة E2E'), findsWidgets);

      // 5. Open the real expert detail: profile plus real server slots.
      await tester.ensureVisible(find.text(expertName));
      await tester.pump();
      await tester.tap(find.text(expertName));
      await tester.pumpAndSettle();

      expect(find.text(expertName), findsWidgets);
      expect(find.byKey(const ValueKey('expert-detail-list')), findsOneWidget);

      // Select tomorrow so slots exist regardless of the hour the test runs.
      final dayChips = find.byType(ChoiceChip);
      expect(dayChips, findsWidgets);
      await tester.ensureVisible(dayChips.at(1));
      await tester.pump();
      await tester.tap(dayChips.at(1));
      await tester.pumpAndSettle();

      // Real server slots render as real chips in real UI.
      expect(find.byType(ActionChip), findsWidgets);
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}

class _StaticAuth implements ApiAuthenticator {
  _StaticAuth(this.token);

  final String? token;

  @override
  Future<String?> accessToken() async => token;

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async => null;

  @override
  Future<void> sessionExpired() async {}
}
