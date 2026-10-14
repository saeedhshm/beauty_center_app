import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

/// Integration between the real [SessionManager] and [PushSessionSync]:
/// session transitions drive exactly-once registration and ordered cleanup.
void main() {
  AuthSession testSession() => AuthSession(
    user: const AuthUser(
      id: 'u1',
      name: 'Test',
      phone: '+201000000000',
      role: AuthRole.customer,
      phoneVerified: true,
    ),
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
  );

  SessionManager testManager(_AuthGateway auth, [StoredSession? stored]) =>
      SessionManager(
        expectedRole: AuthRole.customer,
        gateway: auth,
        store: MemorySessionStore(stored),
      );

  PushRegistrar testRegistrar(
    _PushProvider provider,
    _NotificationGateway gateway,
  ) => PushRegistrar(provider: provider, gateway: gateway);

  test('login registers the token exactly once', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway();
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();

    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(auth.loginCalls, 1);
    expect(gateway.registered, ['device-token']);
    expect(provider.permissionRequests, 1);
    await sync.dispose();
    manager.dispose();
  });

  test('bootstrap of a valid stored session registers', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(
      auth,
      StoredSession(
        refreshToken: 'refresh-1',
        refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
      ),
    );
    expect(auth.loginCalls, 0);
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway();
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();

    await manager.bootstrap();
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(manager.isAuthenticated, isTrue);
    expect(gateway.registered, ['device-token']);
    await sync.dispose();
    manager.dispose();
  });

  test('logout removes the server row while the session is valid', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'device-token');
    final events = <String>[];
    final gateway = _NotificationGateway(
      onRemove: (_) {
        // The access token must still resolve: proves ordering.
        events.add(manager.isAuthenticated ? 'server-delete' : 'too-late');
      },
    );
    auth.events = events;
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();
    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(gateway.registered, ['device-token']);

    await manager.logout();
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(events, ['server-delete', 'session-logout']);
    expect(provider.deleted, isTrue);
    await sync.dispose();
    manager.dispose();
  });

  test('expired session clears local state safely without server calls',
      () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway();
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();
    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(gateway.registered, ['device-token']);

    // The credential is now unusable: only local cleanup may run.
    await manager.sessionExpired();
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(manager.isAuthenticated, isFalse);
    expect(gateway.removed, isEmpty);
    expect(provider.deleted, isTrue);
    await sync.dispose();
    manager.dispose();
  });

  test('rotation replaces the registration without a stale row', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'token-a');
    final gateway = _NotificationGateway();
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();
    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(gateway.registered, ['token-a']);

    provider.rotate('token-b');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(gateway.registered, ['token-a', 'token-b']);
    expect(gateway.removed, ['device-1']);
    await sync.dispose();
    manager.dispose();
  });

  test('rebuild does not re-register without a transition', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = testRegistrar(provider, gateway);
    final first = PushSessionSync(manager: manager, registrar: registrar);
    first.attach();
    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(gateway.registered, ['device-token']);

    // A rebuilt binding attaches cleanly and observes without resending.
    await first.dispose();
    final second = PushSessionSync(manager: manager, registrar: registrar);
    second.attach();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    manager.notifyListeners();
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(gateway.registered, ['device-token']);
    expect(provider.permissionRequests, 1);
    await second.dispose();
    manager.dispose();
  });
}

class _AuthGateway implements AuthGateway {
  _AuthGateway({required this.session});

  AuthSession session;
  int loginCalls = 0;
  List<String> events = [];

  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async {
    loginCalls += 1;
    return session;
  }

  @override
  Future<void> logout(String refreshToken) async {
    events.add('session-logout');
  }

  @override
  Future<AuthSession> refresh(String refreshToken) async => session;

  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) async => session;

  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      throw UnimplementedError();

  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) =>
      throw UnimplementedError();

  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) async {}
}

class _PushProvider implements PushProvider {
  _PushProvider({required String? initialToken}) : currentToken = initialToken;

  String? currentToken;
  int permissionRequests = 0;
  bool deleted = false;
  final _rotations = StreamController<String>.broadcast();

  void rotate(String next) {
    currentToken = next;
    _rotations.add(next);
  }

  @override
  Future<bool> ensureInitialized() async => true;

  @override
  Future<PushPermission> requestPermission() async {
    permissionRequests += 1;
    return PushPermission.granted;
  }

  @override
  Future<String?> token() async => currentToken;

  @override
  Stream<String> get onTokenRefresh => _rotations.stream;

  @override
  Future<void> deleteToken() async {
    deleted = true;
  }
}

class _NotificationGateway implements NotificationGateway {
  _NotificationGateway({this.onRemove});

  final List<String> registered = [];
  final List<String> removed = [];
  final void Function(String id)? onRemove;

  @override
  Future<RegisteredDevice> registerDevice(String token) async {
    registered.add(token);
    return RegisteredDevice(
      id: 'device-${registered.length}',
      createdAt: '2026-10-14T06:00:00.000Z',
    );
  }

  @override
  Future<List<RegisteredDevice>> devices() => throw UnimplementedError();

  @override
  Future<void> removeDevice(String id) async {
    onRemove?.call(id);
    removed.add(id);
  }

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) => throw UnimplementedError();

  @override
  Future<int> unreadCount() => throw UnimplementedError();

  @override
  Future<void> markRead(String id) => throw UnimplementedError();

  @override
  Future<void> markAllRead() => throw UnimplementedError();
}
