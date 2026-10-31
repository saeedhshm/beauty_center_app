import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

/// Integration between the real [SessionManager] and [PushSessionSync]:
/// session transitions drive exactly-once registration and ordered cleanup.
void main() {
  // The sync observes app lifecycle for the resume retry.
  TestWidgetsFlutterBinding.ensureInitialized();

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

  final _registrars = <PushRegistrar>[];

  /// The registrar the sync is using, kept so a test can assert pending state.
  PushRegistrar registrarOf(PushSessionSync sync) => _registrars.last;

  PushRegistrar trackedRegistrar(
    _PushProvider provider,
    _NotificationGateway gateway,
  ) {
    final registrar = testRegistrar(provider, gateway);
    _registrars.add(registrar);
    return registrar;
  }

  test('a failed registration retries when the network comes back', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway()..registerError = _transient;
    final connectivity = StreamController<bool>.broadcast();
    final sync = PushSessionSync(
      manager: manager,
      registrar: trackedRegistrar(provider, gateway),
      connectivityChanges: connectivity.stream,
    );
    sync.attach();

    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(gateway.registered, ['device-token']);
    expect(registrarOf(sync).hasPendingRetry, isTrue);

    // Network returns while still authenticated: the retry goes through.
    gateway.registerError = null;
    connectivity.add(true);
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(gateway.registered, ['device-token', 'device-token']);
    expect(registrarOf(sync).hasPendingRetry, isFalse);
    expect(
      provider.permissionRequests,
      1,
      reason: 'permission is not re-prompted',
    );

    await sync.dispose();
    await connectivity.close();
    manager.dispose();
  });

  test('no retry is attempted after logout', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(auth);
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway()..registerError = _transient;
    final connectivity = StreamController<bool>.broadcast();
    final registrar = testRegistrar(provider, gateway);
    final sync = PushSessionSync(
      manager: manager,
      registrar: registrar,
      connectivityChanges: connectivity.stream,
    );
    sync.attach();

    await manager.login(phone: '+201000000000', password: 'password-12345');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await manager.logout();
    gateway.registered.clear();

    connectivity.add(true);
    TestWidgetsFlutterBinding.instance.handleAppLifecycleStateChanged(
      AppLifecycleState.resumed,
    );
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(gateway.registered, isEmpty);
    await sync.dispose();
    await connectivity.close();
    manager.dispose();
  });

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

  test(
    'expired session clears local state safely without server calls',
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
    },
  );

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

  test(
    'bootstrap from an expired stored session sweeps locally only',
    () async {
      final auth = _AuthGateway(session: testSession());
      final manager = testManager(
        auth,
        StoredSession(
          refreshToken: 'refresh-1',
          refreshExpiresAt: DateTime.now().subtract(const Duration(days: 1)),
        ),
      );
      final provider = _PushProvider(initialToken: 'device-token');
      final gateway = _NotificationGateway();
      final sync = PushSessionSync(
        manager: manager,
        registrar: testRegistrar(provider, gateway),
      );
      sync.attach();

      await manager.bootstrap();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(manager.phase, SessionPhase.expired);
      expect(manager.isAuthenticated, isFalse);
      // Local-only sweep: no permission prompt, no server calls.
      expect(provider.permissionRequests, 0);
      expect(gateway.registered, isEmpty);
      expect(gateway.removed, isEmpty);
      expect(provider.deleted, isTrue);
      expect(provider.deleteCalls, 1);
      await sync.dispose();
      manager.dispose();
    },
  );

  test(
    'rejected refresh during bootstrap sweeps locally without server calls',
    () async {
      final auth = _AuthGateway(session: testSession())
        ..refreshFailure = const ApiFailure(
          kind: ApiFailureKind.unauthorized,
          code: 'INVALID_CREDENTIALS',
          message: 'revoked',
        );
      final manager = testManager(
        auth,
        StoredSession(
          refreshToken: 'refresh-1',
          refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
        ),
      );
      final provider = _PushProvider(initialToken: 'device-token');
      final gateway = _NotificationGateway();
      final sync = PushSessionSync(
        manager: manager,
        registrar: testRegistrar(provider, gateway),
      );
      sync.attach();

      await manager.bootstrap();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(manager.phase, SessionPhase.expired);
      expect(provider.permissionRequests, 0);
      expect(gateway.registered, isEmpty);
      expect(gateway.removed, isEmpty);
      expect(provider.deleted, isTrue);
      await sync.dispose();
      manager.dispose();
    },
  );

  test('offline bootstrap leaves push state untouched', () async {
    final auth = _AuthGateway(session: testSession())
      ..refreshFailure = const ApiFailure(
        kind: ApiFailureKind.offline,
        code: 'OFFLINE',
        message: 'offline',
      );
    final manager = testManager(
      auth,
      StoredSession(
        refreshToken: 'refresh-1',
        refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
      ),
    );
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway();
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();

    await manager.bootstrap();
    await Future<void>.delayed(const Duration(milliseconds: 50));

    // Transient failure, not a verdict: the session may still be valid.
    expect(manager.phase, SessionPhase.offline);
    expect(provider.permissionRequests, 0);
    expect(gateway.registered, isEmpty);
    expect(gateway.removed, isEmpty);
    expect(provider.deleted, isFalse);
    expect(provider.deleteCalls, 0);
    await sync.dispose();
    manager.dispose();
  });

  test('invalid-state sweep is idempotent', () async {
    final auth = _AuthGateway(session: testSession());
    final manager = testManager(
      auth,
      StoredSession(
        refreshToken: 'refresh-1',
        refreshExpiresAt: DateTime.now().subtract(const Duration(days: 1)),
      ),
    );
    final provider = _PushProvider(initialToken: 'device-token');
    final gateway = _NotificationGateway();
    final sync = PushSessionSync(
      manager: manager,
      registrar: testRegistrar(provider, gateway),
    );
    sync.attach();

    await manager.bootstrap();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(provider.deleteCalls, 1);

    // A repeated terminal notification must not sweep again.
    await manager.sessionExpired();
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(provider.deleteCalls, 1);
    expect(gateway.removed, isEmpty);
    await sync.dispose();
    manager.dispose();
  });
}

const _transient = Object();

class _AuthGateway implements AuthGateway {
  _AuthGateway({required this.session});

  AuthSession session;
  int loginCalls = 0;
  List<String> events = [];
  Object? refreshFailure;

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
  Future<AuthSession> refresh(String refreshToken) async {
    final failure = refreshFailure;
    if (failure != null) throw failure;
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

  /// Mutable so a test can simulate initialization recovering later.
  bool initialized = true;
  int permissionRequests = 0;
  bool deleted = false;
  int deleteCalls = 0;
  final _rotations = StreamController<String>.broadcast();

  void rotate(String next) {
    currentToken = next;
    _rotations.add(next);
  }

  @override
  Future<bool> ensureInitialized() async => initialized;

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
  Stream<PushEnvelope> get onForegroundMessage => const Stream.empty();

  @override
  Stream<PushEnvelope> get onOpenedMessage => const Stream.empty();

  @override
  Future<PushEnvelope?> initialMessage() async => null;

  @override
  Future<void> deleteToken() async {
    deleteCalls += 1;
    deleted = true;
  }
}

class _NotificationGateway implements NotificationGateway {
  _NotificationGateway({this.onRemove});

  final List<String> registered = [];
  final List<String> removed = [];
  final void Function(String id)? onRemove;

  /// Set to fail `POST /devices` without touching anything else.
  Object? registerError;

  @override
  Future<RegisteredDevice> registerDevice(String token) async {
    registered.add(token);
    final error = registerError;
    if (error != null) throw error;
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
