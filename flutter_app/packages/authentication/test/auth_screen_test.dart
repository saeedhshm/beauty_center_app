import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('login accepts documented legacy phone and non-empty password', (
    tester,
  ) async {
    final gateway = LoginGateway();
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: MemorySessionStore(),
    );
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: LamsaAuthScreen(manager: manager, audienceLabel: 'تطبيق العميلة'),
      ),
    );

    await tester.enterText(find.byType(TextFormField).at(0), '0500000000');
    await tester.enterText(find.byType(TextFormField).at(1), 'legacy');
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(gateway.loginCalls, 1);
    expect(manager.phase, SessionPhase.authenticated);
  });
}

class LoginGateway implements AuthGateway {
  int loginCalls = 0;

  AuthSession get value => AuthSession(
    user: const AuthUser(
      id: '00000000-0000-4000-8000-000000000001',
      name: 'عميلة قديمة',
      phone: '+966500000000',
      role: AuthRole.customer,
      phoneVerified: true,
    ),
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
  );

  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async {
    loginCalls += 1;
    return value;
  }

  @override
  Future<void> logout(String refreshToken) async {}
  @override
  Future<AuthSession> refresh(String refreshToken) async => value;
  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) async => value;
  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) =>
      throw UnimplementedError();
  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      throw UnimplementedError();
  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) async {}
}
