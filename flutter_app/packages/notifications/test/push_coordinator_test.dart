import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

/// The coordinator's contract with sessions and navigation, for all three
/// delivery states. No payload is trusted, and nothing opens without a
/// session that can decide.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const bookingId = '11111111-1111-4111-8111-111111111111';

  AuthSession sessionFor(AuthRole role) => AuthSession(
    user: AuthUser(
      id: 'u1',
      name: 'Test',
      phone: '+201000000000',
      role: role,
      phoneVerified: true,
    ),
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
  );

  SessionManager managerFor(AuthRole role, _AuthGateway auth) => SessionManager(
    expectedRole: role,
    gateway: auth,
    store: MemorySessionStore(),
  );

  PushEnvelope openedBooking([String id = bookingId]) => PushEnvelope(
    type: 'booking_confirmed',
    data: {'type': 'booking_confirmed', 'bookingId': id},
  );

  test(
    'an opened message navigates once the session is authenticated',
    () async {
      final auth = _AuthGateway(session: sessionFor(AuthRole.expert));
      final manager = managerFor(AuthRole.expert, auth);
      final opened = <String>[];
      final coordinator = PushCoordinator(
        provider: _PushProviderStub(),
        session: manager,
        onOpenBooking: (id) async => opened.add(id),
      );
      await coordinator.attach();

      await manager.login(phone: '+201000000000', password: 'password-12345');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await coordinator.handle(openedBooking());

      expect(opened, [bookingId]);
      await coordinator.dispose();
      manager.dispose();
    },
  );

  test('a cold start defers navigation until the session is restored', () async {
    final auth = _AuthGateway(session: sessionFor(AuthRole.expert));
    final manager = managerFor(AuthRole.expert, auth);
    final opened = <String>[];
    final provider = _PushProviderStub(initial: openedBooking());
    final coordinator = PushCoordinator(
      provider: provider,
      session: manager,
      onOpenBooking: (id) async => opened.add(id),
    );

    // The message arrives first: nothing may open while the phase is restoring.
    await coordinator.attach();
    expect(opened, isEmpty);

    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 20));

    expect(opened, [bookingId]);
    await coordinator.dispose();
    manager.dispose();
  });

  test('a wrong role never reaches navigation', () async {
    final auth = _AuthGateway(session: sessionFor(AuthRole.customer));
    // The expert app expects an expert session: the session layer itself
    // refuses this login, so the coordinator never sees an authenticated
    // customer and nothing can open.
    final manager = managerFor(AuthRole.expert, auth);
    final opened = <String>[];
    final coordinator = PushCoordinator(
      provider: _PushProviderStub(),
      session: manager,
      onOpenBooking: (id) async => opened.add(id),
    );
    await coordinator.attach();

    await expectLater(
      manager.login(phone: '+201000000000', password: 'password-12345'),
      throwsA(isA<ApiFailure>()),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));
    await coordinator.handle(openedBooking());

    expect(manager.isAuthenticated, isFalse);
    expect(opened, isEmpty);
    await coordinator.dispose();
    manager.dispose();
  });

  test('an unauthenticated session never navigates', () async {
    final auth = _AuthGateway(session: sessionFor(AuthRole.expert));
    final manager = managerFor(AuthRole.expert, auth);
    final opened = <String>[];
    final coordinator = PushCoordinator(
      provider: _PushProviderStub(),
      session: manager,
      onOpenBooking: (id) async => opened.add(id),
    );
    await coordinator.attach();

    await coordinator.handle(openedBooking());
    await Future<void>.delayed(const Duration(milliseconds: 20));

    expect(manager.isAuthenticated, isFalse);
    expect(opened, isEmpty);
    await coordinator.dispose();
    manager.dispose();
  });

  test('an invalid payload is ignored before any navigation', () async {
    final auth = _AuthGateway(session: sessionFor(AuthRole.expert));
    final manager = managerFor(AuthRole.expert, auth);
    final opened = <String>[];
    final coordinator = PushCoordinator(
      provider: _PushProviderStub(),
      session: manager,
      onOpenBooking: (id) async => opened.add(id),
    );
    await coordinator.attach();
    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 20));

    for (final message in [
      const PushEnvelope(type: 'booking_confirmed', data: {}),
      const PushEnvelope(type: '', data: {'bookingId': 'garbage'}),
      const PushEnvelope(type: 'spam', data: {'bookingId': bookingId}),
    ]) {
      await coordinator.handle(message);
    }

    expect(opened, isEmpty);
    await coordinator.dispose();
    manager.dispose();
  });

  test('a logout drops a pending destination', () async {
    final auth = _AuthGateway(session: sessionFor(AuthRole.expert));
    final manager = managerFor(AuthRole.expert, auth);
    final opened = <String>[];
    final coordinator = PushCoordinator(
      provider: _PushProviderStub(),
      session: manager,
      onOpenBooking: (id) async => opened.add(id),
    );
    await coordinator.attach();
    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 20));

    await manager.logout();
    await coordinator.handle(openedBooking());

    expect(opened, isEmpty);
    await coordinator.dispose();
    manager.dispose();
  });
}

class _PushProviderStub implements PushProvider {
  _PushProviderStub({this.initial});

  final PushEnvelope? initial;

  @override
  Future<PushEnvelope?> initialMessage() async => initial;

  @override
  Stream<PushEnvelope> get onForegroundMessage => const Stream.empty();

  @override
  Stream<PushEnvelope> get onOpenedMessage => const Stream.empty();

  @override
  Future<bool> ensureInitialized() async => true;

  @override
  Future<PushPermission> requestPermission() async => PushPermission.granted;

  @override
  Future<String?> token() async => 'device-token';

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Future<void> deleteToken() async {}
}

class _AuthGateway implements AuthGateway {
  _AuthGateway({required this.session});

  AuthSession session;
  int loginCalls = 0;

  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async {
    loginCalls += 1;
    return session;
  }

  @override
  Future<AuthSession> refresh(String refreshToken) async => session;

  @override
  Future<void> logout(String refreshToken) async {}

  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      throw UnimplementedError();

  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) => throw UnimplementedError();

  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) =>
      throw UnimplementedError();

  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) => throw UnimplementedError();
}
