import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  test('restores a stored session by rotating the refresh token', () async {
    final store = MemorySessionStore(
      StoredSession(
        refreshToken: 'refresh-old',
        refreshExpiresAt: DateTime.now().add(const Duration(days: 1)),
      ),
    );
    final gateway = FakeAuthGateway(session: session(role: AuthRole.customer));
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: store,
    );

    await manager.bootstrap();

    expect(manager.phase, SessionPhase.authenticated);
    expect(manager.user?.role, AuthRole.customer);
    expect(gateway.refreshCalls, 1);
    expect(store.value?.refreshToken, 'refresh-1');
  });

  test('rejects a wrong-role login and never persists its token', () async {
    final store = MemorySessionStore();
    final gateway = FakeAuthGateway(session: session(role: AuthRole.expert));
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: store,
    );

    await expectLater(
      manager.login(phone: '01012345678', password: 'password-1234'),
      throwsA(
        isA<ApiFailure>().having(
          (error) => error.code,
          'code',
          'WRONG_APP_ROLE',
        ),
      ),
    );

    expect(manager.phase, SessionPhase.anonymous);
    expect(store.value, isNull);
    expect(gateway.logoutCalls, 1);
  });

  test('serializes concurrent refresh attempts', () async {
    final gateway = FakeAuthGateway(session: session(role: AuthRole.customer));
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: MemorySessionStore(),
    );
    await manager.login(phone: '01012345678', password: 'password-1234');
    final completer = Completer<AuthSession>();
    gateway.refreshCompleter = completer;

    final first = manager.refreshAccessToken(failedAccessToken: 'access-1');
    final second = manager.refreshAccessToken(failedAccessToken: 'access-1');
    completer.complete(session(role: AuthRole.customer, tokenSuffix: '2'));

    expect(await Future.wait([first, second]), ['access-2', 'access-2']);
    expect(gateway.refreshCalls, 1);
  });

  test('keeps a stored session when restoration is offline', () async {
    final stored = StoredSession(
      refreshToken: 'refresh-old',
      refreshExpiresAt: DateTime.now().add(const Duration(days: 1)),
    );
    final store = MemorySessionStore(stored);
    final gateway = FakeAuthGateway(
      session: session(role: AuthRole.customer),
      refreshFailure: const ApiFailure(
        kind: ApiFailureKind.offline,
        code: 'NETWORK_UNAVAILABLE',
        message: 'offline',
      ),
    );
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: store,
    );

    await manager.bootstrap();

    expect(manager.phase, SessionPhase.offline);
    expect(store.value, same(stored));
  });

  test('clears local credentials even when remote logout fails', () async {
    final store = MemorySessionStore();
    final gateway = FakeAuthGateway(
      session: session(role: AuthRole.customer),
      failLogout: true,
    );
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: store,
    );
    await manager.login(phone: '01012345678', password: 'password-1234');

    await manager.logout();

    expect(manager.phase, SessionPhase.anonymous);
    expect(store.value, isNull);
  });

  test('registration always submits the manager expected role', () async {
    final gateway = FakeAuthGateway(session: session(role: AuthRole.expert));
    final manager = SessionManager(
      expectedRole: AuthRole.expert,
      gateway: gateway,
      store: MemorySessionStore(),
    );

    await manager.register(
      phone: '01012345678',
      challengeId: 'challenge',
      otp: '123456',
      name: 'خبيرة اختبار',
      password: 'password-1234',
    );

    expect(gateway.registeredRole, AuthRole.expert);
  });

  test('expired stored credentials are removed before any refresh', () async {
    final store = MemorySessionStore(
      StoredSession(
        refreshToken: 'expired-refresh',
        refreshExpiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
      ),
    );
    final gateway = FakeAuthGateway(session: session(role: AuthRole.customer));
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: store,
    );

    await manager.bootstrap();

    expect(manager.phase, SessionPhase.expired);
    expect(manager.user, isNull);
    expect(store.value, isNull);
    expect(gateway.refreshCalls, 0);
  });

  test('logging in as another user cannot retain the previous user', () async {
    final gateway = FakeAuthGateway(
      session: session(role: AuthRole.customer, name: 'المستخدمة الأولى'),
    );
    final manager = SessionManager(
      expectedRole: AuthRole.customer,
      gateway: gateway,
      store: MemorySessionStore(),
    );
    await manager.login(phone: '01012345678', password: 'password-1234');
    expect(manager.user?.name, 'المستخدمة الأولى');
    await manager.logout();

    gateway.session = session(
      role: AuthRole.customer,
      name: 'المستخدمة الثانية',
      tokenSuffix: '2',
    );
    await manager.login(phone: '01012345679', password: 'password-5678');

    expect(manager.user?.name, 'المستخدمة الثانية');
    expect(manager.user?.name, isNot('المستخدمة الأولى'));
  });
}

AuthSession session({
  required AuthRole role,
  String tokenSuffix = '1',
  String name = 'مستخدمة اختبار',
}) => AuthSession(
  user: AuthUser(
    id: '00000000-0000-4000-8000-000000000001',
    name: name,
    phone: '+201012345678',
    role: role,
    phoneVerified: true,
  ),
  accessToken: 'access-$tokenSuffix',
  refreshToken: 'refresh-$tokenSuffix',
  accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
  refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
);

class FakeAuthGateway implements AuthGateway {
  FakeAuthGateway({
    required this.session,
    this.refreshFailure,
    this.failLogout = false,
  });

  AuthSession session;
  ApiFailure? refreshFailure;
  bool failLogout;
  Completer<AuthSession>? refreshCompleter;
  int refreshCalls = 0;
  int logoutCalls = 0;
  AuthRole? registeredRole;

  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async => session;

  @override
  Future<void> logout(String refreshToken) async {
    logoutCalls += 1;
    if (failLogout) throw Exception('offline');
  }

  @override
  Future<AuthSession> refresh(String refreshToken) async {
    refreshCalls += 1;
    if (refreshFailure case final failure?) throw failure;
    if (refreshCompleter case final completer?) return completer.future;
    return session;
  }

  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) async {
    registeredRole = role;
    return session;
  }

  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) async => OtpChallenge(
    id: 'challenge',
    expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    retryAfterSeconds: 60,
    deliveryMode: 'demo',
  );

  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      requestPasswordOtp(phone);

  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) async {}
}
